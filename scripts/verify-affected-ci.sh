#!/usr/bin/env bash

set -euo pipefail

SUMMARY_FILE=${AXM_CI_PHASE_SUMMARY_FILE:-test-results/ci-verification-summary.md}
NX_LOG_FILE=${AXM_CI_NX_LOG_FILE:-test-results/ci-affected-nx.log}
NX_CACHE_RESULT=""

format_duration() {
  local total_seconds=$1
  printf '%dm %02ds' "$((total_seconds / 60))" "$((total_seconds % 60))"
}

append_phase_result() {
  local name=$1 status=$2 duration=$3
  printf '| %s | %s | %s |\n' "$name" "$status" "$duration" >>"$SUMMARY_FILE"
}

capture_nx_cache_result() {
  local log_file=$1
  NX_CACHE_RESULT=$(grep -oE '[0-9]+/[0-9]+ hit \([0-9]+%\)' "$log_file" | tail -1 || true)
}

finalize_summary() {
  if [[ -n "$NX_CACHE_RESULT" ]]; then
    printf '\n**Nx affected cache:** %s\n' "$NX_CACHE_RESULT" >>"$SUMMARY_FILE"
  fi
}

run_phase() {
  local name=$1 log_file=$2 start_time end_time exit_code duration
  shift 2

  start_time=$(date +%s)
  printf '::group::%s\n' "$name"
  set +e
  if [[ -n "$log_file" ]]; then
    "$@" 2>&1 | tee "$log_file"
    exit_code=${PIPESTATUS[0]}
  else
    "$@"
    exit_code=$?
  fi
  set -e
  printf '::endgroup::\n'

  end_time=$(date +%s)
  duration=$(format_duration "$((end_time - start_time))")
  if ((exit_code == 0)); then
    append_phase_result "$name" "Passed" "$duration"
  else
    append_phase_result "$name" "Failed" "$duration"
    printf '::error title=%s failed::See the expanded phase log for details.\n' "$name"
  fi

  if [[ -n "$log_file" ]]; then
    capture_nx_cache_result "$log_file"
  fi

  return "$exit_code"
}

record_skipped_phase() {
  local name=$1 reason=$2
  printf '::notice title=%s skipped::%s\n' "$name" "$reason"
  append_phase_result "$name" "Skipped" "—"
}

mkdir -p "$(dirname "$SUMMARY_FILE")" "$(dirname "$NX_LOG_FILE")"
cat >"$SUMMARY_FILE" <<'EOF'
### Verification phases

| Phase | Status | Duration |
| --- | --- | ---: |
EOF
trap finalize_summary EXIT

run_phase "Install workspace dependencies" "" pnpm install --frozen-lockfile

if [[ "${AXM_RELEASE_PREPARATION:-false}" == "true" ]]; then
  record_skipped_phase "Validate release plan" "Release preparation commits intentionally update the version plan."
else
  run_phase "Validate release plan" "" pnpm release:plan:check
fi

run_phase "Validate CI image contract" "" pnpm run check:ci-image
run_phase "Validate generated artifacts" "" pnpm run generate:check
run_phase "Validate workspace synchronization" "" pnpm exec nx sync:check
run_phase "Verify affected project graph" "$NX_LOG_FILE" \
  pnpm exec nx affected -t lint typecheck build test e2e --batch --nxBail --outputStyle=static
run_phase "Verify repository scripts" "" \
  pnpm exec nx run-many \
  -t scripts-lint scripts-typecheck scripts-test verify-e2e-boundaries \
  --projects=axm \
  --nxBail \
  --outputStyle=static
