---
observed_at: "2026-09-27T00:14:00Z"
session: "wssp"
area: "hosted CI test execution"
---

# Splitting one test suite into three made CI hit the default test timeout

## Context

The workspace package split moved its tests into three Nx projects. The
pull-request gate runs affected targets with Nx parallelism 3 and two vitest
workers per project, so the three suites now run concurrently on one hosted
runner.

## Friction

The pull-request run failed three specifications with "Test timed out in
5000ms" (two in the sync realization specification, one in the install
direct-intent specification). Locally those tests take 0.8 s to 2.0 s, and
`pnpm run verify:pr` had passed. On the runner the sync realization file took
68 s for 22 tests against 16 s locally.

## Cost / impact

One failed pull-request run and one extra commit before the change could be
enqueued.

## Outcome

The shared execution profile gives CI a 20 s test and hook timeout while the
workstation keeps the defaults, so slow tests still surface locally.

## Evidence

CI run for the pull request: job "Verify proposed change", step "Verify
affected changes", 2 test files failed, 3 tests failed, 343 files passed.
