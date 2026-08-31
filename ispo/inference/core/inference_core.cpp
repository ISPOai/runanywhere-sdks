#include "inference_core.h"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <stdexcept>
#include <utility>
#include <vector>

#include "ggml-backend.h"
#include "llama.h"

#if defined(ISPO_INFERENCE_TESTING)
#include "ggml-metal-device.h"
#endif

namespace ispo::inference {
namespace {

constexpr uint32_t kMaximumContextTokens = 4096;
constexpr uint32_t kMaximumGeneratedTokens = 256;
constexpr size_t kMaximumPromptBytes = 64 * 1024;
constexpr size_t kMaximumDeltaBytes = 4096;

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
        const size_t required = static_cast<size_t>(-size);
        if (required > kMaximumDeltaBytes) {
            throw std::runtime_error("local inference token exceeds the stream delta limit");
        }
        buffer.resize(required);
        size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, true);
    }
    if (size < 0 || static_cast<size_t>(size) > kMaximumDeltaBytes) {
        throw std::runtime_error("token conversion failed");
    }
    return {buffer.data(), static_cast<size_t>(size)};
}

bool abort_when_cancelled(void* data) {
    return static_cast<StreamSession*>(data)->cancellation_requested();
}

double elapsed_milliseconds(const std::chrono::steady_clock::time_point& started_at) {
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started_at)
        .count();
}

}  // namespace

const char* backend_name(Backend backend) {
    return backend == Backend::kMetal ? "metal" : "cpu-accelerate";
}

const char* finish_reason_name(FinishReason reason) {
    switch (reason) {
        case FinishReason::kNone:
            return "none";
        case FinishReason::kStop:
            return "stop";
        case FinishReason::kLength:
            return "length";
        case FinishReason::kCancelled:
            return "cancelled";
        case FinishReason::kError:
            return "error";
    }
    return "error";
}

StreamSession::StreamSession(const std::string& prompt, uint32_t requested_max_tokens,
                             uint32_t context_tokens, Backend backend)
    : prompt_(prompt),
      requested_max_tokens_(requested_max_tokens),
      context_tokens_(context_tokens) {
    metrics_.backend = backend;
}

StreamSession::Demand StreamSession::acquire_demand() {
    std::lock_guard lock(mutex_);
    switch (state_) {
        case State::kReady:
            state_ = State::kExecuting;
            return Demand::kAccepted;
        case State::kExecuting:
            return Demand::kDuplicate;
        case State::kTerminal:
            return Demand::kTerminal;
    }
    return Demand::kTerminal;
}

StreamStep StreamSession::terminal_step() const {
    std::lock_guard lock(mutex_);
    return {.type = StreamStep::Type::kTerminal, .delta = {}, .metrics = metrics_};
}

void StreamSession::request_cancel() noexcept { cancel_requested_.store(true); }

bool StreamSession::cancellation_requested() const noexcept { return cancel_requested_.load(); }

bool StreamSession::terminalize_cancelled_if_idle(uint64_t cancelled_generations) {
    std::lock_guard lock(mutex_);
    if (state_ != State::kReady) {
        return false;
    }
    mark_terminal_locked(FinishReason::kCancelled, cancelled_generations);
    return true;
}

Metrics StreamSession::snapshot_metrics() const {
    std::lock_guard lock(mutex_);
    return metrics_;
}

void StreamSession::mark_terminal_locked(FinishReason reason, uint64_t cancelled_generations) {
    if (started_) {
        metrics_.elapsed_ms = elapsed_milliseconds(started_at_);
    }
    metrics_.decode_ms = metrics_.has_first_token
                             ? std::max(0.0, metrics_.elapsed_ms - metrics_.ttft_ms)
                             : 0.0;
    metrics_.cancelled = reason == FinishReason::kCancelled;
    metrics_.finish_reason = reason;
    metrics_.cancelled_generations = cancelled_generations;
    state_ = State::kTerminal;
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

#if defined(ISPO_INFERENCE_TESTING)
bool InferenceCore::static_metal_residency_disabled_for_test() const {
    std::lock_guard lock(mutex_);
    if (!backend_initialized_ || !metal_probe_succeeded_) {
        return false;
    }
    const ggml_metal_device_t device = ggml_metal_device_get(0);
    return device != nullptr && !ggml_metal_device_get_props(device)->use_residency_sets;
}
#endif

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
    {
        std::lock_guard generation_lock(generation_mutex_);
        if (active_stream_) {
            throw std::runtime_error("local inference is already generating");
        }
    }
    release_model_locked();

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
    context_tokens_ = options.context_tokens;
    metrics_ = Metrics{.backend = backend_};
    metrics_.cancelled_generations = cancelled_generations_.load();
}

std::shared_ptr<StreamSession> InferenceCore::start_stream(const std::string& prompt,
                                                            uint32_t max_tokens) {
    if (prompt.size() > kMaximumPromptBytes) {
        throw std::invalid_argument("prompt exceeds the local inference input limit");
    }
    if (max_tokens == 0 || max_tokens > kMaximumGeneratedTokens) {
        throw std::invalid_argument("maxTokens must be between 1 and 256");
    }

    std::lock_guard lock(mutex_);
    if (model_ == nullptr || context_ == nullptr || sampler_ == nullptr || context_tokens_ == 0) {
        throw std::runtime_error("no local model is loaded");
    }
    auto stream = std::make_shared<StreamSession>(prompt, max_tokens, context_tokens_, backend_);
    std::lock_guard generation_lock(generation_mutex_);
    if (active_stream_) {
        throw std::runtime_error("local inference is already generating");
    }
    active_stream_ = stream;
    return stream;
}

int InferenceCore::decode_tokens_locked(const llama_token* tokens, uint32_t token_count,
                                        uint64_t position) {
    std::vector<llama_pos> positions(token_count);
    std::vector<int32_t> sequence_counts(token_count, 1);
    std::vector<llama_seq_id> sequence_ids(token_count, 0);
    std::vector<llama_seq_id*> sequence_id_pointers(token_count);
    std::vector<int8_t> logits(token_count, 0);
    for (uint32_t index = 0; index < token_count; ++index) {
        positions[index] = static_cast<llama_pos>(position + index);
        sequence_id_pointers[index] = &sequence_ids[index];
    }
    logits.back() = 1;
    const llama_batch batch{
        .n_tokens = static_cast<int32_t>(token_count),
        .token = const_cast<llama_token*>(tokens),
        .embd = nullptr,
        .pos = positions.data(),
        .n_seq_id = sequence_counts.data(),
        .seq_id = sequence_id_pointers.data(),
        .logits = logits.data(),
    };
    return llama_decode(context_, batch);
}

bool InferenceCore::start_locked(StreamSession& stream) {
    if (stream.cancellation_requested()) {
        finish_locked(stream, FinishReason::kCancelled);
        return false;
    }

    clear_generation_locked();
    llama_set_abort_callback(context_, abort_when_cancelled, &stream);
    stream.started_at_ = std::chrono::steady_clock::now();
    stream.started_ = true;
    stream.metrics_.backend = backend_;

    const llama_vocab* vocab = llama_model_get_vocab(model_);
    const std::vector<llama_token> prompt_tokens = tokenize(vocab, stream.prompt_);
    stream.metrics_.prompt_tokens = prompt_tokens.size();
    if (prompt_tokens.size() > stream.context_tokens_) {
        finish_locked(stream, FinishReason::kError);
        return false;
    }
    stream.output_limit_ = std::min<uint64_t>(
        stream.requested_max_tokens_, stream.context_tokens_ - prompt_tokens.size());
    if (stream.output_limit_ == 0) {
        finish_locked(stream, FinishReason::kLength);
        return false;
    }

    const int decode_result =
        decode_tokens_locked(prompt_tokens.data(), static_cast<uint32_t>(prompt_tokens.size()), 0);
    if (stream.cancellation_requested() || decode_result == 2) {
        finish_locked(stream, FinishReason::kCancelled);
        return false;
    }
    if (decode_result != 0) {
        finish_locked(stream, FinishReason::kError);
        return false;
    }
    return true;
}

StreamStep InferenceCore::next_locked(const std::shared_ptr<StreamSession>& stream) {
    if (model_ == nullptr || context_ == nullptr || sampler_ == nullptr || !has_active_stream(stream)) {
        {
            std::lock_guard session_lock(stream->mutex_);
            stream->mark_terminal_locked(FinishReason::kCancelled, cancelled_generations_.load());
        }
        return stream->terminal_step();
    }

    if (!stream->started_ && !start_locked(*stream)) {
        return stream->terminal_step();
    }
    if (stream->cancellation_requested()) {
        finish_locked(*stream, FinishReason::kCancelled);
        return stream->terminal_step();
    }
    if (stream->metrics_.output_tokens >= stream->output_limit_) {
        finish_locked(*stream, FinishReason::kLength);
        return stream->terminal_step();
    }

    const llama_vocab* vocab = llama_model_get_vocab(model_);
    const llama_token token = llama_sampler_sample(sampler_, context_, -1);
    if (llama_vocab_is_eog(vocab, token)) {
        finish_locked(*stream, FinishReason::kStop);
        return stream->terminal_step();
    }
    const std::string delta = token_piece(vocab, token);
    if (stream->cancellation_requested()) {
        finish_locked(*stream, FinishReason::kCancelled);
        return stream->terminal_step();
    }

    llama_sampler_accept(sampler_, token);
    const int decode_result = decode_tokens_locked(
        &token, 1, stream->metrics_.prompt_tokens + stream->metrics_.output_tokens);
    if (stream->cancellation_requested() || decode_result == 2) {
        finish_locked(*stream, FinishReason::kCancelled);
        return stream->terminal_step();
    }
    if (decode_result != 0) {
        finish_locked(*stream, FinishReason::kError);
        return stream->terminal_step();
    }

    ++stream->metrics_.output_tokens;
    stream->metrics_.generated_tokens = stream->metrics_.output_tokens;
    stream->metrics_.elapsed_ms = elapsed_milliseconds(stream->started_at_);
    if (!stream->metrics_.has_first_token) {
        stream->metrics_.has_first_token = true;
        stream->metrics_.ttft_ms = stream->metrics_.elapsed_ms;
    }
    stream->metrics_.decode_ms =
        std::max(0.0, stream->metrics_.elapsed_ms - stream->metrics_.ttft_ms);
    {
        std::lock_guard session_lock(stream->mutex_);
        stream->state_ = StreamSession::State::kReady;
    }
    return {.type = StreamStep::Type::kDelta, .delta = delta, .metrics = stream->snapshot_metrics()};
}

void InferenceCore::finish_locked(StreamSession& stream, FinishReason reason) {
    if (stream.metrics_.finish_reason != FinishReason::kNone) {
        return;
    }
    if (reason == FinishReason::kCancelled) {
        stream.metrics_.cancelled_generations = cancelled_generations_.fetch_add(1) + 1;
    } else {
        stream.metrics_.cancelled_generations = cancelled_generations_.load();
    }
    clear_generation_locked();
    {
        std::lock_guard session_lock(stream.mutex_);
        stream.mark_terminal_locked(reason, stream.metrics_.cancelled_generations);
    }
    metrics_ = stream.snapshot_metrics();
}

StreamStep InferenceCore::next(const std::shared_ptr<StreamSession>& stream) {
    StreamStep step;
    try {
        std::lock_guard lock(mutex_);
        step = next_locked(stream);
    } catch (...) {
        std::lock_guard lock(mutex_);
        finish_locked(*stream, FinishReason::kError);
        step = stream->terminal_step();
    }
    if (step.type == StreamStep::Type::kTerminal) {
        release_active_stream(stream);
    }
    return step;
}

void InferenceCore::synchronize_backend_after_demand() {
    std::lock_guard lock(mutex_);
    if (context_ == nullptr || backend_ != Backend::kMetal) {
        return;
    }
    llama_synchronize(context_);
}

std::string InferenceCore::complete(const std::string& prompt, uint32_t max_tokens) {
    const auto stream = start_stream(prompt, max_tokens);
    std::string completed;
    while (true) {
        if (stream->acquire_demand() != StreamSession::Demand::kAccepted) {
            throw std::runtime_error("local inference completion failed");
        }
        const StreamStep step = next(stream);
        if (step.type == StreamStep::Type::kDelta) {
            completed.append(step.delta);
            continue;
        }
        if (step.metrics.finish_reason == FinishReason::kError) {
            throw std::runtime_error("local inference completion failed");
        }
        return completed;
    }
}

void InferenceCore::cancel() noexcept {
    try {
        std::shared_ptr<StreamSession> stream;
        {
            std::lock_guard generation_lock(generation_mutex_);
            stream = active_stream_;
        }
        if (!stream) {
            return;
        }
        stream->request_cancel();
        const uint64_t cancellation_count = cancelled_generations_.load() + 1;
        if (!stream->terminalize_cancelled_if_idle(cancellation_count)) {
            return;
        }
        cancelled_generations_.fetch_add(1);
        {
            std::lock_guard lock(mutex_);
            clear_generation_locked();
            metrics_ = stream->snapshot_metrics();
        }
        release_active_stream(stream);
    } catch (...) {
    }
}

void InferenceCore::abandon_stream(const std::shared_ptr<StreamSession>& stream) noexcept {
    if (!has_active_stream(stream)) {
        return;
    }
    cancel();
}

void InferenceCore::clear_generation_locked() {
    if (context_ != nullptr) {
        llama_set_abort_callback(context_, nullptr, nullptr);
        llama_memory_clear(llama_get_memory(context_), true);
    }
    if (sampler_ != nullptr) {
        llama_sampler_reset(sampler_);
    }
}

bool InferenceCore::has_active_stream(const std::shared_ptr<StreamSession>& stream) const {
    std::lock_guard generation_lock(generation_mutex_);
    return active_stream_ == stream;
}

void InferenceCore::release_active_stream(const std::shared_ptr<StreamSession>& stream) noexcept {
    std::lock_guard generation_lock(generation_mutex_);
    if (active_stream_ == stream) {
        active_stream_.reset();
    }
}

void InferenceCore::release_model_locked() {
    clear_generation_locked();
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
    context_tokens_ = 0;
}

void InferenceCore::unload() {
    cancel();
    std::lock_guard lock(mutex_);
    release_model_locked();
}

Metrics InferenceCore::metrics() const {
    std::shared_ptr<StreamSession> stream;
    {
        std::lock_guard generation_lock(generation_mutex_);
        stream = active_stream_;
    }
    if (stream) {
        Metrics result = stream->snapshot_metrics();
        result.cancelled_generations = cancelled_generations_.load();
        return result;
    }
    std::lock_guard lock(mutex_);
    Metrics result = metrics_;
    result.cancelled_generations = cancelled_generations_.load();
    return result;
}

void InferenceCore::reset() {
    cancel();
    std::lock_guard lock(mutex_);
    clear_generation_locked();
}

void InferenceCore::shutdown() {
    cancel();
    std::lock_guard lock(mutex_);
    release_model_locked();
    if (backend_initialized_) {
        llama_backend_free();
        backend_initialized_ = false;
    }
}

}  // namespace ispo::inference
