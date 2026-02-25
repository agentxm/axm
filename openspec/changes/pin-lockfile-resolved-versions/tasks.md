> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Lockfile Schema Hardening

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** No predecessor phases.

- [ ] 1.1 Add an exact-semver schema type for lockfile resolved fields (no ranges allowed).
- [ ] 1.2 Update lockfile schemas so `resolvedVersion` and pack `resolvedSkills`/`resolvedCommands`/`resolvedMcpServers` values require exact versions.
- [ ] 1.3 Write/adjust lockfile schema tests first (red), then implement schema changes (green), then refactor test/code shape.
- [ ] 1.4 Run `pnpm typecheck` and fix any errors.
- [ ] 1.5 Run `pnpm lint` and fix any errors.
- [ ] 1.6 Run `pnpm test` and fix any failures.
- [ ] 1.7 Run `pnpm test:e2e` and fix any failures.
- [ ] 1.8 Kill any Vitest worker processes.

## 2. Install Path Enforcement

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Starts after Phase 1.
> **Parallelization:** Tasks 2.2, 2.3, and 2.4 are independent after 2.1 — launch as parallel subagents.

- [ ] 2.1 Add shared validation/error mapping helper(s) for exact resolved version persistence in lockfile write paths.
- [ ] 2.2 Write/update tests first for skill install lockfile persistence (exact version accepted, range rejected), then implement, then refactor.
- [ ] 2.3 Write/update tests first for command install lockfile persistence (exact version accepted, range rejected), then implement, then refactor.
- [ ] 2.4 Write/update tests first for MCP server install lockfile persistence (exact version accepted, range rejected), then implement, then refactor.
- [ ] 2.5 Write/update tests first for pack install resolved maps persistence (exact versions only), then implement, then refactor.
- [ ] 2.6 Run `pnpm typecheck` and fix any errors.
- [ ] 2.7 Run `pnpm lint` and fix any errors.
- [ ] 2.8 Run `pnpm test` and fix any failures.
- [ ] 2.9 Run `pnpm test:e2e` and fix any failures.
- [ ] 2.10 Kill any Vitest worker processes.

## 3. Contract and Regression Coverage

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Starts after Phase 2.

- [ ] 3.1 Update tests around version-constraint boundaries to assert constraints are accepted at inputs but never persisted as lockfile resolved values.
- [ ] 3.2 Add regression tests for fail-fast behavior when pre-existing range values are encountered in lockfile resolved fields.
- [ ] 3.3 Review/align error codes and messages for lockfile resolved-version violations so failures are actionable.
- [ ] 3.4 Run `pnpm typecheck` and fix any errors.
- [ ] 3.5 Run `pnpm lint` and fix any errors.
- [ ] 3.6 Run `pnpm test` and fix any failures.
- [ ] 3.7 Run `pnpm test:e2e` and fix any failures.
- [ ] 3.8 Kill any Vitest worker processes.
