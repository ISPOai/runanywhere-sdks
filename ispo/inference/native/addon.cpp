#include <napi.h>

#include <atomic>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

#include "inference_core.h"
#include "metal-executor-scope.h"

namespace {

using ispo::inference::InferenceCore;
using ispo::inference::LoadOptions;
using ispo::inference::Metrics;
using ispo::inference::StreamSession;
using ispo::inference::StreamStep;

template <typename Callback>
Napi::Value synchronous_callback(const Napi::CallbackInfo& info, Callback&& callback) {
    try {
        return std::forward<Callback>(callback)();
    } catch (const Napi::Error& error) {
        error.ThrowAsJavaScriptException();
    } catch (const std::exception&) {
        Napi::Error::New(info.Env(), "local inference operation failed").ThrowAsJavaScriptException();
    } catch (...) {
        Napi::Error::New(info.Env(), "local inference adapter failed").ThrowAsJavaScriptException();
    }
    return info.Env().Undefined();
}

class EnvironmentState final {
  public:
    enum class NextLease { kQueued, kDuplicate, kTerminal };

    EnvironmentState() = default;
    ~EnvironmentState() { stop_generation_executor(); }
    EnvironmentState(const EnvironmentState&) = delete;
    EnvironmentState& operator=(const EnvironmentState&) = delete;

    InferenceCore& core() {
        std::lock_guard lock(mutex_);
        if (environment_teardown_ || shutdown_in_progress_) {
            throw std::runtime_error("local inference environment is shutting down");
        }
        if (!core_) {
            core_ = std::make_shared<InferenceCore>();
        }
        return *core_;
    }

    void initialize(bool force_cpu) {
        try {
            ispo::inference::initialize_in_metal_autorelease_scope(core(), force_cpu);
        } catch (...) {
            shutdown_core(false);
            throw;
        }
    }

    [[nodiscard]] std::shared_ptr<StreamSession> start_stream(const std::string& prompt,
                                                                uint32_t max_tokens) {
        return core().start_stream(prompt, max_tokens);
    }

    [[nodiscard]] NextLease acquire_next(const std::shared_ptr<StreamSession>& stream) {
        std::lock_guard lock(mutex_);
        if (environment_teardown_ || shutdown_in_progress_) {
            stream->request_cancel();
            return NextLease::kTerminal;
        }
        switch (stream->acquire_demand()) {
            case StreamSession::Demand::kAccepted:
                ++pending_nexts_;
                return NextLease::kQueued;
            case StreamSession::Demand::kDuplicate:
                return NextLease::kDuplicate;
            case StreamSession::Demand::kTerminal:
                return NextLease::kTerminal;
        }
        return NextLease::kTerminal;
    }

    [[nodiscard]] StreamStep execute_next(const std::shared_ptr<StreamSession>& stream) noexcept {
        std::shared_ptr<InferenceCore> active_core;
        {
            std::lock_guard lock(mutex_);
            active_core = core_;
        }
        if (active_core == nullptr) {
            stream->request_cancel();
            return stream->terminal_step();
        }

        try {
            auto request = std::make_shared<GenerationRequest>(
                GenerationRequest{.core = std::move(active_core), .stream = stream});
            std::unique_lock lock(generation_executor_mutex_);
            if (generation_executor_stopping_) {
                stream->request_cancel();
                return stream->terminal_step();
            }
            ensure_generation_executor_locked();
            generation_request_ = request;
            generation_executor_ready_.notify_one();
            generation_executor_done_.wait(lock, [&request] { return request->complete; });
            return request->result;
        } catch (...) {
            stream->request_cancel();
            return stream->terminal_step();
        }
    }

    void finish_next() noexcept {
        std::lock_guard lock(mutex_);
        if (pending_nexts_ == 0) {
            return;
        }
        --pending_nexts_;
        if (pending_nexts_ == 0) {
            nexts_drained_.notify_all();
        }
    }

    void cancel() noexcept {
        std::shared_ptr<InferenceCore> active_core;
        {
            std::lock_guard lock(mutex_);
            active_core = core_;
        }
        if (active_core != nullptr) {
            ispo::inference::cancel_in_metal_autorelease_scope(*active_core);
        }
    }

    void abandon_stream(const std::shared_ptr<StreamSession>& stream) noexcept {
        std::shared_ptr<InferenceCore> active_core;
        {
            std::lock_guard lock(mutex_);
            active_core = core_;
        }
        if (active_core != nullptr) {
            ispo::inference::abandon_stream_in_metal_autorelease_scope(*active_core, stream);
        } else {
            stream->request_cancel();
        }
    }

    void unload() noexcept {
        with_existing_core([](InferenceCore& core) {
            ispo::inference::unload_in_metal_autorelease_scope(core);
        });
    }

    void reset() noexcept {
        with_existing_core([](InferenceCore& core) {
            ispo::inference::reset_in_metal_autorelease_scope(core);
        });
    }

    [[nodiscard]] Metrics metrics() const {
        std::lock_guard lock(mutex_);
        return core_ ? core_->metrics() : Metrics{};
    }

    void shutdown() noexcept { shutdown_core(false); }

    void begin_environment_cleanup(napi_async_cleanup_hook_handle hook) noexcept {
        // The Node-API cleanup-handle destructor schedules work on the owning
        // environment. Calling it from a detached native thread races Node's
        // environment teardown on ordinary process exit. The worker lease is
        // released from Execute(), before its JavaScript completion callback,
        // so draining here does not require the event loop to re-enter JS.
        shutdown_core(true);
        (void)napi_remove_async_cleanup_hook(hook);
    }

    void finalize_environment() noexcept { shutdown_core(true); }

  private:
    template <typename Callback>
    void with_existing_core(Callback&& callback) noexcept {
        std::shared_ptr<InferenceCore> active_core;
        {
            std::lock_guard lock(mutex_);
            if (environment_teardown_ || shutdown_in_progress_) {
                return;
            }
            active_core = core_;
        }
        if (active_core == nullptr) {
            return;
        }
        try {
            std::forward<Callback>(callback)(*active_core);
        } catch (...) {
        }
    }

    void shutdown_core(bool permanent) noexcept {
        std::shared_ptr<InferenceCore> active_core;
        {
            std::unique_lock lock(mutex_);
            if (permanent) {
                environment_teardown_ = true;
            }
            if (shutdown_in_progress_) {
                shutdown_complete_.wait(lock, [this] { return !shutdown_in_progress_; });
                return;
            }
            shutdown_in_progress_ = true;
            active_core = core_;
        }

        if (active_core != nullptr) {
            ispo::inference::cancel_in_metal_autorelease_scope(*active_core);
        }

        std::shared_ptr<InferenceCore> retiring_core;
        {
            std::unique_lock lock(mutex_);
            nexts_drained_.wait(lock, [this] { return pending_nexts_ == 0; });
            retiring_core = std::move(core_);
        }

        if (retiring_core) {
            // All queued demand work has settled before this point. Joining the
            // executor first makes the Metal worker affinity explicit and
            // prevents a fresh libuv worker from retaining another per-thread
            // Metal/Objective-C cache while model resources are released.
            stop_generation_executor();
            try {
                ispo::inference::unload_in_metal_autorelease_scope(*retiring_core);
            } catch (...) {
            }
            try {
                ispo::inference::shutdown_in_metal_autorelease_scope(*retiring_core);
            } catch (...) {
            }
        }

        {
            std::lock_guard lock(mutex_);
            shutdown_in_progress_ = false;
        }
        shutdown_complete_.notify_all();
    }

    struct GenerationRequest final {
        std::shared_ptr<InferenceCore> core;
        std::shared_ptr<StreamSession> stream;
        StreamStep result;
        bool complete = false;
    };

    void ensure_generation_executor_locked() {
        if (generation_executor_.joinable()) {
            return;
        }
        generation_executor_stopping_ = false;
        generation_executor_ = std::thread([this] { run_generation_executor(); });
    }

    void run_generation_executor() noexcept {
        while (true) {
            std::shared_ptr<GenerationRequest> request;
            {
                std::unique_lock lock(generation_executor_mutex_);
                generation_executor_ready_.wait(lock, [this] {
                    return generation_executor_stopping_ || generation_request_ != nullptr;
                });
                if (generation_executor_stopping_) {
                    return;
                }
                request = std::move(generation_request_);
            }

            StreamStep result;
            try {
                result = ispo::inference::execute_next_in_metal_autorelease_scope(
                    *request->core, request->stream);
            } catch (...) {
                request->stream->request_cancel();
                result = request->stream->terminal_step();
            }

            {
                std::lock_guard lock(generation_executor_mutex_);
                request->result = std::move(result);
                request->complete = true;
            }
            generation_executor_done_.notify_all();
        }
    }

    void stop_generation_executor() noexcept {
        std::thread executor;
        {
            std::lock_guard lock(generation_executor_mutex_);
            if (!generation_executor_.joinable()) {
                return;
            }
            generation_executor_stopping_ = true;
            generation_executor_ready_.notify_one();
            executor = std::move(generation_executor_);
        }
        executor.join();
        {
            std::lock_guard lock(generation_executor_mutex_);
            generation_executor_stopping_ = false;
        }
    }

    mutable std::mutex mutex_;
    std::condition_variable nexts_drained_;
    std::condition_variable shutdown_complete_;
    std::shared_ptr<InferenceCore> core_;
    uint32_t pending_nexts_ = 0;
    bool environment_teardown_ = false;
    bool shutdown_in_progress_ = false;
    std::mutex generation_executor_mutex_;
    std::condition_variable generation_executor_ready_;
    std::condition_variable generation_executor_done_;
    std::shared_ptr<GenerationRequest> generation_request_;
    std::thread generation_executor_;
    bool generation_executor_stopping_ = false;
};

void environment_cleanup(napi_async_cleanup_hook_handle hook, void* data) {
    static_cast<EnvironmentState*>(data)->begin_environment_cleanup(hook);
}

void environment_state_finalizer(napi_env, void* data, void*) {
    auto* state = static_cast<std::shared_ptr<EnvironmentState>*>(data);
    (*state)->finalize_environment();
    delete state;
}

EnvironmentState& environment_state(Napi::Env env) {
    void* data = nullptr;
    if (napi_get_instance_data(env, &data) != napi_ok || data == nullptr) {
        throw std::runtime_error("local inference environment state is unavailable");
    }
    return **static_cast<std::shared_ptr<EnvironmentState>*>(data);
}

std::shared_ptr<EnvironmentState> environment_state_ptr(Napi::Env env) {
    void* data = nullptr;
    if (napi_get_instance_data(env, &data) != napi_ok || data == nullptr) {
        throw std::runtime_error("local inference environment state is unavailable");
    }
    return *static_cast<std::shared_ptr<EnvironmentState>*>(data);
}

Napi::Object metrics_object(Napi::Env env, const Metrics& metrics) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("promptTokens", Napi::Number::New(env, static_cast<double>(metrics.prompt_tokens)));
    result.Set("outputTokens", Napi::Number::New(env, static_cast<double>(metrics.output_tokens)));
    // Retained for Phase 1 callers; outputTokens is the explicit pull-stream contract.
    result.Set("generatedTokens", Napi::Number::New(env, static_cast<double>(metrics.generated_tokens)));
    result.Set("cancelledGenerations",
               Napi::Number::New(env, static_cast<double>(metrics.cancelled_generations)));
    result.Set("elapsedMs", Napi::Number::New(env, metrics.elapsed_ms));
    result.Set("ttftMs", metrics.has_first_token ? Napi::Number::New(env, metrics.ttft_ms)
                                                   : env.Null());
    result.Set("decodeMs", Napi::Number::New(env, metrics.decode_ms));
    result.Set("backend", Napi::String::New(env, ispo::inference::backend_name(metrics.backend)));
    result.Set("cancelled", Napi::Boolean::New(env, metrics.cancelled));
    result.Set("finishReason",
               Napi::String::New(env, ispo::inference::finish_reason_name(metrics.finish_reason)));
    return result;
}

Napi::Object stream_step_object(Napi::Env env, const StreamStep& step) {
    Napi::Object result = Napi::Object::New(env);
    if (step.type == StreamStep::Type::kDelta) {
        result.Set("type", Napi::String::New(env, "delta"));
        result.Set("delta", Napi::String::New(env, step.delta));
        return result;
    }
    result.Set("type", Napi::String::New(env, "terminal"));
    result.Set("finishReason",
               Napi::String::New(env, ispo::inference::finish_reason_name(step.metrics.finish_reason)));
    result.Set("metrics", metrics_object(env, step.metrics));
    return result;
}

class NextWorker final : public Napi::AsyncWorker {
  public:
    NextWorker(Napi::Env env, std::shared_ptr<EnvironmentState> state,
               std::shared_ptr<StreamSession> stream, Napi::Promise::Deferred deferred)
        : Napi::AsyncWorker(env),
          state_(std::move(state)),
          stream_(std::move(stream)),
          deferred_(deferred) {}

    void Execute() override {
        try {
            result_ = state_->execute_next(stream_);
        } catch (...) {
            result_ = stream_->terminal_step();
        }
        finish_once();
    }

    void OnWorkComplete(Napi::Env env, napi_status) override {
        finish_once();
        // A cancellation can race a completed worker before libuv delivers this
        // completion callback on the JavaScript thread. Never publish the stale
        // delta in that window: the one terminal state is authoritative.
        if (result_.type == StreamStep::Type::kDelta && stream_->cancellation_requested()) {
            result_ = stream_->terminal_step();
        }
        deferred_.Resolve(stream_step_object(env, result_));
    }

  private:
    void finish_once() noexcept {
        bool expected = false;
        if (finished_.compare_exchange_strong(expected, true)) {
            state_->finish_next();
        }
    }

    std::shared_ptr<EnvironmentState> state_;
    std::shared_ptr<StreamSession> stream_;
    Napi::Promise::Deferred deferred_;
    std::atomic<bool> finished_{false};
    StreamStep result_;
};

struct StreamBinding {
    std::shared_ptr<EnvironmentState> environment;
    std::shared_ptr<StreamSession> stream;
};

class PullStreamHandle final : public Napi::ObjectWrap<PullStreamHandle> {
  public:
    explicit PullStreamHandle(const Napi::CallbackInfo& info) : Napi::ObjectWrap<PullStreamHandle>(info) {
        if (info.Length() != 1 || !info[0].IsExternal()) {
            throw Napi::TypeError::New(info.Env(), "local inference stream cannot be constructed directly");
        }
        std::unique_ptr<StreamBinding> binding(
            info[0].As<Napi::External<StreamBinding>>().Data());
        if (!binding || !binding->environment || !binding->stream) {
            throw Napi::Error::New(info.Env(), "local inference stream is unavailable");
        }
        environment_ = std::move(binding->environment);
        stream_ = std::move(binding->stream);
    }

    ~PullStreamHandle() override = default;

    static Napi::Object New(Napi::Env env, std::shared_ptr<EnvironmentState> environment,
                            std::shared_ptr<StreamSession> stream) {
        auto binding = std::make_unique<StreamBinding>(
            StreamBinding{.environment = std::move(environment), .stream = std::move(stream)});
        Napi::Function constructor = DefineClass(
            env, "InternalPullStream", {InstanceMethod<&PullStreamHandle::Next>("next")});
        Napi::Object object = constructor.New(
            {Napi::External<StreamBinding>::New(env, binding.get())});
        (void)binding.release();
        return object;
    }

    void Finalize(Napi::Env) override {
        if (environment_ && stream_) {
            environment_->abandon_stream(stream_);
        }
        stream_.reset();
        environment_.reset();
    }

  private:
    Napi::Value Next(const Napi::CallbackInfo& info) {
        const Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(info.Env());
        if (info.Length() != 0) {
            deferred.Reject(
                Napi::TypeError::New(info.Env(), "local inference stream next accepts no arguments").Value());
            return deferred.Promise();
        }
        if (!environment_ || !stream_) {
            deferred.Reject(Napi::Error::New(info.Env(), "local inference stream is unavailable").Value());
            return deferred.Promise();
        }

        const EnvironmentState::NextLease lease = environment_->acquire_next(stream_);
        if (lease == EnvironmentState::NextLease::kTerminal) {
            deferred.Resolve(stream_step_object(info.Env(), stream_->terminal_step()));
            return deferred.Promise();
        }
        if (lease == EnvironmentState::NextLease::kDuplicate) {
            deferred.Reject(Napi::Error::New(info.Env(), "local inference stream next is already pending").Value());
            return deferred.Promise();
        }

        try {
            auto* worker = new NextWorker(info.Env(), environment_, stream_, deferred);
            worker->Queue();
        } catch (...) {
            environment_->finish_next();
            deferred.Reject(Napi::Error::New(info.Env(), "local inference stream could not start").Value());
        }
        return deferred.Promise();
    }

    std::shared_ptr<EnvironmentState> environment_;
    std::shared_ptr<StreamSession> stream_;
};

Napi::Object options(const Napi::CallbackInfo& info, size_t index) {
    if (info.Length() <= index || info[index].IsUndefined()) {
        return Napi::Object::New(info.Env());
    }
    if (!info[index].IsObject()) {
        throw Napi::TypeError::New(info.Env(), "options must be an object");
    }
    return info[index].As<Napi::Object>();
}

bool boolean_option(const Napi::Object& object, const char* key, bool fallback) {
    const Napi::Value value = object.Get(key);
    if (value.IsUndefined()) {
        return fallback;
    }
    if (!value.IsBoolean()) {
        throw Napi::TypeError::New(object.Env(), std::string(key) + " must be a boolean");
    }
    return value.As<Napi::Boolean>().Value();
}

uint32_t uint_option(const Napi::Object& object, const char* key, uint32_t fallback) {
    const Napi::Value value = object.Get(key);
    if (value.IsUndefined()) {
        return fallback;
    }
    if (!value.IsNumber()) {
        throw Napi::TypeError::New(object.Env(), std::string(key) + " must be a number");
    }
    const double raw = value.As<Napi::Number>().DoubleValue();
    if (raw < 0 || raw > UINT32_MAX || std::floor(raw) != raw) {
        throw Napi::RangeError::New(object.Env(), std::string(key) + " must be an unsigned integer");
    }
    return static_cast<uint32_t>(raw);
}

void require_string(const Napi::CallbackInfo& info, size_t index, const char* signature) {
    if (info.Length() <= index || !info[index].IsString()) {
        throw Napi::TypeError::New(info.Env(), signature);
    }
}

Napi::Value Initialize(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        const Napi::Object config = options(info, 0);
        environment_state(info.Env()).initialize(boolean_option(config, "forceCpu", false));
        return info.Env().Undefined();
    });
}

Napi::Value Capabilities(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        const auto& core = environment_state(info.Env()).core();
        Napi::Object result = Napi::Object::New(info.Env());
        result.Set("metalCompiled", Napi::Boolean::New(info.Env(), core.metal_compiled()));
        result.Set("metalInitialized", Napi::Boolean::New(info.Env(), core.metal_initialized()));
        result.Set("loaded", Napi::Boolean::New(info.Env(), core.loaded()));
        result.Set("backend", Napi::String::New(info.Env(), ispo::inference::backend_name(core.backend())));
        return result;
    });
}

Napi::Value LoadExactLocalModel(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        require_string(info, 0, "loadExactLocalModel(absoluteGgufPath, options?)");
        const Napi::Object config = options(info, 1);
        LoadOptions load_options;
        load_options.context_tokens = uint_option(config, "contextTokens", 512);
        load_options.threads = static_cast<int32_t>(uint_option(config, "threads", 0));
        load_options.force_cpu = boolean_option(config, "forceCpu", false);
        load_options.inject_metal_failure_for_test =
            boolean_option(config, "injectMetalFailureForTest", false);
        ispo::inference::load_in_metal_autorelease_scope(
            environment_state(info.Env()).core(), info[0].As<Napi::String>().Utf8Value(), load_options);
        return Capabilities(info).As<Napi::Object>();
    });
}

Napi::Value Complete(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        require_string(info, 0, "complete(prompt, options?)");
        const uint32_t max_tokens = uint_option(options(info, 1), "maxTokens", 32);
        return Napi::String::New(
            info.Env(), ispo::inference::complete_in_metal_autorelease_scope(
                            environment_state(info.Env()).core(), info[0].As<Napi::String>().Utf8Value(),
                            max_tokens));
    });
}

Napi::Value Stream(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        require_string(info, 0, "stream(prompt, options?)");
        if (info.Length() > 2) {
            throw Napi::TypeError::New(info.Env(), "stream(prompt, options?)");
        }
        const uint32_t max_tokens = uint_option(options(info, 1), "maxTokens", 32);
        const auto environment = environment_state_ptr(info.Env());
        const auto stream = environment->start_stream(info[0].As<Napi::String>().Utf8Value(), max_tokens);
        return PullStreamHandle::New(info.Env(), environment, stream);
    });
}

Napi::Value Cancel(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        environment_state(info.Env()).cancel();
        return info.Env().Undefined();
    });
}

Napi::Value Unload(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        environment_state(info.Env()).unload();
        return info.Env().Undefined();
    });
}

Napi::Value MetricsMethod(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        return metrics_object(info.Env(), environment_state(info.Env()).metrics());
    });
}

Napi::Value Reset(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        environment_state(info.Env()).reset();
        return info.Env().Undefined();
    });
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        environment_state(info.Env()).shutdown();
        return info.Env().Undefined();
    });
}

Napi::Object Register(Napi::Env env, Napi::Object exports) {
    auto state = std::make_shared<EnvironmentState>();
    auto* state_holder = new std::shared_ptr<EnvironmentState>(std::move(state));
    if (napi_set_instance_data(env, state_holder, environment_state_finalizer, nullptr) != napi_ok) {
        delete state_holder;
        Napi::Error::New(env, "failed to allocate local inference environment state")
            .ThrowAsJavaScriptException();
        return exports;
    }
    if (napi_add_async_cleanup_hook(env, environment_cleanup, state_holder->get(), nullptr) != napi_ok) {
        (*state_holder)->shutdown();
        Napi::Error::New(env, "failed to register local inference cleanup hook")
            .ThrowAsJavaScriptException();
        return exports;
    }

    exports.Set("initialize", Napi::Function::New(env, Initialize));
    exports.Set("capabilities", Napi::Function::New(env, Capabilities));
    exports.Set("loadExactLocalModel", Napi::Function::New(env, LoadExactLocalModel));
    exports.Set("complete", Napi::Function::New(env, Complete));
    exports.Set("stream", Napi::Function::New(env, Stream));
    exports.Set("cancel", Napi::Function::New(env, Cancel));
    exports.Set("unload", Napi::Function::New(env, Unload));
    exports.Set("metrics", Napi::Function::New(env, MetricsMethod));
    exports.Set("reset", Napi::Function::New(env, Reset));
    exports.Set("shutdown", Napi::Function::New(env, Shutdown));
    return exports;
}

}  // namespace

NODE_API_MODULE(ispo_local_inference_native, Register)
