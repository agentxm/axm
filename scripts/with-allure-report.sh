#!/usr/bin/env bash

# Runs a verification workflow and then generates the Allure report whether or
# not that workflow passed, propagating the workflow's status. Generating a
# report for a failed run is a non-graph step: Nx will not run a dependent
# target after its dependency fails, so `axm:test-report` (which does own the
# sequencing in-graph) cannot produce evidence for the failing case that CI
# most needs it for.
#
# This is a published workflow name under the command execution strategy
# (@craigsmitham/knowledge/software-engineering, principle 4), not a wrapper
# that compensates for a target. Invoke it through the published `*:report`
# package scripts, never by path.
#
# It deliberately does not delete allure-results first. Test targets declare
# their results as Nx outputs, so a cache hit restores them; deleting results
# for suites this invocation will not re-run would drop them from the report.

set -uo pipefail

if (($# == 0)); then
  echo "Usage: scripts/with-allure-report.sh <command> [arguments...]" >&2
  exit 2
fi

command_status=0
"$@" || command_status=$?

report_status=0
allure_results=$(find test-results -type d -name allure-results -print -quit 2>/dev/null || true)
if [[ -n "$allure_results" ]]; then
  pnpm exec nx run axm:allure-report || report_status=$?
fi

if ((command_status != 0)); then
  exit "$command_status"
fi

exit "$report_status"
