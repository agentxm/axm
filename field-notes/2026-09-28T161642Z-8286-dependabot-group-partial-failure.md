---
observed_at: "2026-09-28T16:12:52Z"
session: "8286"
area: "GitHub Dependabot npm updater and grouped PR verification"
---

# Grouped Dependabot run created a PR but finished with errors

## Context

The new weekly npm group was activated on `agentxm/axm` and GitHub ran its native npm updater. The task required evidence that grouping actually produced one proposal.

## Friction

The updater opened PR #467 with 162 updates, then finished with four `unknown_error` results on indirect Babel packages. Its log showed `ERR_PNPM_UPDATE_VERSION_ON_INDIRECT_DEP` when it tried to pin versions of packages that are not direct dependencies. The proposal's first CI run also failed in `specification-metadata:test`: `allure-vitest` resolved `@vitest/runner` 4.1.11 with Vitest 5.0.1, and Vitest could not find its runner.

## Cost / impact

The updater ran from 15:27 to 16:12 UTC and reported failure despite creating the grouped proposal. The grouped proposal cannot pass the ordinary merge gate in its current state. Three earlier individual npm proposals were closed automatically.

## Outcome

Grouping was verified by PR #467. The updater's four indirect update errors and the proposal's CI failure remain open for ordinary dependency review.

## Evidence

- Updater: https://github.com/agentxm/axm/actions/runs/36443579775
- Proposal: https://github.com/agentxm/axm/pull/467
- PR CI: https://github.com/agentxm/axm/actions/runs/36448942069
- Error: `ERR_PNPM_UPDATE_VERSION_ON_INDIRECT_DEP`
