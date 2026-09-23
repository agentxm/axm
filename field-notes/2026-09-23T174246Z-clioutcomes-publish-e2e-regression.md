---
observed_at: "2026-09-23T17:42:46Z"
session: "clioutcomes"
area: "CLI publish process outcomes"
---

# Per-type publish wrapper dropped an exit outcome

## Context

A CLI refactor made reported command exit statuses returned values. The publish e2e suite exercises a pack whose omitted dependency is unavailable.

## Friction

The PR e2e gate reported exit 1 where the pack publish test expected exit 9. A focused Nx run reproduced the same failure. Both per-type publish wrappers had called the outcome-returning handler without returning its value.

## Cost / impact

The e2e gate failed one case; 510 other cases passed in that run. The failed case required a focused reproduction and an additional edit and verification cycle.

## Outcome

Both wrappers now return the handler outcome. The focused compiled CLI e2e passed, including its zero-write checks for the invalid prospective graph.

## Evidence

`apps/cli-e2e/src/cli-commands/packs/publish/publish.e2e.ts:447` observed exit 1 versus expected 9 before the fix. `pnpm exec nx run cli-e2e:e2e-main --args='src/packs.e2e.test.ts -t "blocks a pack when omitted dependencies are unavailable"'` passed after the fix.
