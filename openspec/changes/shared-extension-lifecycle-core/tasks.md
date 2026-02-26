## 1. Plan Infrastructure Evolution

- [ ] 1.1 Add failing tests for shared lockfile/settings mutation parity across install/uninstall operations.
- [ ] 1.2 Evolve existing `PlannedJobStep` to `ReadyJobStep | ErrorJobStep` union. Ready steps carry a `run` closure; error steps carry a `message`. Remove `operation` payload from steps. Remove `skip` and `warn` readiness states (operations are idempotent).
- [ ] 1.3 Replace `OperationResult` with unified `JobStepResult` type (`"success" | "no-op" | "error"` + `message`).
- [ ] 1.4 Simplify `resolvePlan` signature from `resolvePlan(plan, handlerMap)` to `resolvePlan(plan)`. Refactor `applyPlan` to execute `step.run()` directly for ready steps and promote error steps to error results (no handler-map dispatch).
- [ ] 1.5 Remove `Operation`, `OperationMap`, `defineOperationMetadata`, and the operation handler registry.
- [ ] 1.6 Remove `augmentPlan` and lockfile policy metadata (`ignore_if_missing`, `read_recover_if_missing`, `materialize_if_missing`). Lockfile recovery is out of scope for this change.
- [ ] 1.7 Define `ExtensionTarget` as discriminated union (`SkillExtensionTarget | PackExtensionTarget | CommandExtensionTarget | McpServerExtensionTarget`). Add `ExtensionTargetFor<TRef>` using `Extract<>`. Add `targetFromRef` helper.
- [ ] 1.8 Define `ExtensionHooks<TRef>` type with `materializeInstall`, `materializeUninstall`, `upsertSettingsEntry`, `removeSettingsEntry`, `upsertLockfileEntry`, `removeLockfileEntry`. Enforce type-safe uninstall target narrowing via `ExtensionTargetFor<TRef>`.
- [ ] 1.9 Implement shared install operation workflow (`buildInstallOperation`, `runInstallOperation`) calling hook methods in canonical order (`materialize` → `upsertLockfile` → `upsertSettings`).
- [ ] 1.10 Implement shared uninstall operation workflow (`buildUninstallOperation`, `runUninstallOperation`) with dependency-retention policy (`isExtensionRequiredByInstalledPack` branch returns `no-op`; otherwise `materializeUninstall` → `removeLockfile` → `removeSettings`).
- [ ] 1.11 Ensure uninstall target derivation includes lockfile-backed context (namespace where available) before operation execution.
- [ ] 1.12 Implement failure semantics: if a step's `run` effect fails, mark as errored in results; remaining steps in the job continue executing (no early abort). Partial state is handled by idempotent re-runs.
- [ ] 1.13 Run `pnpm typecheck` and fix errors.

## 1b. Command-Family Workflow Foundation

- [ ] 1b.1 Add failing tests for install-family and uninstall-family workflow phase order.
- [ ] 1b.2 Define shared command primitives plus two family workflows (`runInstallCommandWorkflow`, `runUninstallCommandWorkflow`).
- [ ] 1b.3 Implement diagnostics hooks for source-host probe logging in install-family workflow.
- [ ] 1b.4 Remove `skills install --list`; use `--preview` for discovery/inspection.
- [ ] 1b.5 Remove `--agent` from `skills install` and `skills uninstall` command args/handlers. Skill materialization uses `ws.getConfiguredAgents()` for workspace-scoped agent symlink creation.
- [ ] 1b.6 Add migration notes/release-note entry for CLI behavior changes (`--list` removal, skills `--agent` removal).
- [ ] 1b.7 Run `pnpm typecheck` and fix errors.

## 2. Skills Migration (Native + Non-Native)

- [ ] 2.1 Add/adjust tests for skill install/uninstall via install-family/uninstall-family workflows, including `PackagingKind` branch behavior.
- [ ] 2.2 Add `InstallSkillCommandIntent` and `UninstallSkillCommandIntent` plus command-local `finalizeIntent`/plan builders.
- [ ] 2.3 Implement `skillHooks: ExtensionHooks<SkillExtensionRef>` with native vs non-native materialization. `materializeInstall` fetches agent list via `ws.getConfiguredAgents()` and creates symlinks for all configured agents. Settings/lockfile hooks delegate to existing `WorkspaceContextService` methods (`ws.setSkill`, `ws.setSkillLock`, `ws.removeSkill`), preserving semaphore serialization.
- [ ] 2.4 Migrate skill handlers to install-family/uninstall-family workflows.
- [ ] 2.5 Remove duplicated lockfile/settings mutation logic from skill operation `run` effects.
- [ ] 2.6 Run `pnpm typecheck` and fix errors.

## 3. Pack Migration (Cross-Type Intents)

- [ ] 3.1 Add/adjust tests for pack dependency expansion into cross-type install/uninstall intents (`skill` only in this change).
- [ ] 3.2 Add `InstallPackCommandIntent` (holds `PackExtensionRef`) and `UninstallPackCommandIntent` (holds `PackExtensionTarget`, not `PackExtensionRef` — uninstall is lockfile-backed) plus command-local `finalizeIntent`/plan builders.
- [ ] 3.3 Implement `packHooks: ExtensionHooks<PackExtensionRef>` for supported types (`skill` only in this change), including settings/lockfile mutation methods delegating to workspace service.
- [ ] 3.4 Pack plan builders use explicit generic type params for type-safe hook dispatch (`buildInstallOperation<PackExtensionRef>(packHooks, ...)`, `buildInstallOperation<SkillExtensionRef>(skillHooks, ...)`).
- [ ] 3.5 Keep expanded cross-type target order as produced by pack planning (no dedupe layer; rely on idempotent operation semantics).
- [ ] 3.6 Migrate pack handlers to install-family/uninstall-family workflows.
- [ ] 3.7 Remove duplicated lockfile/settings mutation logic from pack operation `run` effects.
- [ ] 3.8 Run `pnpm typecheck` and fix errors.

## 4. Placeholders, Parity Hardening, and Cleanup

- [ ] 4.1 Keep `mcp-server` and `command` lifecycle integration as explicit no-op placeholders in this change.
- [ ] 4.2 Add contract tests that `skill` and `pack` hooks pass shared install/uninstall invariants (lockfile parity, idempotent re-application, dependency retention on uninstall).
- [ ] 4.3 Validate preview/apply parity: preview does not invoke any `run` effect; apply produces `JobStepResult` per step.
- [ ] 4.4 Validate source/discovery diagnostics parity across `skill`/`pack` install handlers using install-family workflow.
- [ ] 4.5 Run `pnpm lint` and fix issues.
- [ ] 4.6 Run `pnpm test` and fix failures.
- [ ] 4.7 Run `pnpm test:e2e` for impacted suites and fix failures.

## Scope Guard

- [ ] SG.1 Confirm no `command` or `mcp-server` lifecycle integration is introduced in this change beyond explicit no-op placeholders.
- [ ] SG.2 Confirm `augmentPlan` and lockfile policy metadata are removed, not partially retained.
