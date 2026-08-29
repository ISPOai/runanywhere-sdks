#pragma once

#include <memory>
#include <string>

#include "inference_core.h"

namespace ispo::inference {

[[nodiscard]] StreamStep execute_next_in_metal_autorelease_scope(
    InferenceCore& core, const std::shared_ptr<StreamSession>& stream);

void initialize_in_metal_autorelease_scope(InferenceCore& core, bool force_cpu);
void load_in_metal_autorelease_scope(InferenceCore& core, const std::string& path,
                                    const LoadOptions& options);
[[nodiscard]] std::string complete_in_metal_autorelease_scope(
    InferenceCore& core, const std::string& prompt, uint32_t max_tokens);
void unload_in_metal_autorelease_scope(InferenceCore& core);
void reset_in_metal_autorelease_scope(InferenceCore& core);
void cancel_in_metal_autorelease_scope(InferenceCore& core);
void abandon_stream_in_metal_autorelease_scope(InferenceCore& core,
                                               const std::shared_ptr<StreamSession>& stream);
void shutdown_in_metal_autorelease_scope(InferenceCore& core);

}  // namespace ispo::inference
