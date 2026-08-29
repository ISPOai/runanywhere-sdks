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

namespace {

using ispo::inference::InferenceCore;
using ispo::inference::LoadOptions;
using ispo::inference::Metrics;

template <typename Callback>
Napi::Value synchronous_callback(const Napi::CallbackInfo& info, Callback&& callback) {
    try {
        return std::forward<Callback>(callback)();
    } catch (const Napi::Error& error) {
        error.ThrowAsJavaScriptException();
    } catch (const std::exception& error) {
        Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
    } catch (...) {
        Napi::Error::New(info.Env(), "local inference adapter failed").ThrowAsJavaScriptException();
    }
    return info.Env().Undefined();
}

class EnvironmentState final {
  public:
    EnvironmentState() = default;
    EnvironmentState(const EnvironmentState&) = delete;
    EnvironmentState& operator=(const EnvironmentState&) = delete;

    InferenceCore& core() {
        std::lock_guard lock(mutex_);
        if (environment_teardown_ || shutdown_in_progress_) {
            throw std::runtime_error("local inference environment is shutting down");
        }
        if (!core_) {
            core_ = std::make_unique<InferenceCore>();
        }
        return *core_;
    }

    void initialize(bool force_cpu) {
        try {
            core().initialize(force_cpu);
        } catch (...) {
            // An initialization failure can leave a partially configured backend.
            // Retire it before allowing the caller to retry with a new core.
            shutdown_core(false);
            throw;
        }
    }

    void queue_stream() {
        std::lock_guard lock(mutex_);
        if (environment_teardown_ || shutdown_in_progress_) {
            throw std::runtime_error("local inference environment is shutting down");
        }
        if (!core_) {
            core_ = std::make_unique<InferenceCore>();
        }
        ++pending_streams_;
    }

    [[nodiscard]] InferenceCore* stream_core() noexcept {
        std::lock_guard lock(mutex_);
        if (environment_teardown_ || shutdown_in_progress_) {
            return nullptr;
        }
        return core_.get();
    }

    void finish_stream() noexcept {
        std::lock_guard lock(mutex_);
        if (pending_streams_ == 0) {
            return;
        }
        --pending_streams_;
        if (pending_streams_ == 0) {
            streams_drained_.notify_all();
        }
    }

    void cancel() noexcept {
        std::lock_guard lock(mutex_);
        if (core_) {
            core_->cancel();
        }
    }

    void shutdown() noexcept { shutdown_core(false); }

    void begin_environment_cleanup(napi_async_cleanup_hook_handle hook) noexcept {
        {
            std::lock_guard lock(mutex_);
            environment_teardown_ = true;
            if (core_) {
                core_->cancel();
            }
        }

        try {
            std::thread([this, hook] {
                shutdown_core(true);
                (void)napi_remove_async_cleanup_hook(hook);
            }).detach();
        } catch (...) {
            // Thread creation is the only expected failure here. The synchronous
            // fallback retains the same ordering and never leaves backend state
            // for C++ static destruction.
            shutdown_core(true);
            (void)napi_remove_async_cleanup_hook(hook);
        }
    }

    void finalize_environment() noexcept { shutdown_core(true); }

  private:
    void shutdown_core(bool permanent) noexcept {
        std::unique_ptr<InferenceCore> retiring_core;
        try {
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
                if (core_) {
                    core_->cancel();
                }
                streams_drained_.wait(lock, [this] { return pending_streams_ == 0; });
                retiring_core = std::move(core_);
            }

            if (retiring_core) {
                try {
                    retiring_core->unload();
                } catch (...) {
                }
                try {
                    retiring_core->shutdown();
                } catch (...) {
                }
            }
        } catch (...) {
            // Node-API cleanup callbacks must not throw across the C boundary.
        }

        {
            std::lock_guard lock(mutex_);
            shutdown_in_progress_ = false;
        }
        shutdown_complete_.notify_all();
    }

    std::mutex mutex_;
    std::condition_variable streams_drained_;
    std::condition_variable shutdown_complete_;
    std::unique_ptr<InferenceCore> core_;
    uint32_t pending_streams_ = 0;
    bool environment_teardown_ = false;
    bool shutdown_in_progress_ = false;
};

void environment_cleanup(napi_async_cleanup_hook_handle hook, void* data) {
    static_cast<EnvironmentState*>(data)->begin_environment_cleanup(hook);
}

void environment_state_finalizer(napi_env, void* data, void*) {
    auto* state = static_cast<EnvironmentState*>(data);
    state->finalize_environment();
    delete state;
}

EnvironmentState& environment_state(Napi::Env env) {
    void* data = nullptr;
    if (napi_get_instance_data(env, &data) != napi_ok || data == nullptr) {
        throw std::runtime_error("local inference environment state is unavailable");
    }
    return *static_cast<EnvironmentState*>(data);
}

Napi::Object metrics_object(Napi::Env env, const Metrics& metrics) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("promptTokens", Napi::Number::New(env, static_cast<double>(metrics.prompt_tokens)));
    result.Set("generatedTokens", Napi::Number::New(env, static_cast<double>(metrics.generated_tokens)));
    result.Set("cancelledGenerations",
               Napi::Number::New(env, static_cast<double>(metrics.cancelled_generations)));
    result.Set("elapsedMs", Napi::Number::New(env, metrics.elapsed_ms));
    result.Set("backend", Napi::String::New(env, ispo::inference::backend_name(metrics.backend)));
    return result;
}

Napi::Object capabilities_object(Napi::Env env) {
    const auto& core = environment_state(env).core();
    Napi::Object result = Napi::Object::New(env);
    result.Set("metalCompiled", Napi::Boolean::New(env, core.metal_compiled()));
    result.Set("metalInitialized", Napi::Boolean::New(env, core.metal_initialized()));
    result.Set("loaded", Napi::Boolean::New(env, core.loaded()));
    result.Set("backend", Napi::String::New(env, ispo::inference::backend_name(core.backend())));
    return result;
}

class StreamWorker final : public Napi::AsyncProgressQueueWorker<std::string> {
  public:
    StreamWorker(Napi::Env env, EnvironmentState& state, std::string prompt, uint32_t max_tokens,
                 Napi::Function on_delta, Napi::Function on_terminal)
        : Napi::AsyncProgressQueueWorker<std::string>(env),
          state_(state),
          prompt_(std::move(prompt)),
          max_tokens_(max_tokens),
          on_delta_(Napi::Persistent(on_delta)),
          on_terminal_(Napi::Persistent(on_terminal)) {}

    ~StreamWorker() override {
        on_delta_.Reset();
        on_terminal_.Reset();
    }

    void Execute(const ExecutionProgress& progress) override {
        InferenceCore* core = nullptr;
        try {
            core = state_.stream_core();
            if (core == nullptr) {
                SetError("local inference stream failed");
            } else {
                core->stream(prompt_, max_tokens_, [&progress](const std::string& delta) {
                    progress.Send(&delta, 1);
                });
                terminal_metrics_ = core->metrics();
            }
        } catch (...) {
            if (core != nullptr) {
                try {
                    terminal_metrics_ = core->metrics();
                } catch (...) {
                }
            }
            SetError("local inference stream failed");
        }
        finish_stream_once();
    }

    void OnWorkComplete(Napi::Env env, napi_status status) override {
        // A queued worker may be cancelled before Execute starts. Balance the
        // environment lease in either path so teardown cannot wait forever.
        finish_stream_once();
        Napi::AsyncProgressQueueWorker<std::string>::OnWorkComplete(env, status);
    }

    void OnProgress(const std::string* deltas, size_t count) override {
        const Napi::Env env = on_delta_.Env();
        for (size_t index = 0; index < count; ++index) {
            on_delta_.Call({Napi::String::New(env, deltas[index])});
        }
    }

    void OnOK() override {
        const Napi::Env env = on_terminal_.Env();
        on_terminal_.Call({env.Null(), metrics_object(env, terminal_metrics_)});
    }

    void OnError(const Napi::Error&) override {
        const Napi::Env env = on_terminal_.Env();
        on_terminal_.Call(
            {Napi::String::New(env, "local inference stream failed"), metrics_object(env, terminal_metrics_)});
    }

  private:
    void finish_stream_once() noexcept {
        bool expected = false;
        if (stream_finished_.compare_exchange_strong(expected, true)) {
            state_.finish_stream();
        }
    }

    EnvironmentState& state_;
    std::string prompt_;
    uint32_t max_tokens_;
    Napi::FunctionReference on_delta_;
    Napi::FunctionReference on_terminal_;
    std::atomic<bool> stream_finished_{false};
    Metrics terminal_metrics_;
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
    return synchronous_callback(info, [&info] { return capabilities_object(info.Env()); });
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
        environment_state(info.Env()).core().load_exact_local_model(
            info[0].As<Napi::String>().Utf8Value(), load_options);
        return capabilities_object(info.Env());
    });
}

Napi::Value Complete(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        require_string(info, 0, "complete(prompt, options?)");
        const uint32_t max_tokens = uint_option(options(info, 1), "maxTokens", 32);
        return Napi::String::New(
            info.Env(), environment_state(info.Env()).core().complete(
                            info[0].As<Napi::String>().Utf8Value(), max_tokens));
    });
}

Napi::Value Stream(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        require_string(info, 0, "stream(prompt, options, onDelta, onTerminal)");
        if (info.Length() < 4 || !info[2].IsFunction() || !info[3].IsFunction()) {
            throw Napi::TypeError::New(info.Env(),
                                       "stream(prompt, options, onDelta, onTerminal) requires callbacks");
        }
        const uint32_t max_tokens = uint_option(options(info, 1), "maxTokens", 32);
        auto& state = environment_state(info.Env());
        state.queue_stream();
        try {
            auto worker = std::make_unique<StreamWorker>(
                info.Env(), state, info[0].As<Napi::String>().Utf8Value(), max_tokens,
                info[2].As<Napi::Function>(), info[3].As<Napi::Function>());
            worker->Queue();
            worker.release();
        } catch (...) {
            state.finish_stream();
            throw;
        }
        return info.Env().Undefined();
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
        environment_state(info.Env()).core().unload();
        return info.Env().Undefined();
    });
}

Napi::Value Metrics(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        return metrics_object(info.Env(), environment_state(info.Env()).core().metrics());
    });
}

Napi::Value Reset(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        environment_state(info.Env()).core().reset();
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
    auto state = std::make_unique<EnvironmentState>();
    if (napi_set_instance_data(env, state.get(), environment_state_finalizer, nullptr) != napi_ok) {
        Napi::Error::New(env, "failed to allocate local inference environment state")
            .ThrowAsJavaScriptException();
        return exports;
    }
    EnvironmentState* const registered_state = state.release();
    if (napi_add_async_cleanup_hook(env, environment_cleanup, registered_state, nullptr) != napi_ok) {
        registered_state->shutdown();
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
    exports.Set("metrics", Napi::Function::New(env, Metrics));
    exports.Set("reset", Napi::Function::New(env, Reset));
    exports.Set("shutdown", Napi::Function::New(env, Shutdown));
    return exports;
}

}  // namespace

NODE_API_MODULE(ispo_local_inference_native, Register)
