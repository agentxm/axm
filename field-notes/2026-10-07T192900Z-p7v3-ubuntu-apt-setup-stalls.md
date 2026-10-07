---
observed_at: "2026-10-07T19:29:00.733234+00:00"
session: "publication-file-selection-p7v3"
area: "GitHub Actions runner setup"
---

# Ubuntu package setup repeatedly stalled required verification

## Context

The publication file-selection pull request was passing source verification and entering the native merge queue.

## Friction

One source-check retry spent 17 minutes 31 seconds in Ubuntu package setup without reaching dependency installation or tests. Its log showed repeated Azure mirror ignores followed by Ubuntu archive metadata, then no progress until cancellation. A fresh retry passed all 315 applicable CLI E2E tests. The subsequent queue run again left three jobs in toolchain setup for more than 20 minutes while 19 other jobs completed successfully.

## Outcome

The pull request was dequeued and cancellation was requested for its stalled queue run. The owning setup action now passes APT's native retry and HTTP/HTTPS timeout options, matching the upstream runner-image fix and preserving ARM64's distinct mirror configuration. Local workflow validation passed; integrated verification is pending.

## Evidence

Source run 37663233970; queue run 37671533450. Upstream runner-image issue: https://github.com/actions/runner-images/issues/14594 and fix https://github.com/actions/runner-images/pull/14643.
