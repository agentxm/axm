## Why

Every command that builds a `Plan<Op>` (install, uninstall, update) needs the same display-confirm-apply flow with identical flag interactions (`--yes`, `--preview`, `--non-interactive`). This logic currently lives inline in the install handler, making it impossible to reuse and easy to get wrong in future handlers. Additionally, the codebase still references a `--dry-run` flag that was never fully implemented — `--preview` replaces it with clearer semantics.

## What Changes

- Add `resolvePlan` as a method on `WorkspaceContextService` that encapsulates the plan-confirm-apply algorithm. The service already knows `yes` and `nonInteractive` from construction options — callers pass only the plan and `preview`
- Add `--preview` CLI flag across all plan-based commands (install, uninstall)
- Wire `nonInteractive` into the plan-confirm-apply flow (currently accepted but ignored)
- Auto-detect CI/CD environments (e.g., `CI=true`) and treat `nonInteractive` as true when detected
- **BREAKING**: Remove all `--dry-run` / `dryRun` references from the codebase in favor of `--preview` / `preview`:
  - `InstallHandlerArgs.dryRun` → removed, replaced by `preview`
  - `UninstallCommandArgs["dry-run"]` and `UninstallHandlerArgs.dryRun` → replaced by `preview`
  - `--dry-run` yargs option removed from install and uninstall command builders
  - `dry-run.e2e.test.ts` renamed/rewritten to test `--preview` behavior
  - E2E tests referencing `--dry-run` updated to use `--preview`
  - `CLAUDE.md` standard flags table: `--dry-run` → `--preview`
  - `docs/designs/dry-run.md` renamed to `docs/designs/plan-confirm-apply.md` (or deleted if fully superseded by the new spec)
  - Root `proposal.md` references updated from `--dry-run` to `--preview`
  - `openspec/specs/cli-skills-install/spec.md` scenarios updated: `dryRun` → `preview`
  - Code comments in `skills/state/types.ts` and `skills/state/index.ts` referencing `dry-run.md` updated
  - Archived changes (`openspec/changes/archive/`) are historical records and left untouched

## Capabilities

### New Capabilities

- `plan-confirm-apply`: `resolvePlan` method on `WorkspaceContextService` — takes a plan and `preview` flag, uses `yes` and `nonInteractive` from service construction options to produce the correct behavior: preview-only, auto-apply, interactive confirm, or safe non-interactive fallback

### Modified Capabilities

- `cli-skills-install`: Replace inline plan-confirm-apply logic with the shared function; replace `dryRun` with `preview`; add `--preview` flag to yargs builder; remove `--dry-run` flag
- `cli-skills-uninstall`: Replace `dryRun` with `preview`; add `--preview` flag; remove `--dry-run` flag

## Impact

- `workspace/service.ts` — add `resolvePlan` to `WorkspaceContextService` interface and `make` implementation
- `cli-commands/skills/install/handler.ts` — replace inline algo with shared function call
- `cli-commands/skills/install/command.ts` — add `--preview`, remove `--dry-run`
- `cli-commands/skills/uninstall/command.ts` — add `--preview`, remove `--dry-run`
- `cli-commands/skills/uninstall/handler.ts` — `dryRun` → `preview`
- `cli-commands/skills/install/dry-run.e2e.test.ts` — rename to `preview.e2e.test.ts`, update tests
- E2E tests in both install and uninstall — `--dry-run` → `--preview`
- `CLAUDE.md` — update standard flags
- `docs/designs/dry-run.md` — rename or delete
- `openspec/specs/cli-skills-install/spec.md` — update `dryRun` scenarios to `preview`
- Root `proposal.md` — update flag references
- Code comments referencing `dry-run.md` — update
