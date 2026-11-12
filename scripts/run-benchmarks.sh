#!/usr/bin/env bash
# Nx owns compilation/export prerequisites; only the actual operation runner is isolated.
set -euo pipefail
script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ ${AXM_BENCHMARK_SUITE:-} == operations ]]; then
  exec bash "$script_directory/with-private-network.sh" bun "$script_directory/bench.ts" "$@"
fi
exec bun "$script_directory/bench.ts" "$@"
