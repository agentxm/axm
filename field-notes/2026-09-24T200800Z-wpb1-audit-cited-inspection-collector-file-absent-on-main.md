---
observed_at: "2026-09-24T20:08:00Z"
session: "wpb1"
area: "audit findings handed to implementation"
---

# Audit cited an inspection collector file that does not exist on main

## Context

Implementing the failure-rendering consolidation from the audit's per-finding
document. The inspection finding named `inspection/describe-failure.ts` and
its call sites in `inspection/extension-list/assessment.ts` and
`inspection/version-currency/collectors.ts`.

## Friction

`packages/core/workspace/src/inspection/version-currency/collectors.ts` is
absent at `origin/main` (`ac50e3724`); `wc` reported "No such file or
directory" and a repository grep for `describeInspectionFailure` found only the
two call sites in `assessment.ts`.

## Cost / impact

One extra directory listing and one grep to confirm the file list; no change
to the work, since the remaining call sites were the ones the finding
described.

## Outcome

Deleted `describe-failure.ts` and routed the two `assessment.ts` call sites
through the kernel rendering; nothing else referenced the deleted module.

## Evidence

- `wc: inspection/version-currency/collectors.ts: No such file or directory`
- `grep -rn describeInspectionFailure` → `inspection/extension-list/assessment.ts:28,236,250` only
