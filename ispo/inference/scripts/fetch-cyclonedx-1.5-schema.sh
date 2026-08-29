#!/usr/bin/env bash
set -euo pipefail

readonly schema_url="https://raw.githubusercontent.com/CycloneDX/specification/c320fc0f0b46873864927d9d5684eea7ba439728/schema/bom-1.5.schema.json"
readonly schema_sha256="067f7824b08653839ea050ae9e09ca48375eadc2652b0e2a299476e7db90335b"
readonly spdx_url="https://raw.githubusercontent.com/CycloneDX/specification/c320fc0f0b46873864927d9d5684eea7ba439728/schema/spdx.schema.json"
readonly spdx_sha256="4f6e2b05c05d26a4f2dc5879fbc2fca94b0a28db46289d0c51345621b71cfbfc"
readonly jsf_url="https://raw.githubusercontent.com/CycloneDX/specification/c320fc0f0b46873864927d9d5684eea7ba439728/schema/jsf-0.82.schema.json"
readonly jsf_sha256="8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae"

if [[ "$#" -ne 1 ]]; then
    echo "usage: fetch-cyclonedx-1.5-schema.sh /absolute/path/bom-1.5.schema.json" >&2
    exit 64
fi

readonly output_path="$1"
readonly output_directory="$(dirname "$output_path")"
readonly spdx_output_path="$output_directory/spdx.schema.json"
readonly jsf_output_path="$output_directory/jsf-0.82.schema.json"
mkdir -p "$output_directory"
readonly temporary_schema_path="$(mktemp "$output_directory/.bom-1.5.schema.XXXXXX")"
readonly temporary_spdx_path="$(mktemp "$output_directory/.spdx.schema.XXXXXX")"
readonly temporary_jsf_path="$(mktemp "$output_directory/.jsf-0.82.schema.XXXXXX")"

cleanup() {
    rm -f "$temporary_schema_path" "$temporary_spdx_path" "$temporary_jsf_path"
}
trap cleanup EXIT

curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error \
    "$schema_url" --output "$temporary_schema_path"
curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error \
    "$spdx_url" --output "$temporary_spdx_path"
curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error \
    "$jsf_url" --output "$temporary_jsf_path"

readonly schema_actual_sha256="$(shasum -a 256 "$temporary_schema_path" | awk '{print $1}')"
readonly spdx_actual_sha256="$(shasum -a 256 "$temporary_spdx_path" | awk '{print $1}')"
readonly jsf_actual_sha256="$(shasum -a 256 "$temporary_jsf_path" | awk '{print $1}')"
if [[ "$schema_actual_sha256" != "$schema_sha256" ]]; then
    echo "CycloneDX 1.5 schema SHA-256 mismatch" >&2
    exit 65
fi
if [[ "$spdx_actual_sha256" != "$spdx_sha256" ]]; then
    echo "CycloneDX SPDX schema SHA-256 mismatch" >&2
    exit 65
fi
if [[ "$jsf_actual_sha256" != "$jsf_sha256" ]]; then
    echo "CycloneDX JSON-signature schema SHA-256 mismatch" >&2
    exit 65
fi

mv "$temporary_schema_path" "$output_path"
mv "$temporary_spdx_path" "$spdx_output_path"
mv "$temporary_jsf_path" "$jsf_output_path"
printf 'verified CycloneDX 1.5 schema set %s\n' "$output_directory"
