cmake_minimum_required(VERSION 3.24)

include(FetchContent)

set(ISPO_INFERENCE_LLAMA_REPOSITORY "https://github.com/RunanywhereAI/llama.cpp.git"
    CACHE STRING "Pinned public llama.cpp source repository")
set(ISPO_INFERENCE_LLAMA_REVISION "79e2eb5eef131799ca6a2e2e342056a37a148df8"
    CACHE STRING "Immutable llama.cpp source revision")

# This is intentionally a direct llama.cpp build.  Do not add core/, engines/,
# or the inherited Electron facade here: their source graph contains transport
# and model-management facilities that cannot be present in this artifact.
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(LLAMA_HTTPLIB OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_METAL ON CACHE BOOL "" FORCE)
set(GGML_METAL_EMBED_LIBRARY ON CACHE BOOL "" FORCE)
set(GGML_ACCELERATE ON CACHE BOOL "" FORCE)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
set(GGML_CUDA OFF CACHE BOOL "" FORCE)
set(GGML_RPC OFF CACHE BOOL "" FORCE)
set(GGML_OPENCL OFF CACHE BOOL "" FORCE)
set(GGML_HIPBLAS OFF CACHE BOOL "" FORCE)
set(GGML_SYCL OFF CACHE BOOL "" FORCE)
set(GGML_KOMPUTE OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)

FetchContent_Declare(ispo_llamacpp
    GIT_REPOSITORY "${ISPO_INFERENCE_LLAMA_REPOSITORY}"
    GIT_TAG "${ISPO_INFERENCE_LLAMA_REVISION}"
    GIT_SHALLOW TRUE
    GIT_PROGRESS TRUE)
FetchContent_MakeAvailable(ispo_llamacpp)

# Keep only code reached by the sealed adapter. This removes diagnostic/help
# strings and dormant model-family helpers from the final Mach-O, rather than
# merely hiding their exports.
foreach(_ispo_llama_target IN ITEMS llama ggml ggml-base ggml-cpu ggml-blas ggml-metal)
    if(TARGET ${_ispo_llama_target})
        target_compile_options(${_ispo_llama_target} PRIVATE -ffunction-sections -fdata-sections)
    endif()
endforeach()

set(_ispo_napi_dir "${CMAKE_SOURCE_DIR}/bindings/electron/native/node_modules")
if(NOT EXISTS "${_ispo_napi_dir}/node-addon-api/napi.h")
    message(FATAL_ERROR
        "ISPO inference artifact requires npm ci --ignore-scripts in bindings/electron/native")
endif()

add_library(ispo_inference_core STATIC core/inference_core.cpp)
target_include_directories(ispo_inference_core PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/core"
    "${ispo_llamacpp_SOURCE_DIR}/include"
    "${ispo_llamacpp_SOURCE_DIR}/ggml/include")
target_compile_features(ispo_inference_core PUBLIC cxx_std_20)
target_link_libraries(ispo_inference_core PUBLIC llama)

add_library(ispo_local_inference_native MODULE native/addon.cpp)
set_target_properties(ispo_local_inference_native PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    OUTPUT_NAME "ispo_local_inference_native")
target_include_directories(ispo_local_inference_native PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/core"
    "${_ispo_napi_dir}/node-addon-api"
    "${_ispo_napi_dir}/node-api-headers/include")
target_compile_definitions(ispo_local_inference_native PRIVATE
    NAPI_VERSION=8 NODE_ADDON_API_DISABLE_DEPRECATED BUILDING_NODE_EXTENSION)
target_compile_features(ispo_local_inference_native PRIVATE cxx_std_20)
target_link_libraries(ispo_local_inference_native PRIVATE ispo_inference_core)
target_link_options(ispo_local_inference_native PRIVATE "-Wl,-undefined,dynamic_lookup" "-Wl,-dead_strip")
set_property(TARGET ispo_local_inference_native APPEND PROPERTY BUILD_RPATH "@loader_path")
set_target_properties(ispo_local_inference_native PROPERTIES INSTALL_RPATH "@loader_path")

message(STATUS "ISPO local inference: direct core + llama.cpp + N-API adapter only")
