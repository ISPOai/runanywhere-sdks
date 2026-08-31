#include "metal-executor-scope.h"

#if defined(ISPO_INFERENCE_TESTING)
#include <condition_variable>
#include <mutex>
#include <stdexcept>
#endif

namespace ispo::inference {

#if defined(ISPO_INFERENCE_TESTING)
namespace {

class PostAutoreleaseSettlementBarrier final {
  public:
    void arm() {
        std::lock_guard lock(mutex_);
        if (armed_) {
            throw std::runtime_error("post-autorelease settlement barrier is already armed");
        }
        armed_ = true;
        reached_ = false;
        released_ = false;
    }

    [[nodiscard]] bool reached() const noexcept {
        std::lock_guard lock(mutex_);
        return reached_;
    }

    [[nodiscard]] bool release() noexcept {
        std::lock_guard lock(mutex_);
        if (!armed_) {
            return false;
        }
        released_ = true;
        released_condition_.notify_all();
        return true;
    }

    void wait_after_scope() noexcept {
        std::unique_lock lock(mutex_);
        if (!armed_) {
            return;
        }
        reached_ = true;
        released_condition_.wait(lock, [this] { return released_; });
        armed_ = false;
    }

  private:
    mutable std::mutex mutex_;
    std::condition_variable released_condition_;
    bool armed_ = false;
    bool reached_ = false;
    bool released_ = false;
};

PostAutoreleaseSettlementBarrier post_autorelease_settlement_barrier;

}  // namespace
#endif

StreamStep execute_next_in_metal_autorelease_scope(InferenceCore& core,
                                                    const std::shared_ptr<StreamSession>& stream) {
    StreamStep result;
    @autoreleasepool {
        result = core.next(stream);
        core.synchronize_backend_after_demand();
    }
#if defined(ISPO_INFERENCE_TESTING)
    post_autorelease_settlement_barrier.wait_after_scope();
#endif
    return result;
}

#if defined(ISPO_INFERENCE_TESTING)
void arm_post_autorelease_settlement_barrier_for_test() {
    post_autorelease_settlement_barrier.arm();
}

bool post_autorelease_settlement_barrier_reached_for_test() noexcept {
    return post_autorelease_settlement_barrier.reached();
}

bool release_post_autorelease_settlement_barrier_for_test() noexcept {
    return post_autorelease_settlement_barrier.release();
}
#endif

}  // namespace ispo::inference
