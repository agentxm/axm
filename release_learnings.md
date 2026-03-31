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

## Application, Build, Tooling Issues

- `NX_TUI=false pnpm release:prepare --dry-run` failed immediately with `Cannot find module '@axm.sh/utils/unstable/env'` from `scripts/release-shared.ts`. Root cause: the Bun release script imported a workspace package export that resolves to built `dist` output, so the script could not boot in a clean checkout without prior build artifacts.
- Fix applied: `scripts/release-shared.ts` now reads `GITHUB_REPOSITORY` directly from `process.env`, and `scripts/release-shared.test.ts` now runs `bun scripts/validate-release-tag.ts` as a regression check for Bun-side script boot.
