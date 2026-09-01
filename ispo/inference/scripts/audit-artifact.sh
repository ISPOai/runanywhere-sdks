#!/usr/bin/env bash
set -euo pipefail

readonly addon="${1:?usage: audit-artifact.sh /absolute/path/ispo_local_inference_native.node}"

if [[ "$addon" != /* || ! -f "$addon" ]]; then
    echo "artifact must be an existing absolute file" >&2
    exit 64
fi
if ! file "$addon" | grep -F 'arm64' >/dev/null; then
    echo "artifact is not Darwin arm64" >&2
    exit 65
fi
if ! otool -l "$addon" | grep -A 3 'LC_BUILD_VERSION' | grep -F 'minos 14.5' >/dev/null; then
    echo "artifact deployment target is not macOS 14.5" >&2
    exit 65
fi
if [[ "$(otool -l "$addon" | grep -Fc 'LC_UUID')" -ne 1 ]]; then
    echo "artifact did not retain one content-derived linker UUID" >&2
    exit 65
fi
if ! nm "$addon" | grep -F '_ggml_metallib_start' >/dev/null; then
    echo "embedded Metal resource is absent" >&2
    exit 65
fi
if nm -gU "$addon" | awk '$2 ~ /^[TDS]$/ { print $3 }' | grep -Ev '^_napi_register_module_v1$' | grep -q .; then
    echo "artifact exports symbols beyond the N-API registration entrypoint" >&2
    exit 65
fi
if nm -u "$addon" | grep -E '_(dlopen|dlsym|dlclose|getenv|NSGetExecutablePath)$' >/dev/null; then
    echo "artifact retains ambient or dynamic-backend discovery symbols" >&2
    exit 65
fi
readonly forbidden_strings='HF_TOKEN|HF_HOME|XDG_CACHE_HOME|huggingface|general\.url|general\.source|tokenizer\.huggingface|GGML_BACKEND_PATH|https?://|http_proxy|https_proxy|keychain|proxy|download|repository|openvino|hexagon|virtgpu|qhexrt|qairt|neurt|sherpa|onnx|coreml|mlx|cuda|vulkan|hipblas|sycl|opencl|musa|runanywhere connect'
if strings -a "$addon" | grep -E -i "$forbidden_strings" >/dev/null; then
    echo "artifact retains a forbidden transport, repository, or engine string" >&2
    exit 65
fi
if strings -a "$addon" | grep -F '/private/tmp/' >/dev/null; then
    echo "artifact retains a scratch checkout path" >&2
    exit 65
fi
printf 'artifact audit passed: %s\n' "$addon"
