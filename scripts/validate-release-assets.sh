#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <asset-dir>" >&2
  exit 1
fi

bun "$(dirname "$0")/release-checksums.ts" validate "$1"
