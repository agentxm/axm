---
observed_at: "2026-10-01T04:18:42Z"
session: "d82a"
area: "Windows compiled CLI verification"
---

# Windows account-profile query exceeded its deadline

## Context

Running required pull-request verification for the agent-catalog refresh.

## Friction

The compiled Windows smoke case that preserves native case aliases and
remaining Skill consumers failed during installation. The existing Bun
account-home query was killed with SIGTERM after its ten-second deadline;
the sanitized failure reported `account-query-failed`. Thirteen other binary
smoke cases and the Windows workspace lifecycle job passed on the same head.

## Outcome

The query continues to fail closed. No environment-variable fallback or
timeout change was introduced. An early single-job rerun request was refused
while the parent workflow was active, so it did not execute a retry. A later
source-fixture correction requires a new pull-request revision; this failed
attempt remains part of the verification record.

## Evidence

PR #500, run `36814127305`, job `110215783358`, source head `38cc71a0`.
The affected query is in `workspace-kernel/src/settlement/account-home.ts`
and is unchanged by the catalog refresh.
