#include <napi.h>

#include <cmath>
#include <cstdint>
#include <memory>
#include <string>

#include "inference_core.h"

namespace {

using ispo::inference::InferenceCore;
using ispo::inference::LoadOptions;

std::unique_ptr<InferenceCore> g_core;

InferenceCore& core() {
    if (!g_core) {
        g_core = std::make_unique<InferenceCore>();
    }
    return *g_core;
}

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
    const Napi::Object config = options(info, 0);
    core().initialize(boolean_option(config, "forceCpu", false));
    return info.Env().Undefined();
}

Napi::Value Capabilities(const Napi::CallbackInfo& info) {
    Napi::Object result = Napi::Object::New(info.Env());
    result.Set("metalCompiled", Napi::Boolean::New(info.Env(), core().metal_compiled()));
    result.Set("loaded", Napi::Boolean::New(info.Env(), core().loaded()));
    result.Set("backend", Napi::String::New(info.Env(), ispo::inference::backend_name(core().backend())));
    return result;
}

Napi::Value LoadExactLocalModel(const Napi::CallbackInfo& info) {
    require_string(info, 0, "loadExactLocalModel(absoluteGgufPath, options?)");
    const Napi::Object config = options(info, 1);
    LoadOptions load_options;
    load_options.context_tokens = uint_option(config, "contextTokens", 512);
    load_options.threads = static_cast<int32_t>(uint_option(config, "threads", 0));
    load_options.force_cpu = boolean_option(config, "forceCpu", false);
    core().load_exact_local_model(info[0].As<Napi::String>().Utf8Value(), load_options);
    return Capabilities(info);
}

Napi::Value Complete(const Napi::CallbackInfo& info) {
    require_string(info, 0, "complete(prompt, options?)");
    const uint32_t max_tokens = uint_option(options(info, 1), "maxTokens", 32);
    return Napi::String::New(info.Env(), core().complete(info[0].As<Napi::String>().Utf8Value(), max_tokens));
}

Napi::Value Stream(const Napi::CallbackInfo& info) {
    require_string(info, 0, "stream(prompt, options, onDelta)");
    if (info.Length() < 3 || !info[2].IsFunction()) {
        throw Napi::TypeError::New(info.Env(), "stream(prompt, options, onDelta) requires a callback");
    }
    const uint32_t max_tokens = uint_option(options(info, 1), "maxTokens", 32);
    const Napi::Function callback = info[2].As<Napi::Function>();
    core().stream(info[0].As<Napi::String>().Utf8Value(), max_tokens,
                  [&callback](const std::string& delta) { callback.Call({Napi::String::New(callback.Env(), delta)}); });
    return info.Env().Undefined();
}

Napi::Value Cancel(const Napi::CallbackInfo& info) {
    core().cancel();
    return info.Env().Undefined();
}

Napi::Value Unload(const Napi::CallbackInfo& info) {
    core().unload();
    return info.Env().Undefined();
}

Napi::Value Metrics(const Napi::CallbackInfo& info) {
    const auto metrics = core().metrics();
    Napi::Object result = Napi::Object::New(info.Env());
    result.Set("promptTokens", Napi::Number::New(info.Env(), static_cast<double>(metrics.prompt_tokens)));
    result.Set("generatedTokens", Napi::Number::New(info.Env(), static_cast<double>(metrics.generated_tokens)));
    result.Set("cancelledGenerations",
               Napi::Number::New(info.Env(), static_cast<double>(metrics.cancelled_generations)));
    result.Set("elapsedMs", Napi::Number::New(info.Env(), metrics.elapsed_ms));
    result.Set("backend", Napi::String::New(info.Env(), ispo::inference::backend_name(metrics.backend)));
    return result;
}

Napi::Value Reset(const Napi::CallbackInfo& info) {
    core().reset();
    return info.Env().Undefined();
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    if (g_core) {
        g_core->shutdown();
        g_core.reset();
    }
    return info.Env().Undefined();
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
