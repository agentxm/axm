---
observed_at: "2026-09-28T17:01:30Z"
session: "bf99df21"
area: "repository task interface: pre-merge verification"
---

# verify:affected passed locally while CI failed on a missing version plan

## Context

Landing the official-skill canonical-selection change through an existing pull request whose description recorded `pnpm run verify:affected` (9 projects), `format:check`, and `generate:check` as passing.

## Friction

The pull request's `Verify proposed change` job failed before running any verification step: `pnpm exec nx release plan:check` reported the touched project `cli` had no version plan. No local workflow the repository guidance names for pre-merge verification (`verify:affected`) runs `release plan:check`; it is reached only through `ci:workspace` / `ci` or the CI job.

## Cost / impact

One failed CI run for the pull request and one diagnosis pass in this session to read the job log and identify the missing plan; the substantive verification jobs stayed pending behind the failure.

## Outcome

Added `.nx/version-plans/official-skill-canonical-selection.md` (`patch`). `NX_BASE=origin/main NX_HEAD=HEAD pnpm exec nx release plan:check` then reported all touched projects covered.

## Evidence

Job log line: `The following touched projects do not feature in any version plan files: - cli` followed by `Process completed with exit code 1` in the `Verify proposed change` job of run 36453863630. `package.json` scripts: `verify:affected` does not invoke `release:plan:check`; the CI step runs `pnpm exec nx release plan:check` before `verify:pr:source`.
