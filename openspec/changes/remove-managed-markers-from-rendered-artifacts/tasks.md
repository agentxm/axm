> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Remove marker-based sync checks

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add regression tests for command and subagent sync paths that currently depend on managed-marker conflict detection.
- [ ] 1.2 Remove `detectConflict` usage and marker-based branching from command sync.
- [ ] 1.3 Remove `detectConflict` usage and marker-based branching from subagent sync, including Roo-specific `_axm_managed` checks.
- [ ] 1.4 Delete marker-only conflict-detection helpers and their tests.
- [ ] 1.5 Run `pnpm nx run client-core:typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 1.6 Run `pnpm nx run client-core:test`, fix any failures.
- [ ] 1.7 Run `pnpm typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 1.8 Run `pnpm lint`, fix any errors.
- [ ] 1.9 Run `pnpm test`, fix any failures.
- [ ] 1.10 Run `pnpm test:e2e`, fix any failures.
- [ ] 1.11 Kill any vitest worker processes.

## 2. Remove managed marker rendering

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

> **Parallelization:** Tasks 2.2, 2.3, and 2.4 are independent — launch as parallel subagents.

- [ ] 2.1 Add or update renderer tests to assert rendered outputs no longer contain managed markers.
- [ ] 2.2 Remove `generateMarker` usage from all command renderers and delete marker assertions from command renderer tests.
- [ ] 2.3 Remove managed-marker generation from subagent renderers, Kiro JSON output, and Roo mode entries.
- [ ] 2.4 Remove skill `SKILL.md` marker prepend flows from install/materialization paths and delete marker-strip logic from copy flows.
- [ ] 2.5 Delete managed-marker helpers and their tests.
- [ ] 2.6 Run `pnpm nx run client-core:typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 2.7 Run `pnpm nx run client-core:test`, fix any failures.
- [ ] 2.8 Run `pnpm typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 2.9 Run `pnpm lint`, fix any errors.
- [ ] 2.10 Run `pnpm test`, fix any failures.
- [ ] 2.11 Run `pnpm test:e2e`, fix any failures.
- [ ] 2.12 Kill any vitest worker processes.

## 3. Simplify Roo reconciliation and reporting

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1-2

- [ ] 3.1 Add regression tests for Roo merge/remove behavior using slug-only identity.
- [ ] 3.2 Update Roo merge/remove logic to replace and delete entries by slug alone.
- [ ] 3.3 Simplify subagent detection and setup summary reporting to stop reading rendered file content for managed state.
- [ ] 3.4 Update affected tests for Roo, subagent detection, and setup summaries.
- [ ] 3.5 Run `pnpm nx run client-core:typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 3.6 Run `pnpm nx run client-core:test`, fix any failures.
- [ ] 3.7 Run `pnpm typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 3.8 Run `pnpm lint`, fix any errors.
- [ ] 3.9 Run `pnpm test`, fix any failures.
- [ ] 3.10 Run `pnpm test:e2e`, fix any failures.
- [ ] 3.11 Kill any vitest worker processes.

## 4. Spec and verification follow-through

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1-3

- [ ] 4.1 Update accepted OpenSpec capability specs for skills install, commands, and subagents to remove marker-based behavior.
- [ ] 4.2 Run `pnpm nx run client-core:typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 4.3 Run `pnpm nx run client-core:test`, fix any failures.
- [ ] 4.4 Run `pnpm typecheck`, fix any errors including `@effect/language-service` diagnostics.
- [ ] 4.5 Run `pnpm lint`, fix any errors.
- [ ] 4.6 Run `pnpm test`, fix any failures.
- [ ] 4.7 Run `pnpm test:e2e`, fix any failures.
- [ ] 4.8 Kill any vitest worker processes.
