## Context

This change audits all CLI command handlers and removes remaining direct mutation paths from handlers that should delegate through `ws.resolvePlan()`.

Current state from the proposal:

- 18 handlers audited
- 12 fully compliant (`resolvePlan` or query-only)
- 6 gaps:
  - non-compliant: `skills new`, `packs new`, `packs add`, `packs remove`
  - partial: `skills enable`, `skills disable`

The codebase already has the required architecture:

- typed `Operation`/`Plan` model
- typed handler registry (`Handlers<Op>`)
- centralized plan apply + preview/confirm flow in `Workspace.resolvePlan`

The design goal is to finish this migration without changing command intent.

## Goals / Non-Goals

**Goals:**

- Move all mutating behavior in the 6 audited handlers behind operation handlers executed by `ws.resolvePlan()`.
- Keep handlers as orchestration only: validate input, collect read-only context, build plan.
- Ensure `--preview` works for all affected commands.
- Reuse existing operation patterns and typed error handling (`CliError`).
- Require quality gates to pass: `pnpm lint`, `pnpm test`, and `pnpm typecheck`.

**Non-Goals:**

- Backward compatibility is not a goal for internal implementation details.
- No schema redesign for settings or lockfile.
- No new user-facing feature set beyond consistent plan execution behavior.
- No refactor of unrelated compliant handlers.

## Decisions

### 1. Introduce operations for direct-mutation handlers

Create operation handlers for the 4 fully non-compliant handlers:

- `NewSkillOperation` (`skills new`)
- `NewPackOperation` (`packs new`)
- `AddToPackOperation` (`packs add`)
- `RemoveFromPackOperation` (`packs remove`)

These live with existing feature operations:

- `packages/cli/src/extensions/skills/operations/`
- `packages/cli/src/extensions/packs/operations/`

Handlers build plans and delegate execution via `ws.resolvePlan(plan, handlers)`.

Why this over keeping direct mutation in handlers:

- consolidates mutation behavior in operation layer
- restores one execution model for preview/apply
- keeps handler tests focused on orchestration, not filesystem writes

Alternative considered: keep current direct writes and wrap a “fake plan” around them. Rejected because mutations would still bypass operation handlers.

### 2. Route all `enable`/`disable` paths through existing operations

Keep `EnableSkillOperation` and `DisableSkillOperation` as the operation types for toggling, but broaden operation behavior so handlers never mutate settings directly.

`skills enable`:

- handler always builds one `enable-skill` operation for valid installed+disabled input
- operation handles both:
  - lock-backed installs (existing symlink/lock update path)
  - settings-only entries without lock entry (settings update only)

`skills disable`:

- handler always builds one `disable-skill` operation for valid installed+enabled input
- operation handles both:
  - configured lock-backed installs (existing removal/update path)
  - implicit installs without settings entry (promote to settings entry with `enabled: false` inside operation)

Required behavior matrix (normative):

- target not installed -> fail with `SKILL_NOT_FOUND`
- target already enabled/disabled -> no-op with informational log
- disabled + lock entry (`enable`) -> execute lock-backed enable path (symlink/file path + lock agents sync + settings enabled=true)
- enabled + lock entry (`disable`) -> execute lock-backed disable path (symlink/file path + lock agents clear + settings enabled=false)
- configured + no lock entry -> settings-only toggle in operation (no handler direct mutation)
- implicit + disable -> operation promotes to configured disabled entry; if lock entry exists, also executes lock-backed disable path

Source fallback for implicit/configured promotion is deterministic:

1. use `installedEntry.source` when present
2. else derive source string from lock entry source metadata
3. else fail with `CliError` (no silent fallback to name-only source)

Why this over introducing extra “promote” operations:

- avoids splitting one user intent across multiple operation names
- keeps the plan view simple for users
- minimizes handler branching

Alternative considered: add dedicated promotion operations for implicit/transitive paths. Rejected as unnecessary operation-surface growth.

### 3. Add preview support to pack commands in scope

`packs new`, `packs add`, and `packs remove` command definitions gain `--preview` and pass it through runtime workspace options.

This is required so the newly plan-based handlers can actually expose preview mode to users.

Why this over leaving CLI args unchanged:

- without `--preview`, moving to plan execution would still hide key UX value
- this aligns these commands with existing command conventions used elsewhere

Alternative considered: use plan execution but hardcode `preview: false`. Rejected as inconsistent with the proposal’s UX goal.

### 4. Keep handler responsibilities read-only + plan assembly

Handlers may still do read-only context gathering needed for validation and accurate plan labels/readiness (for example: manifest existence checks, glob expansion inputs, installed state checks). They do not write files/settings/lockfile directly.

Mutating work moves to operation handlers:

- filesystem writes
- settings writes
- lockfile writes
- symlink creation/removal

Why this split:

- preserves fast preflight validation and clear errors
- keeps actual side-effects centralized in operation handlers

Alternative considered: move all reads into operations. Rejected because handlers need read context for deterministic plan construction and user feedback before apply.

For `packs add/remove`, handlers compute the exact manifest delta used for preview and pass that delta to operations for apply. Operations do not recompute glob expansion from scratch.

To protect against drift between preview and apply, operations validate the target manifest precondition (for example, expected hash/version or equivalent optimistic check) before writing and fail with a `CliError` conflict when stale.

### 5. Use explicit operation unions per command handler

Each refactored handler keeps a narrow operation union and exhaustive handler map when calling `resolvePlan`.

Examples:

- `skills new`: `Plan<NewSkillOperation>`
- `packs new`: `Plan<NewPackOperation>`
- `packs add`: `Plan<AddToPackOperation>`
- `packs remove`: `Plan<RemoveFromPackOperation>`
- `skills enable`: `Plan<EnableSkillOperation>`
- `skills disable`: `Plan<DisableSkillOperation>`

Why:

- compile-time exhaustiveness is preserved by `Handlers<Op>`
- no generic “catch-all” operation registry needed

Alternative considered: one shared broad union for many handlers. Rejected because it weakens local type clarity.

### 6. Testing strategy is split by layer

- Command tests: verify `--preview` argument parsing for updated pack commands.
- Handler tests: verify plan construction + `ws.resolvePlan` usage; no direct mutation APIs called.
- Operation tests: verify actual side-effects and edge cases.

Critical regression cases:

- `skills enable` no-lock path executes via operation and updates settings correctly
- `skills disable` implicit path executes via operation and writes disabled settings entry
- `packs add/remove` remain manifest-only edits (no install/uninstall side-effects)
- `--preview` for newly updated commands performs no writes

## Risks / Trade-offs

- [Behavior drift in enable/disable edge paths] -> Add regression tests for lock-backed and no-lock paths before refactor.
- [Pack manifest edit regressions during operation migration] -> Keep existing validation semantics and assert unchanged error codes/messages where possible.
- [More operation files increases maintenance] -> Keep operations small, feature-local, and exported through existing per-feature barrels only.
- [Preview/apply semantics differ from previous immediate behavior] -> This is intentional for consistency; document in command specs.

## Migration Plan

1. Add new operation types/handlers and export them from feature operation barrels.
2. Refactor `skills new`, `packs new`, `packs add`, `packs remove` handlers to plan + resolve flow.
3. Refactor `skills enable`/`skills disable` handlers to remove direct mutation branches.
4. Expand `enableSkill`/`disableSkill` operation implementations to cover edge paths now handled directly in handlers.
5. Add `--preview` support to `packs new/add/remove` command definitions and runtime wiring.
6. Update/add tests by layer (command, handler, operation).
7. Run `pnpm lint`, `pnpm test`, and `pnpm typecheck`.

Rollback:

- Revert refactored handlers and new operations in one change set.
- No data migration rollback is required (no schema changes).

## Open Questions

None.
