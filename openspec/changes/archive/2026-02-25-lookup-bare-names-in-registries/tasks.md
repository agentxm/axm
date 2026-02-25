> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Workspace API Changes

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Add `getDefaultNamespace` to workspace service interface and implementation returning `Effect<Option<string>, CliError>` with precedence: project settings > user settings > `Option.none()`. Include a TODO comment for logged-in identity handle (auth not implemented yet). Add tests for all three precedence cases (project wins, user fallback, none).
- [x] 1.2 Rename `getConfiguredRegistrySources` to `getRegistrySourceHosts` in workspace service interface, implementation, and all callers across the codebase. Update any related tests.
- [x] 1.3 Run `pnpm typecheck` for all packages, fix any errors
- [x] 1.4 Run `pnpm lint` for all packages, fix any errors
- [x] 1.5 Run `pnpm test` for all packages, fix any failures
- [x] 1.6 Run `pnpm test:e2e` for all packages, fix any failures
- [x] 1.7 Kill any vitest worker processes

## 2. Resolver: Not-Found Error and Diagnostics

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [x] 2.1 Write tests in `resolve-skill-install-source.test.ts` for: bare name found in first registry (returns registry source), bare name found in later registry (returns correct one), bare name not found in any registry (fails with `REGISTRY_SKILL_NOT_FOUND` including checked list), no default namespace available (fails with `REGISTRY_SKILL_NOT_FOUND` with "no default namespace" detail), no registry source hosts (fails with `REGISTRY_SKILL_NOT_FOUND` with "no registry sources" detail).
- [x] 2.2 Update `resolveSkillRegistrySourceByName` in `resolve-skill-install-source.ts` to use `getDefaultNamespace` and `getRegistrySourceHosts`. Handle `Option.none()` namespace and empty registry hosts as `REGISTRY_SKILL_NOT_FOUND` with context-specific details. Accumulate checked registry endpoints and include in error details on miss. Ensure all tests from 2.1 pass.
- [x] 2.3 Run `pnpm typecheck` for all packages, fix any errors
- [x] 2.4 Run `pnpm lint` for all packages, fix any errors
- [x] 2.5 Run `pnpm test` for all packages, fix any failures
- [x] 2.6 Run `pnpm test:e2e` for all packages, fix any failures
- [x] 2.7 Kill any vitest worker processes

## 3. Handler: Preserve Resolver Errors

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2.

- [x] 3.1 Write tests in `handler.test.ts` for: resolver `REGISTRY_SKILL_NOT_FOUND` error is surfaced (not remapped to `INVALID_SOURCE`), true parse failure still returns `INVALID_SOURCE`.
- [x] 3.2 Update `handler.ts` to stop coercing all resolver failures into `INVALID_SOURCE`. Preserve `CliError` from resolver (including `REGISTRY_SKILL_NOT_FOUND`); map only true parse failures to `INVALID_SOURCE`. Ensure all tests from 3.1 pass.
- [x] 3.3 Run `pnpm typecheck` for all packages, fix any errors
- [x] 3.4 Run `pnpm lint` for all packages, fix any errors
- [x] 3.5 Run `pnpm test` for all packages, fix any failures
- [x] 3.6 Run `pnpm test:e2e` for all packages, fix any failures
- [x] 3.7 Kill any vitest worker processes
