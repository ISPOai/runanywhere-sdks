#include "metal-executor-scope.h"

namespace ispo::inference {

StreamStep execute_next_in_metal_autorelease_scope(InferenceCore& core,
                                                    const std::shared_ptr<StreamSession>& stream) {
    @autoreleasepool {
        return core.next(stream);
    }
}

void initialize_in_metal_autorelease_scope(InferenceCore& core, bool force_cpu) {
    @autoreleasepool {
        core.initialize(force_cpu);
    }
}

void load_in_metal_autorelease_scope(InferenceCore& core, const std::string& path,
                                     const LoadOptions& options) {
    @autoreleasepool {
        core.load_exact_local_model(path, options);
    }
}

std::string complete_in_metal_autorelease_scope(InferenceCore& core, const std::string& prompt,
                                                 uint32_t max_tokens) {
    @autoreleasepool {
        return core.complete(prompt, max_tokens);
    }
}

void unload_in_metal_autorelease_scope(InferenceCore& core) {
    @autoreleasepool {
        core.unload();
    }
}

void reset_in_metal_autorelease_scope(InferenceCore& core) {
    @autoreleasepool {
        core.reset();
    }
}

void cancel_in_metal_autorelease_scope(InferenceCore& core) {
    @autoreleasepool {
        core.cancel();
    }
}

void abandon_stream_in_metal_autorelease_scope(
    InferenceCore& core, const std::shared_ptr<StreamSession>& stream) {
    @autoreleasepool {
        core.abandon_stream(stream);
    }
}

void shutdown_in_metal_autorelease_scope(InferenceCore& core) {
    @autoreleasepool {
        core.shutdown();
    }
}

}  // namespace ispo::inference
