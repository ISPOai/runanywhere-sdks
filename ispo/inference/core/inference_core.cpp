#include "inference_core.h"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <stdexcept>
#include <utility>
#include <vector>

#include "ggml-backend.h"
#include "llama.h"

namespace ispo::inference {
namespace {

constexpr uint32_t kMaximumContextTokens = 4096;
constexpr uint32_t kMaximumGeneratedTokens = 256;

bool metal_is_compiled() {
    return ggml_backend_reg_by_name("MTL") != nullptr;
}

bool probe_metal_backend() {
    const ggml_backend_dev_t device = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU);
    if (device == nullptr) {
        return false;
    }
    ggml_backend_t probe = ggml_backend_dev_init(device, nullptr);
    if (probe == nullptr) {
        return false;
    }
    ggml_backend_free(probe);
    return true;
}

std::vector<llama_token> tokenize(const llama_vocab* vocab, const std::string& prompt) {
    const int token_count =
        -llama_tokenize(vocab, prompt.data(), static_cast<int32_t>(prompt.size()), nullptr, 0, true, true);
    if (token_count <= 0) {
        throw std::runtime_error("prompt tokenization failed");
    }
    std::vector<llama_token> tokens(static_cast<size_t>(token_count));
    if (llama_tokenize(vocab, prompt.data(), static_cast<int32_t>(prompt.size()), tokens.data(),
                       static_cast<int32_t>(tokens.size()), true, true) < 0) {
        throw std::runtime_error("prompt tokenization failed");
    }
    return tokens;
}

std::string token_piece(const llama_vocab* vocab, llama_token token) {
    std::vector<char> buffer(256);
    int size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, true);
    if (size < 0) {
        buffer.resize(static_cast<size_t>(-size));
        size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, true);
    }
    if (size < 0) {
        throw std::runtime_error("token conversion failed");
    }
    return {buffer.data(), static_cast<size_t>(size)};
}

}  // namespace

const char* backend_name(Backend backend) {
    return backend == Backend::kMetal ? "metal" : "cpu-accelerate";
}

InferenceCore::InferenceCore() = default;

InferenceCore::~InferenceCore() { shutdown(); }

void InferenceCore::initialize(bool force_cpu) {
    std::lock_guard lock(mutex_);
    if (!backend_initialized_) {
        llama_backend_init();
        backend_initialized_ = true;
    }
    force_cpu_ = force_cpu;
    metal_probe_succeeded_ = !force_cpu_ && metal_is_compiled() && probe_metal_backend();
}

bool InferenceCore::metal_compiled() const {
    std::lock_guard lock(mutex_);
    return backend_initialized_ && metal_is_compiled();
}

bool InferenceCore::metal_initialized() const {
    std::lock_guard lock(mutex_);
    return metal_probe_succeeded_;
}

bool InferenceCore::loaded() const {
    std::lock_guard lock(mutex_);
    return model_ != nullptr && context_ != nullptr && sampler_ != nullptr;
}

Backend InferenceCore::backend() const {
    std::lock_guard lock(mutex_);
    return backend_;
}

void InferenceCore::load_exact_local_model(const std::string& path, const LoadOptions& options) {
    const std::filesystem::path model_path(path);
    if (!model_path.is_absolute() || model_path.extension() != ".gguf" ||
        !std::filesystem::is_regular_file(model_path)) {
        throw std::invalid_argument("model must be an existing absolute .gguf file");
    }
    if (options.context_tokens == 0 || options.context_tokens > kMaximumContextTokens) {
        throw std::invalid_argument("context must be between 1 and 4096 tokens");
    }

    initialize(options.force_cpu);
    std::lock_guard lock(mutex_);
    release_model_locked();
    cancel_requested_.store(false);

    ggml_backend_dev_t cpu_devices[] = {ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU), nullptr};
    const ggml_backend_dev_t metal_device = ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU);
    ggml_backend_dev_t metal_devices[] = {metal_device, cpu_devices[0], nullptr};
    if (cpu_devices[0] == nullptr) {
        throw std::runtime_error("CPU backend is unavailable");
    }

    const bool try_metal = !force_cpu_ && metal_probe_succeeded_ && metal_device != nullptr;
    const auto load_model = [&](bool use_metal) -> llama_model* {
        if (use_metal && options.inject_metal_failure_for_test) {
            return nullptr;
        }
        llama_model_params params = llama_model_default_params();
        params.n_gpu_layers = use_metal ? -1 : 0;
        params.devices = use_metal ? metal_devices : cpu_devices;
        return llama_model_load_from_file(path.c_str(), params);
    };

    model_ = load_model(try_metal);
    backend_ = try_metal ? Backend::kMetal : Backend::kCpu;

    // Model or context construction can fail after Metal has registered but before
    // usable buffers exist. Retry with no GPU layers so a real CPU/Accelerate path
    // remains available rather than reporting a fictional Metal capability.
    if (model_ == nullptr && try_metal) {
        model_ = load_model(false);
        backend_ = Backend::kCpu;
    }
    if (model_ == nullptr) {
        throw std::runtime_error("failed to load the exact local model file");
    }

    llama_context_params context_params = llama_context_default_params();
    context_params.n_ctx = options.context_tokens;
    context_params.n_batch = options.context_tokens;
    context_params.n_ubatch = options.context_tokens;
    context_params.n_threads = options.threads;
    context_params.n_threads_batch = options.threads;
    context_params.no_perf = false;
    context_params.offload_kqv = backend_ == Backend::kMetal;
    context_params.op_offload = backend_ == Backend::kMetal;
    context_ = llama_init_from_model(model_, context_params);
    if (context_ == nullptr && backend_ == Backend::kMetal) {
        llama_model_free(model_);
        model_ = nullptr;
        model_ = load_model(false);
        backend_ = Backend::kCpu;
        context_params.offload_kqv = false;
        context_params.op_offload = false;
        if (model_ != nullptr) {
            context_ = llama_init_from_model(model_, context_params);
        }
    }
    if (context_ == nullptr) {
        release_model_locked();
        throw std::runtime_error("failed to initialize local inference context");
    }
    sampler_ = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(sampler_, llama_sampler_init_greedy());
    metrics_.backend = backend_;
}

void InferenceCore::generate(const std::string& prompt, uint32_t max_tokens,
                             const std::function<void(const std::string&)>& on_delta,
                             std::string* completed) {
    bool was_generating = false;
    if (!generating_.compare_exchange_strong(was_generating, true)) {
        throw std::runtime_error("local inference is already generating");
    }
    struct GenerationGuard {
        std::atomic<bool>& generating;
        ~GenerationGuard() { generating.store(false); }
    } guard{generating_};
    std::lock_guard lock(mutex_);
    if (model_ == nullptr || context_ == nullptr || sampler_ == nullptr) {
        throw std::runtime_error("no local model is loaded");
    }
    if (max_tokens == 0 || max_tokens > kMaximumGeneratedTokens) {
        throw std::invalid_argument("maxTokens must be between 1 and 256");
    }

    cancel_requested_.store(false);
    const auto started = std::chrono::steady_clock::now();
    const llama_vocab* vocab = llama_model_get_vocab(model_);
    std::vector<llama_token> prompt_tokens = tokenize(vocab, prompt);
    if (llama_decode(context_, llama_batch_get_one(prompt_tokens.data(),
                                                    static_cast<int32_t>(prompt_tokens.size()))) != 0) {
        throw std::runtime_error("prompt evaluation failed");
    }

    llama_token token = prompt_tokens.back();
    uint64_t generated = 0;
    for (; generated < max_tokens && !cancel_requested_.load(); ++generated) {
        token = llama_sampler_sample(sampler_, context_, -1);
        if (llama_vocab_is_eog(vocab, token)) {
            break;
        }
        const std::string delta = token_piece(vocab, token);
        completed->append(delta);
        on_delta(delta);
        llama_sampler_accept(sampler_, token);
        if (llama_decode(context_, llama_batch_get_one(&token, 1)) != 0) {
            throw std::runtime_error("token evaluation failed");
        }
    }
    const bool cancelled = cancel_requested_.load();
    llama_memory_clear(llama_get_memory(context_), true);
    llama_sampler_reset(sampler_);
    metrics_.prompt_tokens = prompt_tokens.size();
    metrics_.generated_tokens = generated;
    metrics_.elapsed_ms = std::chrono::duration<double, std::milli>(
                              std::chrono::steady_clock::now() - started)
                              .count();
    metrics_.backend = backend_;
    if (cancelled) {
        ++metrics_.cancelled_generations;
    }
}

std::string InferenceCore::complete(const std::string& prompt, uint32_t max_tokens) {
    std::string result;
    generate(prompt, max_tokens, [](const std::string&) {}, &result);
    return result;
}

void InferenceCore::stream(const std::string& prompt, uint32_t max_tokens,
                           const std::function<void(const std::string&)>& on_delta) {
    std::string ignored;
    generate(prompt, max_tokens, on_delta, &ignored);
}

void InferenceCore::cancel() { cancel_requested_.store(true); }

void InferenceCore::release_model_locked() {
    if (sampler_ != nullptr) {
        llama_sampler_free(sampler_);
        sampler_ = nullptr;
    }
    if (context_ != nullptr) {
        llama_free(context_);
        context_ = nullptr;
    }
    if (model_ != nullptr) {
        llama_model_free(model_);
        model_ = nullptr;
    }
}

void InferenceCore::unload() {
    std::lock_guard lock(mutex_);
    cancel_requested_.store(true);
    release_model_locked();
}

Metrics InferenceCore::metrics() const {
    std::lock_guard lock(mutex_);
    return metrics_;
}

void InferenceCore::reset() {
    std::lock_guard lock(mutex_);
    cancel_requested_.store(true);
    if (context_ != nullptr) {
        llama_memory_clear(llama_get_memory(context_), true);
    }
    if (sampler_ != nullptr) {
        llama_sampler_reset(sampler_);
    }
}

void InferenceCore::shutdown() {
    std::lock_guard lock(mutex_);
    release_model_locked();
    if (backend_initialized_) {
        llama_backend_free();
        backend_initialized_ = false;
    }
}

}  // namespace ispo::inference
