#!/usr/bin/env bash

# The host owns a clean results directory. Nx restores selected cached outputs;
# Allure owns command execution, report generation on failure, and exit status.
# Invoke through published *:report workflows or the CI host boundary.

set -euo pipefail

if (($# == 0)); then
  echo "Usage: scripts/with-allure-report.sh <command> [arguments...]" >&2
  exit 2
fi

# A cache hit with existing outputs emits no new files for Allure's watcher.
# Removing generated outputs forces restoration and excludes unselected suites.
rm -rf test-results
exec pnpm exec allure run --ignore-logs -- "$@"
