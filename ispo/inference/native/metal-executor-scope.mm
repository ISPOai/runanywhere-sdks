#include "metal-executor-scope.h"

namespace ispo::inference {

StreamStep execute_next_in_metal_autorelease_scope(InferenceCore& core,
                                                    const std::shared_ptr<StreamSession>& stream) {
    @autoreleasepool {
        return core.next(stream);
    }
}

}  // namespace ispo::inference
