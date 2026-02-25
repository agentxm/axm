> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. ResolvePlan Augmentation Foundation

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add/extend workspace tests for strict preview dry-run, single-pass `augmentPlan`, and no-op behavior for `ignore_if_missing` (red first).
- [ ] 1.2 Implement `Workspace.getLockfileState()` returning `ok | missing | invalid` and wire tests for missing vs invalid detection.
- [ ] 1.3 Add `augmentPlan(plan, context)` in workspace resolve pipeline (pure, idempotent, pre-apply only).
- [ ] 1.4 Run `pnpm typecheck` immediately after 1.3 and fix any errors.
- [ ] 1.5 Update `resolvePlan` flow to render augmented plans in preview and apply only after confirmation.
- [ ] 1.6 Run `pnpm typecheck` immediately after 1.5 and fix any errors.
- [ ] 1.7 Run `pnpm typecheck` (all packages) and fix any errors.
- [ ] 1.8 Run `pnpm lint` (all packages) and fix any errors.
- [ ] 1.9 Run `pnpm test` (all packages) and fix any failures.
- [ ] 1.10 Run `pnpm test:e2e` (relevant suites) and fix any failures.
- [ ] 1.11 Kill any Vitest worker processes.

## 2. Operation Registry and Lockfile Policy Metadata

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Add tests for operation metadata (`lockfilePolicy`) and mixed-plan policy precedence (`materialize` > `read_recover` > `ignore`) (red first).
- [ ] 2.2 Implement co-located operation metadata exports and create central typed operation registry used by `resolvePlan`.
- [ ] 2.3 Run `pnpm typecheck` immediately after 2.2 and fix any errors.
- [ ] 2.4 Refactor `resolvePlan` to use internal registry for policy evaluation and handler dispatch while preserving compile-time handler coverage.
- [ ] 2.5 Run `pnpm typecheck` immediately after 2.4 and fix any errors.
- [ ] 2.6 Add/adjust tests to prevent import-cycle regressions and keep command handlers thin (`build -> resolvePlan`).
- [ ] 2.7 Run `pnpm typecheck` (all packages) and fix any errors.
- [ ] 2.8 Run `pnpm lint` (all packages) and fix any errors.
- [ ] 2.9 Run `pnpm test` (all packages) and fix any failures.
- [ ] 2.10 Run `pnpm test:e2e` (relevant suites) and fix any failures.
- [ ] 2.11 Kill any Vitest worker processes.

## 3. Cross-Extension Reconciliation and Materialization Operations

> **Subagent:** Run this entire phase in a single subagent.

> **Parallelization:** Tasks 3.3, 3.4, 3.5, 3.6 are independent — launch as parallel subagents.

- [ ] 3.1 Add tests for lockfile-state decision table behavior, reconciliation gating, and failure semantics (including unreachable required source) (red first).
- [ ] 3.2 Implement shared reconciliation planner operations (`read-recover`, `reconcile-materialize`) and failure gating before requested operations.
- [ ] 3.3 Implement skills adapter for declaration scan, disk compatibility checks, and unresolved classification.
- [ ] 3.4 Implement commands adapter for declaration scan, disk compatibility checks, and unresolved classification.
- [ ] 3.5 Implement mcp-servers adapter for declaration scan, disk compatibility checks, and unresolved classification.
- [ ] 3.6 Implement packs adapter for declaration scan, disk compatibility checks, unresolved classification, and overlap dedupe support.
- [ ] 3.7 Run `pnpm typecheck` immediately after 3.2-3.6 integration and fix any errors.
- [ ] 3.8 Implement dedupe rules (type + namespace + name + declaration source/constraint) and deterministic conflict handling.
- [ ] 3.9 Run `pnpm typecheck` immediately after 3.8 and fix any errors.
- [ ] 3.10 Implement lockfile invalid-backup + atomic materialization behavior.
- [ ] 3.11 Run `pnpm typecheck` immediately after 3.10 and fix any errors.
- [ ] 3.12 Run `pnpm typecheck` (all packages) and fix any errors.
- [ ] 3.13 Run `pnpm lint` (all packages) and fix any errors.
- [ ] 3.14 Run `pnpm test` (all packages) and fix any failures.
- [ ] 3.15 Run `pnpm test:e2e` (relevant suites) and fix any failures.
- [ ] 3.16 Kill any Vitest worker processes.

## 4. Install Flow Integration and UX Diagnostics

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 4.1 Add tests that skills/packs/commands/mcp install flows augment plans on missing/invalid lockfile and remain unchanged on `ok` lockfile.
- [ ] 4.2 Integrate install operations with `materialize_if_missing` policy metadata and ensure augmented reconciliation appears before requested install steps.
- [ ] 4.3 Run `pnpm typecheck` immediately after 4.2 and fix any errors.
- [ ] 4.4 Add deterministic prompt ordering and diagnostics (`[auto]`, reason labels, counts by type) in preview/apply displays.
- [ ] 4.5 Run `pnpm typecheck` immediately after 4.4 and fix any errors.
- [ ] 4.6 Add warning behavior for `LOCKFILE_INVALID_IGNORED` under `ignore_if_missing` operations.
- [ ] 4.7 Run `pnpm typecheck` immediately after 4.6 and fix any errors.
- [ ] 4.8 Run `pnpm typecheck` (all packages) and fix any errors.
- [ ] 4.9 Run `pnpm lint` (all packages) and fix any errors.
- [ ] 4.10 Run `pnpm test` (all packages) and fix any failures.
- [ ] 4.11 Run `pnpm test:e2e` (relevant suites) and fix any failures.
- [ ] 4.12 Kill any Vitest worker processes.

## 5. End-to-End Hardening and Completion

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 5.1 Add/expand e2e suites for: deleted lockfile + single install regenerates full active-scope snapshot across extension types.
- [ ] 5.2 Add/expand e2e suites for: invalid lockfile backup + regeneration path and strict `--preview` dry-run behavior.
- [ ] 5.3 Run `pnpm typecheck` immediately after 5.1-5.2 and fix any errors.
- [ ] 5.4 Run `pnpm typecheck` (all packages) and fix any errors.
- [ ] 5.5 Run `pnpm lint` (all packages) and fix any errors.
- [ ] 5.6 Run `pnpm test` (all packages) and fix any failures.
- [ ] 5.7 Run `pnpm test:e2e` (relevant suites) and fix any failures.
- [ ] 5.8 Kill any Vitest worker processes.
