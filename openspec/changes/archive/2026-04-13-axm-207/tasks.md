> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Shared version-currency module

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Create `packages/core/src/unstable/workspace/version-currency/` directory with `index.ts` barrel
- [x] 1.2 Write tests for `checkCurrency` function covering: current extension, minor/patch update available, major update available, no matching constraint version, single-version index
- [x] 1.3 Implement `CurrencyResult` type and `checkCurrency` function using `resolveVersionWithConstraint` and `selectVersion` from existing version-constraints/registry utilities
- [x] 1.4 Typecheck: `pnpm nx run core:typecheck` — fix any errors
- [x] 1.5 Write tests for per-type currency collectors: skills, commands, subagents, MCP servers, packs — mock `Workspace` and `RegistryClient` services, verify `ExtensionCurrencyEntry` output shape
- [x] 1.6 Implement `ExtensionCurrencyEntry` type and per-type currency collector functions that read configured entries, read lock entries, fetch `ExtensionIndex` per entry (unbounded concurrency), and call `checkCurrency`
- [x] 1.7 Implement `collectAllCurrencyEntries` aggregator that calls all per-type collectors and merges results
- [x] 1.8 Export public types and functions from `@agentxm/client-core/unstable/workspace`
- [x] 1.9 Typecheck: `pnpm typecheck` — fix any errors including @effect/language-service diagnostics
- [x] 1.10 Lint: `pnpm lint` — fix any errors
- [x] 1.11 Test: `pnpm test` — fix any failures
- [x] 1.12 E2E: `pnpm test:e2e` — fix any failures
- [x] 1.13 Kill any vitest worker processes

## 2. Doctor `extensions-current` check

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [x] 2.1 Add `extensionsCurrent: "extensions-current"` to `CHECK_IDS` in `packages/core/src/unstable/workspace/doctor/types.ts`
- [x] 2.2 Write tests for `extensions-current` check: update-available finding emission, major-update-available finding emission, all-current produces no findings, skip when extensions-installed fails, non-registry extensions excluded, finding action references `axm update <ref>`
- [x] 2.3 Implement `extensions-current` check in `packages/core/src/unstable/workspace/doctor/checks/extensions-current.ts` using `defineCheck` with `dependsOn: ["extensions-installed"]`, `prepareContext` calling currency collectors, single diagnostic emitting `info`-severity findings
- [x] 2.4 Register the check in `packages/core/src/unstable/workspace/doctor/diagnose.ts` — add to the `runCheckGraph` array
- [x] 2.5 Typecheck: `pnpm typecheck` — fix any errors including @effect/language-service diagnostics
- [x] 2.6 Lint: `pnpm lint` — fix any errors
- [x] 2.7 Test: `pnpm test` — fix any failures
- [x] 2.8 E2E: `pnpm test:e2e` — fix any failures
- [x] 2.9 Kill any vitest worker processes

## 3. Root `axm outdated` command

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Phase 3 and Phase 2 are independent — launch as parallel subagents.

- [x] 3.1 Create `packages/cli/src/root/outdated/` directory
- [x] 3.2 Write tests for outdated handler: outdated extensions shown, all-current message, no-configured-extensions message, type filter, JSON output shape
- [x] 3.3 Implement `command.ts` with `--scope`, `--type`, `--json` flags
- [x] 3.4 Implement `handler.ts` calling `collectAllCurrencyEntries`, filtering to non-current entries, rendering human table or JSON envelope
- [x] 3.5 Implement human output renderer: table with Extension, Installed, Constraint, Latest columns; major-update indicator; summary line
- [x] 3.6 Register `outdated` command in `packages/cli/src/app.ts` under the appropriate group
- [x] 3.7 Typecheck: `pnpm typecheck` — fix any errors including @effect/language-service diagnostics
- [x] 3.8 Lint: `pnpm lint` — fix any errors
- [x] 3.9 Test: `pnpm test` — fix any failures
- [x] 3.10 E2E: `pnpm test:e2e` — fix any failures
- [x] 3.11 Kill any vitest worker processes

## 4. Root `axm update` command

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Phase 4 can run in parallel with Phases 2 and 3.

- [x] 4.1 Create `packages/cli/src/root/update/` directory
- [x] 4.2 Write tests for FQN intent resolution: valid FQN parses to correct type, invalid format errors with guidance, non-registry source errors with redirect to per-type command
- [x] 4.3 Implement `resolve-root-update-intent.ts` reusing `parseRegistryInstallTarget` from `root/shared/`
- [x] 4.4 Write tests for workspace update handler: builds plan across all types, no-configured-extensions message, preview mode, yes mode skips confirmation
- [x] 4.5 Implement `workspace-update.ts` with per-type collectors following the workspace-install pattern — call per-type update workflows, merge fragments and sections
- [x] 4.6 Implement `workspace-update-handler.ts` orchestrating plan building → preview/apply
- [x] 4.7 Write tests for FQN dispatch handler: routes skill FQN to skills update, routes command FQN to commands update, etc.
- [x] 4.8 Implement `handler.ts` with two-path dispatch: `Option.match(source, { onNone: handleWorkspaceUpdate, onSome: runUpdateIntent })`
- [x] 4.9 Implement `command.ts` with `source` (optional arg), `--scope`, `--yes`, `--force`, `--preview` flags
- [x] 4.10 Register `update` command in `packages/cli/src/app.ts` under the EXTENSIONS group
- [x] 4.11 Wire per-type update workflow action layers in `packages/cli/src/runtime.ts` if not already present
- [x] 4.12 Typecheck: `pnpm typecheck` — fix any errors including @effect/language-service diagnostics
- [x] 4.13 Lint: `pnpm lint` — fix any errors
- [x] 4.14 Test: `pnpm test` — fix any failures
- [x] 4.15 E2E: `pnpm test:e2e` — fix any failures
- [x] 4.16 Kill any vitest worker processes

## 5. Integration verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3, 4.

- [x] 5.1 Verify `axm doctor` includes `extensions-current` check in output (run against a test workspace with the local registry)
- [x] 5.2 Verify `axm outdated` reports version currency (run against a test workspace with the local registry)
- [x] 5.3 Verify `axm update` updates extensions end-to-end (run against a test workspace with the local registry)
- [x] 5.4 Verify `axm update @owner/type/name` FQN mode works for each extension type
- [x] 5.5 Verify JSON output for all three features conforms to the standard envelope
- [x] 5.6 Full CI: `pnpm run ci` — fix any failures
- [x] 5.7 Kill any vitest worker processes
