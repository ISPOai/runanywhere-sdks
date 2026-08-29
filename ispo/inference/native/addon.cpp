#include <napi.h>

#include <cmath>
#include <cstdint>
#include <memory>
#include <string>
#include <utility>

#include "inference_core.h"

namespace {

using ispo::inference::InferenceCore;
using ispo::inference::LoadOptions;

std::unique_ptr<InferenceCore> g_core;

InferenceCore& core();

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

Napi::Object metrics_object(Napi::Env env) {
    const auto metrics = core().metrics();
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
    Napi::Object result = Napi::Object::New(env);
    result.Set("metalCompiled", Napi::Boolean::New(env, core().metal_compiled()));
    result.Set("metalInitialized", Napi::Boolean::New(env, core().metal_initialized()));
    result.Set("loaded", Napi::Boolean::New(env, core().loaded()));
    result.Set("backend", Napi::String::New(env, ispo::inference::backend_name(core().backend())));
    return result;
}

InferenceCore& core() {
    if (!g_core) {
        g_core = std::make_unique<InferenceCore>();
    }
    return *g_core;
}

class StreamWorker final : public Napi::AsyncProgressQueueWorker<std::string> {
  public:
    StreamWorker(Napi::Env env, InferenceCore& inference_core, std::string prompt, uint32_t max_tokens,
                 Napi::Function on_delta, Napi::Function on_terminal)
        : Napi::AsyncProgressQueueWorker<std::string>(env),
          inference_core_(inference_core),
          prompt_(std::move(prompt)),
          max_tokens_(max_tokens),
          on_delta_(Napi::Persistent(on_delta)),
          on_terminal_(Napi::Persistent(on_terminal)) {}

    ~StreamWorker() override {
        on_delta_.Reset();
        on_terminal_.Reset();
    }

    void Execute(const ExecutionProgress& progress) override {
        try {
            inference_core_.stream(prompt_, max_tokens_, [&progress](const std::string& delta) {
                progress.Send(&delta, 1);
            });
        } catch (const std::exception&) {
            SetError("local inference stream failed");
        }
    }

    void OnProgress(const std::string* deltas, size_t count) override {
        const Napi::Env env = on_delta_.Env();
        for (size_t index = 0; index < count; ++index) {
            on_delta_.Call({Napi::String::New(env, deltas[index])});
        }
    }

    void OnOK() override {
        const Napi::Env env = on_terminal_.Env();
        on_terminal_.Call({env.Null(), metrics_object(env)});
    }

    void OnError(const Napi::Error&) override {
        const Napi::Env env = on_terminal_.Env();
        on_terminal_.Call({Napi::String::New(env, "local inference stream failed"), metrics_object(env)});
    }

  private:
    InferenceCore& inference_core_;
    std::string prompt_;
    uint32_t max_tokens_;
    Napi::FunctionReference on_delta_;
    Napi::FunctionReference on_terminal_;
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
        core().initialize(boolean_option(config, "forceCpu", false));
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
        core().load_exact_local_model(info[0].As<Napi::String>().Utf8Value(), load_options);
        return capabilities_object(info.Env());
    });
}

Napi::Value Complete(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        require_string(info, 0, "complete(prompt, options?)");
        const uint32_t max_tokens = uint_option(options(info, 1), "maxTokens", 32);
        return Napi::String::New(
            info.Env(), core().complete(info[0].As<Napi::String>().Utf8Value(), max_tokens));
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
        auto worker = std::make_unique<StreamWorker>(
            info.Env(), core(), info[0].As<Napi::String>().Utf8Value(), max_tokens,
            info[2].As<Napi::Function>(), info[3].As<Napi::Function>());
        worker->Queue();
        worker.release();
        return info.Env().Undefined();
    });
}

Napi::Value Cancel(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        core().cancel();
        return info.Env().Undefined();
    });
}

Napi::Value Unload(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        core().unload();
        return info.Env().Undefined();
    });
}

Napi::Value Metrics(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] { return metrics_object(info.Env()); });
}

Napi::Value Reset(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        core().reset();
        return info.Env().Undefined();
    });
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    return synchronous_callback(info, [&info] {
        if (g_core) {
            g_core->shutdown();
            g_core.reset();
        }
        return info.Env().Undefined();
    });
}

Napi::Object Register(Napi::Env env, Napi::Object exports) {
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
