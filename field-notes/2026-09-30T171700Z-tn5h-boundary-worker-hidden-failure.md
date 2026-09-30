---
observed_at: "2026-09-30T17:17:00Z"
session: "tn5h"
area: "Cross-process platform verification diagnostics"
---

# Boundary worker discarded the failure needed for diagnosis

## Context

Windows lifecycle verification exercised the Bun process witness for account-wide physical-boundary coordination.

## Friction

The first worker exited before target-lock entry. Its fixture reported only `refused, closed`, discarding the typed failure and nested cause. The 10,770 ms duration did not establish which operation failed.

## Cost / impact

The existing artifact could not distinguish an account lookup failure from another initialization refusal. Another instrumented platform run became necessary before the failure could be diagnosed.

## Outcome

The account lookup now preserves bounded process failure metadata, and the worker fixture reports a sanitized cause chain. Local diagnostic and boundary controls passed; the Windows diagnosis remains pending.

## Evidence

Public CI run `36748567769`, Windows lifecycle job `110001186282`; `settlement/account-home.ts` and `settlement/test-support/boundary-claim-process.ts` in the workspace-kernel package. Local controls: 22 passed and 3 platform-conditional skips.
