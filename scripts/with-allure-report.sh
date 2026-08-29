#!/usr/bin/env bash

set -uo pipefail

if (($# == 0)); then
  echo "Usage: scripts/with-allure-report.sh <command> [arguments...]" >&2
  exit 2
fi

# Test targets may restore their reporting outputs from the Nx cache. Remove
# results from earlier invocations first so the generated report reflects only
# this command (including any results restored during it).
find test-results -type d -name allure-results -prune -exec rm -rf {} + 2>/dev/null || true

command_status=0
"$@" || command_status=$?

report_status=0
allure_results=$(find test-results -type d -name allure-results -print -quit 2>/dev/null || true)
if [[ -n "$allure_results" ]]; then
  pnpm test:report:generate || report_status=$?
fi

if ((command_status != 0)); then
  exit "$command_status"
fi

exit "$report_status"
