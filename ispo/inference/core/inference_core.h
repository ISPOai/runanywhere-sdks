#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>

struct llama_context;
struct llama_model;
struct llama_sampler;

namespace ispo::inference {

enum class Backend { kCpu, kMetal };

enum class FinishReason { kNone, kStop, kLength, kCancelled, kError };

struct LoadOptions {
    uint32_t context_tokens = 512;
    int32_t threads = 0;
    bool force_cpu = false;
    bool inject_metal_failure_for_test = false;
};

struct Metrics {
    uint64_t prompt_tokens = 0;
    uint64_t output_tokens = 0;
    uint64_t generated_tokens = 0;
    uint64_t cancelled_generations = 0;
    double elapsed_ms = 0.0;
    double ttft_ms = 0.0;
    double decode_ms = 0.0;
    Backend backend = Backend::kCpu;
    bool cancelled = false;
    bool has_first_token = false;
    FinishReason finish_reason = FinishReason::kNone;
};

struct StreamStep {
    enum class Type { kDelta, kTerminal };

    Type type = Type::kTerminal;
    std::string delta;
    Metrics metrics;
};

class StreamSession final {
  public:
    enum class Demand { kAccepted, kDuplicate, kTerminal };

    StreamSession(const std::string& prompt, uint32_t requested_max_tokens, uint32_t context_tokens,
                  Backend backend);
    StreamSession(const StreamSession&) = delete;
    StreamSession& operator=(const StreamSession&) = delete;

    [[nodiscard]] Demand acquire_demand();
    [[nodiscard]] StreamStep terminal_step() const;
    void request_cancel() noexcept;
    [[nodiscard]] bool cancellation_requested() const noexcept;

  private:
    friend class InferenceCore;

    enum class State { kReady, kExecuting, kTerminal };

    [[nodiscard]] bool terminalize_cancelled_if_idle(uint64_t cancelled_generations);
    [[nodiscard]] Metrics snapshot_metrics() const;
    void mark_terminal_locked(FinishReason reason, uint64_t cancelled_generations);

    mutable std::mutex mutex_;
    std::atomic<bool> cancel_requested_{false};
    State state_ = State::kReady;
    std::string prompt_;
    uint32_t requested_max_tokens_ = 0;
    uint32_t context_tokens_ = 0;
    uint64_t output_limit_ = 0;
    Metrics metrics_;
    std::chrono::steady_clock::time_point started_at_{};
    bool started_ = false;
};

class InferenceCore {
  public:
    InferenceCore();
    ~InferenceCore();
    InferenceCore(const InferenceCore&) = delete;
    InferenceCore& operator=(const InferenceCore&) = delete;

    void initialize(bool force_cpu);
    [[nodiscard]] bool metal_compiled() const;
    [[nodiscard]] bool metal_initialized() const;
#if defined(ISPO_INFERENCE_TESTING)
    [[nodiscard]] bool static_metal_residency_disabled_for_test() const;
#endif
    [[nodiscard]] bool loaded() const;
    [[nodiscard]] Backend backend() const;
    void load_exact_local_model(const std::string& path, const LoadOptions& options);
    std::string complete(const std::string& prompt, uint32_t max_tokens);
    [[nodiscard]] std::shared_ptr<StreamSession> start_stream(const std::string& prompt,
                                                                uint32_t max_tokens);
    [[nodiscard]] StreamStep next(const std::shared_ptr<StreamSession>& stream);
    void synchronize_backend_after_demand();
    void cancel() noexcept;
    void abandon_stream(const std::shared_ptr<StreamSession>& stream) noexcept;
    void unload();
    [[nodiscard]] Metrics metrics() const;
    void reset();
    void shutdown();

  private:
    [[nodiscard]] StreamStep next_locked(const std::shared_ptr<StreamSession>& stream);
    [[nodiscard]] bool start_locked(StreamSession& stream);
    [[nodiscard]] int decode_tokens_locked(const int32_t* tokens, uint32_t token_count,
                                           uint64_t position);
    void finish_locked(StreamSession& stream, FinishReason reason);
    void clear_generation_locked();
    [[nodiscard]] bool has_active_stream(const std::shared_ptr<StreamSession>& stream) const;
    void release_active_stream(const std::shared_ptr<StreamSession>& stream) noexcept;
    void release_model_locked();

    mutable std::mutex mutex_;
    llama_model* model_ = nullptr;
    llama_context* context_ = nullptr;
    llama_sampler* sampler_ = nullptr;
    mutable std::mutex generation_mutex_;
    std::shared_ptr<StreamSession> active_stream_;
    std::atomic<uint64_t> cancelled_generations_{0};
    bool backend_initialized_ = false;
    bool metal_probe_succeeded_ = false;
    bool force_cpu_ = false;
    Backend backend_ = Backend::kCpu;
    uint32_t context_tokens_ = 0;
    Metrics metrics_;
};

[[nodiscard]] const char* backend_name(Backend backend);
[[nodiscard]] const char* finish_reason_name(FinishReason reason);

}  // namespace ispo::inference
