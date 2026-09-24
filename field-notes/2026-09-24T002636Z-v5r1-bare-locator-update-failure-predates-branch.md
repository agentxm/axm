---
observed_at: "2026-09-24T00:26:36Z"
session: "f6efa5b7-6d4a-4069-9285-9b1fa640211c"
area: "targeted update of a directly pinned Pack member"
---

# Bare-locator pin fails targeted update on main and on the branch

## Context

Final review of the single-ownership branch checked whether a targeted update
failing after a hand-written bare-locator pin was a regression of the branch.

## Friction

A workspace accepts the shared-member scenario at 1.0.0: two Packs require
`@acme/skills/review` and `axm.json` pins it directly. The person then writes
the direct pin as the bare locator `@acme/skills/review@1.1.0` and runs a
targeted update of `@acme/skills/review`. The one unit fails and is restored.
The same update with the recorded form `test:@acme/skills/review@1.1.0` commits.

## Cost / impact

One temporary reproduction test on each revision, one instrumented run, and one
temporary `origin/main` worktree with a dependency install.

## Outcome

Both revisions fail the same way, so the failure predates the branch and was
left unfixed. The reproduction files, the instrumentation, and the temporary
worktree were removed.

## Evidence

- Revisions: `origin/main` at `8257c7a74` and branch tip `e84fe318d`.
- Command on each revision, against a temporary reproduction test beside
  `advances-resolution-within-intent.spec.ts`:
  `pnpm exec nx run workspace:test --args="src/lifecycle/update/review-bare-locator-repro.test.ts"`.
- Unit on both revisions: state `failed`, disposition `restored`, message
  `Targeted update changed desired ownership or owning pack evidence (internal)`.
- Instrumented fingerprint inputs on the branch differed only in the raw direct
  source: `@acme/skills/review@1.1.0` before the transition and
  `test:@acme/skills/review@1.1.0` under it. The public context, Pack sources,
  and Pack evidence were identical.

## Existing context

An earlier note from this session,
`2026-09-23T235600Z-w3p6-bare-locator-pin-failed-targeted-update.md`, records the
first encounter. The direct advance reuses the install plan, which records the
source-qualified form. The postcondition without a requested range compares the
whole fingerprint, and that fingerprint includes the raw direct source.
