# Release Learnings

## Release Workflow Friction, Issues, Opportunities

- Missing required version plan on `main`. `CONTRIBUTING.md#releasing` requires a pending plan in `.nx/version-plans/`, but none existed for the unreleased commit after `cli-v0.0.34`. Releasing from `main` therefore starts with manual investigation instead of a ready-to-run flow.
- `pnpm release:plan` is optimized for PR-time usage via `nx release plan --only-touched`. On a clean `main` branch, that shape is not useful for reconstructing a missing plan, and ad hoc `nx release plan` fallbacks were not obvious.
- `nx release plan` fallback paths were rough in practice:
  - `--group __default__` failed because the fixed release group is unnamed.
  - `--projects utils,core,cli` failed because fixed-version workspaces cannot be targeted that way.
  - Net result: the documented fallback for a missing plan is still effectively manual.
- `nx release plan --printConfig` emitted `Unable to locate swc-node or ts-node` before printing the resolved config. The warning did not block the command, but it adds noise during release debugging.
- `NX_TUI=false pnpm run ci` still produced a large amount of spinner/control-sequence noise because the root `ci` script invokes plain `nx` commands without forcing static output. The release flow is readable, but not clean.
- The full CI gate emitted repeated `NO_COLOR` vs `FORCE_COLOR` warnings and `MaxListenersExceededWarning` messages during the Nx/E2E run. They did not fail the build, but they dilute useful release signal.
- The slowest release gate by far was `cli-e2e:e2e`, which took about 1 minute inside the full CI pipeline. That is acceptable, but it dominates release prep feedback time.
- `pnpm release:prepare` surfaced the CI failure only as `The pre-version command failed` until it was rerun separately. The actual blocker was buried in the nested Nx task output, so the release path required an extra manual reproduction step before the failing project was clear.
- The root `ci` target completed successfully but still printed `Nx detected a flaky task` for `cli:test`. In this run the flake warning reflected earlier resolver failures during diagnosis, not a final red build, so the messaging remained noisy even after the graph was stabilized.

## Application, Build, Tooling Issues

- `NX_TUI=false pnpm release:prepare --dry-run` failed immediately with `Cannot find module '@axm.sh/utils/unstable/env'` from `scripts/release-shared.ts`. Root cause: the Bun release script imported a workspace package export that resolves to built `dist` output, so the script could not boot in a clean checkout without prior build artifacts.
- Fix applied: `scripts/release-shared.ts` now reads `GITHUB_REPOSITORY` directly from `process.env`, and `scripts/release-shared.test.ts` now runs `bun scripts/validate-release-tag.ts` as a regression check for Bun-side script boot.
- `cli-spike-e2e` was exercising `packages/cli-spike/dist/src/main.js` via `bun run`, which left the test artifact sensitive to workspace package build outputs during the full CI graph. In the release gate this showed up as `Cannot find module '@axm.sh/core/unstable/telemetry'` from the built spike runtime.
- Fix applied: `cli-spike` now has a `compile` target that produces a self-contained `dist/bin/axm-spike` binary, and `cli-spike-e2e` now depends on that compiled artifact instead of invoking the raw `dist/src` entrypoint.
- `cli-e2e` had a parallel-run flake: `src/skills.e2e.test.ts` passed in isolation, but the full `cli-e2e:e2e` target failed in `skills uninstall --preview` assertions when multiple E2E files ran together. Root cause appears to be shared use of the repo fixture path at `src/fixtures/skills-repo` across parallel workers.
- Fix applied: `packages/cli-e2e/src/utils.ts` now gives each Vitest worker its own temporary copy of the skills repo fixture while preserving a stable fixture path within that worker.
- `cli-e2e:e2e` originally spawned nested `nx run ...` commands for `e2e-main`, `binary-smoke`, and `install-verification`. Under the root batched CI graph that second Nx layer overlapped with outer test/build tasks and produced intermittent resolver failures in `cli:test`.
- Fix applied: `packages/cli-e2e/project.json` now runs the three Vitest suites directly inside the `cli-e2e:e2e` target, leaving dependency scheduling to the outer Nx graph.
- `cli-spike:compile` was initially only dependent on `cli-spike:build`, which was not strong enough under the full batched graph because the compiled binary still needs transitive workspace build outputs on disk.
- Fix applied: both `cli-spike:compile` and `cli:compile` now declare `^build` explicitly so compiled binary targets wait for transitive build outputs instead of relying on indirect target sequencing.
