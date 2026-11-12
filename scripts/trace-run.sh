#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
receipt_dir=$(mktemp -d "${TMPDIR:-/tmp}/axm-trace.XXXXXXXX")
export AXM_TRACE=1
export AXM_TRACE_RECEIPT="$receipt_dir/receipt.json"
status=0
pnpm run axm "$@" || status=$?
if [[ -f "$AXM_TRACE_RECEIPT" ]]; then
  printf '\nTrace receipt: %s\n' "$AXM_TRACE_RECEIPT" >&2
  cat "$AXM_TRACE_RECEIPT" >&2
else
  printf '\nNo trace receipt was produced; check tracing configuration.\n' >&2
fi
exit "$status"
