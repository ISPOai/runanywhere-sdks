#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>

struct llama_context;
struct llama_model;
struct llama_sampler;

namespace ispo::inference {

enum class Backend { kCpu, kMetal };

struct LoadOptions {
    uint32_t context_tokens = 512;
    int32_t threads = 0;
    bool force_cpu = false;
    bool inject_metal_failure_for_test = false;
};

struct Metrics {
    uint64_t prompt_tokens = 0;
    uint64_t generated_tokens = 0;
    uint64_t cancelled_generations = 0;
    double elapsed_ms = 0.0;
    Backend backend = Backend::kCpu;
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
    [[nodiscard]] bool loaded() const;
    [[nodiscard]] Backend backend() const;
    void load_exact_local_model(const std::string& path, const LoadOptions& options);
    std::string complete(const std::string& prompt, uint32_t max_tokens);
    void stream(const std::string& prompt, uint32_t max_tokens,
                const std::function<void(const std::string&)>& on_delta);
    void cancel();
    void unload();
    [[nodiscard]] Metrics metrics() const;
    void reset();
    void shutdown();

  private:
    void generate(const std::string& prompt, uint32_t max_tokens,
                  const std::function<void(const std::string&)>& on_delta,
                  std::string* completed);
    void release_model_locked();

    mutable std::mutex mutex_;
    llama_model* model_ = nullptr;
    llama_context* context_ = nullptr;
    llama_sampler* sampler_ = nullptr;
    std::atomic<bool> cancel_requested_{false};
    std::atomic<bool> generating_{false};
    bool backend_initialized_ = false;
    bool metal_probe_succeeded_ = false;
    bool force_cpu_ = false;
    Backend backend_ = Backend::kCpu;
    Metrics metrics_;
};

[[nodiscard]] const char* backend_name(Backend backend);

}  // namespace ispo::inference
