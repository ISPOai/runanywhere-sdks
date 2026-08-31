#pragma once

#include <memory>

#include "inference_core.h"

namespace ispo::inference {

[[nodiscard]] StreamStep execute_next_in_metal_autorelease_scope(
    InferenceCore& core, const std::shared_ptr<StreamSession>& stream);

#if defined(ISPO_INFERENCE_TESTING)
void arm_post_autorelease_settlement_barrier_for_test();
[[nodiscard]] bool post_autorelease_settlement_barrier_reached_for_test() noexcept;
[[nodiscard]] bool release_post_autorelease_settlement_barrier_for_test() noexcept;
#endif

}  // namespace ispo::inference
