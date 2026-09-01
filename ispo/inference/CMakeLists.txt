cmake_minimum_required(VERSION 3.24)

include(FetchContent)

if(NOT CMAKE_GENERATOR STREQUAL "Ninja")
    message(FATAL_ERROR "The ISPO Qwen3 inference artifact requires the Ninja generator")
endif()
if(NOT ISPO_INFERENCE_CANONICAL_PRESET STREQUAL "ispo-darwin-arm64-inference-release")
    message(FATAL_ERROR "The ISPO Qwen3 inference artifact requires its canonical CMake preset")
endif()
if(NOT CMAKE_OSX_ARCHITECTURES STREQUAL "arm64" OR
   NOT CMAKE_OSX_DEPLOYMENT_TARGET STREQUAL "14.5")
    message(FATAL_ERROR "The ISPO Qwen3 inference artifact requires the arm64 macOS 14.5 toolchain")
endif()

set(ISPO_INFERENCE_LLAMA_REPOSITORY "https://github.com/RunanywhereAI/llama.cpp.git")
set(ISPO_INFERENCE_LLAMA_REVISION "d3bd7193ba66c15963fd1c59448f22019a8caf6e")
set(ISPO_INFERENCE_LLAMA_ARCHIVE
    "https://github.com/RunanywhereAI/llama.cpp/archive/d3bd7193ba66c15963fd1c59448f22019a8caf6e.tar.gz")
set(ISPO_INFERENCE_LLAMA_ARCHIVE_SHA256
    "d086756e37fda7fff0d671d8106601232258d6f95384d04bf69b126445ad201d")
set(ISPO_INFERENCE_LLAMA_PATCH
    "${CMAKE_CURRENT_SOURCE_DIR}/patches/llama-static-backend-registry.patch")

if(DEFINED FETCHCONTENT_SOURCE_DIR_ISPO_LLAMACPP AND
   NOT "${FETCHCONTENT_SOURCE_DIR_ISPO_LLAMACPP}" STREQUAL "")
    message(FATAL_ERROR "Local llama.cpp source overrides are not permitted for the ISPO artifact")
endif()

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
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
set(GGML_ISPO_STATIC_ONLY ON CACHE BOOL "" FORCE)
set(ISPO_QWEN3_ONLY ON CACHE BOOL "" FORCE)
set(GGML_CPU_ALL_VARIANTS OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
set(GGML_CUDA OFF CACHE BOOL "" FORCE)
set(GGML_RPC OFF CACHE BOOL "" FORCE)
set(GGML_OPENCL OFF CACHE BOOL "" FORCE)
set(GGML_HIPBLAS OFF CACHE BOOL "" FORCE)
set(GGML_SYCL OFF CACHE BOOL "" FORCE)
set(GGML_KOMPUTE OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)

FetchContent_Declare(ispo_llamacpp
    URL "${ISPO_INFERENCE_LLAMA_ARCHIVE}"
    URL_HASH "SHA256=${ISPO_INFERENCE_LLAMA_ARCHIVE_SHA256}"
    PATCH_COMMAND patch --batch --forward -p1 -i "${ISPO_INFERENCE_LLAMA_PATCH}")
FetchContent_MakeAvailable(ispo_llamacpp)

find_program(ISPO_NODE_EXECUTABLE node REQUIRED)

# Keep only code reached by the sealed adapter. This removes diagnostic/help
# strings and dormant model-family helpers from the final Mach-O, rather than
# merely hiding their exports.
foreach(_ispo_llama_target IN ITEMS llama ggml ggml-base ggml-cpu ggml-blas ggml-metal)
    if(TARGET ${_ispo_llama_target})
        target_compile_options(${_ispo_llama_target} PRIVATE
            -ffunction-sections -fdata-sections -fvisibility=hidden
            "-ffile-prefix-map=${CMAKE_SOURCE_DIR}=."
            "-ffile-prefix-map=${CMAKE_BINARY_DIR}=build"
            "-ffile-prefix-map=${ispo_llamacpp_SOURCE_DIR}=third_party/llama.cpp")
    endif()
endforeach()
target_compile_definitions(llama PRIVATE ISPO_QWEN3_ONLY)
foreach(_ispo_static_target IN ITEMS ggml ggml-base ggml-metal)
    if(TARGET ${_ispo_static_target})
        target_compile_definitions(${_ispo_static_target} PRIVATE GGML_ISPO_STATIC_ONLY)
    endif()
endforeach()

set(_ispo_napi_dir "${CMAKE_SOURCE_DIR}/bindings/electron/native/node_modules")
if(NOT EXISTS "${_ispo_napi_dir}/node-addon-api/napi.h")
    message(FATAL_ERROR
        "ISPO inference artifact requires npm ci --ignore-scripts in bindings/electron/native")
endif()

option(ISPO_INFERENCE_TESTING "Enable test-only local-inference native hooks" OFF)

add_library(ispo_inference_core STATIC core/inference_core.cpp)
target_include_directories(ispo_inference_core PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/core"
    "${ispo_llamacpp_SOURCE_DIR}/include"
    "${ispo_llamacpp_SOURCE_DIR}/ggml/include")
target_compile_features(ispo_inference_core PUBLIC cxx_std_20)
target_link_libraries(ispo_inference_core PUBLIC llama)
target_compile_options(ispo_inference_core PRIVATE
    -ffunction-sections -fdata-sections -fvisibility=hidden
    "-ffile-prefix-map=${CMAKE_SOURCE_DIR}=."
    "-ffile-prefix-map=${CMAKE_BINARY_DIR}=build")
if(ISPO_INFERENCE_TESTING)
    if(TARGET ggml-metal)
        target_compile_definitions(ggml-metal PRIVATE ISPO_INFERENCE_TESTING=1)
    endif()
    target_include_directories(ispo_inference_core PRIVATE
        "${ispo_llamacpp_SOURCE_DIR}/ggml/src/ggml-metal")
    target_compile_definitions(ispo_inference_core PRIVATE ISPO_INFERENCE_TESTING=1)
endif()

add_library(ispo_local_inference_native MODULE
    native/addon.cpp
    native/metal-executor-scope.mm)
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
if(ISPO_INFERENCE_TESTING)
    target_compile_definitions(ispo_local_inference_native PRIVATE ISPO_INFERENCE_TESTING=1)
endif()
target_compile_features(ispo_local_inference_native PRIVATE cxx_std_20)
target_compile_options(ispo_local_inference_native PRIVATE
    -ffunction-sections -fdata-sections -fvisibility=hidden
    "-ffile-prefix-map=${CMAKE_SOURCE_DIR}=."
    "-ffile-prefix-map=${CMAKE_BINARY_DIR}=build")
target_link_libraries(ispo_local_inference_native PRIVATE ispo_inference_core)
target_link_options(ispo_local_inference_native PRIVATE
    "-Wl,-undefined,dynamic_lookup"
    "-Wl,-dead_strip"
    "-Wl,-exported_symbols_list,${CMAKE_CURRENT_SOURCE_DIR}/native/exported-symbols.txt")
set_property(TARGET ispo_local_inference_native APPEND PROPERTY BUILD_RPATH "@loader_path")
set_target_properties(ispo_local_inference_native PROPERTIES INSTALL_RPATH "@loader_path")

# Apple's ar records build time, uid, and gid in every archive member. Normalize
# those headers for canonical static-archive provenance. They are not the causal
# raw-link input: Darwin ld incorporates its final `-o` spelling, so the
# admission boundary separately binds the Ninja producer and canonical output
# path before it accepts the content-derived LC_UUID or CodeDirectory.
set(_ispo_static_archive_targets
    ispo_inference_core
    llama
    ggml
    ggml-base
    ggml-cpu
    ggml-blas
    ggml-metal)
add_custom_target(ispo_normalize_static_archives
    COMMAND "${ISPO_NODE_EXECUTABLE}"
        "${CMAKE_CURRENT_SOURCE_DIR}/scripts/normalize-darwin-static-archive.js"
        "$<TARGET_FILE:ispo_inference_core>"
        "$<TARGET_FILE:llama>"
        "$<TARGET_FILE:ggml>"
        "$<TARGET_FILE:ggml-base>"
        "$<TARGET_FILE:ggml-cpu>"
        "$<TARGET_FILE:ggml-blas>"
        "$<TARGET_FILE:ggml-metal>"
    DEPENDS ${_ispo_static_archive_targets}
    VERBATIM)
add_dependencies(ispo_local_inference_native ispo_normalize_static_archives)

message(STATUS "ISPO local inference: direct core + static Qwen3 llama.cpp + N-API adapter only")
