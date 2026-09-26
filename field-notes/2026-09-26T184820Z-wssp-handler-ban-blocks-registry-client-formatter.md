---
observed_at: "2026-09-26T18:48:20Z"
session: "wssp"
area: "workspace install vocabulary refactor"
---

# Handler import ban blocked the decision's registry-client import for a formatter

## Context

The agent session implemented the install-vocabulary decision in `packages/core/workspace`. The frozen design says the one CLI consumer of `formatDeprecationWarning` imports it from `@agentxm/registry-client` once the lifecycle entry stops re-exporting it.

## Friction

That consumer is `apps/cli/src/root/list/view.ts`, under `apps/cli/src/root/**`. The CLI handler boundary in `eslint.config.mjs` bans every value import from `@agentxm/registry-client` there. `cli:lint` failed with `@typescript-eslint/no-restricted-imports`. The design text did not mention the ban, and the enforcement decision keeps it.

## Cost / impact

One `cli:lint` round failed. The lint policy had to change, which is outside the decision's stated file set.

## Outcome

The `@agentxm/registry-client` entry moved out of the shared handler pattern group into its own group with `allowImportNames: ["formatDeprecationWarning"]`. Every other value import stays banned, and a case in `scripts/composition-root-lint-exceptions.test.ts` covers the allowance. After the change, `cli:lint` passed.

## Evidence

`apps/cli/src/root/list/view.ts` line 7: `'@agentxm/registry-client' import is restricted from being used by a pattern. Handlers reach transactions, sources, and the Registry only through feature and capability application APIs`.
