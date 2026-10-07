---
observed_at: "2026-10-07T20:50:45Z"
session: "ec304b"
area: "public PR release-plan prerequisite"
---

# A missing version plan stopped proposed-change CI

## Context

Opening a draft PR for CLI failure diagnostics after formatting, generated-output
verification and mandatory commit hooks passed. Local affected verification was
still running.

## Friction

The required release version plan was omitted. Proposed-change CI jobs
`remaining-projects` and `workspace-features-2` stopped at `Check release plan`.
Their logs reported touched release projects missing version plans.

## Cost / impact

Two CI jobs failed at the prerequisite. Repair needed a generated version plan,
its local check, and a source-commit update before fresh CI could verify the
candidate. Other jobs had already started.

## Outcome

The published `pnpm run release:plan` workflow generated a fixed-cohort `major`
plan for the breaking diagnostic contract. The existing pre-1.0 policy maps that
plan to the next minor release. `pnpm run release:plan:check --base=origin/main
--head=HEAD` then reported all touched projects covered. This records release
intent; no release was prepared or published.

## Evidence

- CI run: `37684357031`, source `4fbc883b29908476825586fa6ebc9fffd3b4c7e7`.
- Failed job `113008471919`: `NX Touched projects missing version plans`.
- Generated plan: `.nx/version-plans/version-plan-1791406125807.md`.

## Existing context

The same local/CI discovery gap is recorded in
`2026-09-28T170130Z-q7m3ka-verify-affected-omits-release-plan-check.md`.
The release runbook requires the plan; `verify:affected` does not include its
separate check. This occurrence was an omitted prerequisite, not a test failure.
