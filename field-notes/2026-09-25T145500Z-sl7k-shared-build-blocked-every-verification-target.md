---
observed_at: "2026-09-25T14:55:00Z"
session: "sl7k"
area: "repository task interface: workspace typecheck and test targets during concurrent multi-agent edits"
---

# Shared `workspace:build` blocked every verification target while other agents' edits were in flight

## Context

Consolidating install selection into one policy inside a worktree that several
agents were editing concurrently, each assigned separate files. The task's
verification path was `pnpm exec nx run workspace:typecheck`, `workspace:test`,
`cli:typecheck`, and `cli:test`.

## Friction

`workspace:typecheck`, `workspace:test`, and `cli:test` all depend on
`workspace:build`, which compiled the whole package with TypeScript 6 and failed
on files this work package never touched (`skills/manager.ts`,
`subagents/manager.ts`, and later a syntax error in
`desired-state/workspace/lock-entry-to-ref.ts`). While those files were broken,
none of the assigned targets produced any signal about this package's own
changes.

The fallback of running the same compiler invocation the target wraps
(`tsc -p tsconfig.spec.json --noEmit` from the package directory) was unusable:
that configuration resolves sibling modules through built `dist` declarations,
so it reported thousands of TS6305 "output file has not been built from source
file" errors and hid real diagnostics.

## Cost / impact

Roughly 40 minutes of retries across the session before the assigned targets
ran. Interim signal came only from targets without a build dependency
(`workspace:test:policy-coverage`, `architecture:check`, `architecture:test`,
`workspace:lint`, `cli:lint`) and from direct `vitest run` invocations with
`NODE_OPTIONS=--conditions=axm-source`, which the repository instructions
discourage. The direct CLI `vitest run` could not resolve `@agentxm/workspace/*`
at all, so CLI tests had no interim check.

## Outcome

Once the other agents fixed their files, `workspace:typecheck`, `workspace:test`
(focused), `cli:typecheck` (for this package's files), and `cli:test` (focused)
all ran through the targets and passed for the files in this work package.

## Evidence

- `pnpm exec nx run workspace:typecheck` output: "Running target typecheck for
  project workspace and 18 tasks it depends on failed ... Failed tasks:
  workspace:build"
- `pnpm exec tsc -p tsconfig.spec.json --noEmit` in `packages/core/workspace`:
  TS6305 on every sibling import, for example
  `dist/src/lifecycle/errors.d.ts has not been built from source file`
- `packages/core/workspace/project.json` `test.dependsOn: ["build", ...]`
