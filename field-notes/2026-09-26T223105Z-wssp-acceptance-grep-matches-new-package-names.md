---
observed_at: "2026-09-26T22:31:05Z"
session: "wssp"
area: "step acceptance checks during a package split"
---

# An acceptance grep for the old package path also matches the new package names

## Context

The agent session was carrying out the enforcement step of splitting `packages/core/workspace` into `workspace-kernel`, `extension-kinds`, and `workspace-features`. The step brief said that after the edit, `git grep -n 'packages/core/workspace\b\|@agentxm/workspace/' eslint.config.mjs tools/ nx.json knip.jsonc` must be empty.

## Friction

In `git grep`'s basic regular expressions `\b` treats `-` as a word boundary, so `packages/core/workspace\b` also matches `packages/core/workspace-kernel` and `packages/core/workspace-features`. Before any edit the command matched 45 lines in `eslint.config.mjs`, one in `knip.jsonc`, and the correct new paths in `tools/extension-type-parity`. The same step also required named feature fixture paths under `packages/core/workspace-features/src` to stay in `eslint.config.mjs`. The check as written could never come back empty.

## Cost / impact

The agent checked for the old package with `packages/core/workspace\([^-]\|$\)` instead and renamed the synthetic `workspace` package in `tools/architecture/boundaries.test.mjs` so that check came back empty.

## Outcome

`git grep -n 'packages/core/workspace\([^-]\|$\)\|@agentxm/workspace/\|@agentxm/workspace"' eslint.config.mjs tools/ nx.json knip.jsonc` printed nothing.

## Evidence

`git grep -c 'packages/core/workspace\b\|@agentxm/workspace/' ...` printed `knip.jsonc:1` for `"packages/core/workspace-kernel": {` and `tools/extension-type-parity/project.json:1`.
