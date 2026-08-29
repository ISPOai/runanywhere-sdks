#pragma once

#include <memory>

#include "inference_core.h"

namespace ispo::inference {

[[nodiscard]] StreamStep execute_next_in_metal_autorelease_scope(
    InferenceCore& core, const std::shared_ptr<StreamSession>& stream);

}  // namespace ispo::inference
