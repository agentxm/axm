#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <asset-dir>" >&2
  exit 1
fi

asset_dir="$1"
expected_assets=(
  "axm-darwin-arm64"
  "axm-darwin-x64"
  "axm-linux-arm64"
  "axm-linux-x64"
  "axm-windows-x64.exe"
)

if [ ! -d "$asset_dir" ]; then
  echo "Asset directory does not exist: $asset_dir" >&2
  exit 1
fi

missing_assets=()

for asset in "${expected_assets[@]}"; do
  if [ ! -f "$asset_dir/$asset" ]; then
    missing_assets+=("$asset")
  fi
done

if [ ${#missing_assets[@]} -gt 0 ]; then
  echo "Release assets are missing:" >&2
  printf '  %s\n' "${missing_assets[@]}" >&2
  exit 1
fi

actual_count="$(find "$asset_dir" -maxdepth 1 -type f | wc -l | tr -d ' ')"
expected_count="${#expected_assets[@]}"

if [ "$actual_count" != "$expected_count" ]; then
  echo "Expected $expected_count release assets in $asset_dir, found $actual_count" >&2
  find "$asset_dir" -maxdepth 1 -type f -exec basename {} \; | sort >&2
  exit 1
fi
