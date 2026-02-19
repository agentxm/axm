> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Tests

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add test cases in `resolve-skill-install-source.test.ts` for `file-path-pattern` input: verify that relative (`./path`), absolute (`/path`), parent-relative (`../path`), and home-relative (`~/path`) inputs resolve to a `LocalSource` instead of failing
- [ ] 1.2 Update or remove the existing test that asserts `file-path-pattern` returns `SKILL_INSTALL_UNSUPPORTED_INPUT`
- [ ] 1.3 Run `pnpm typecheck` and fix any errors
- [ ] 1.4 Run `pnpm lint` and fix any errors
- [ ] 1.5 Run `pnpm test` and fix any failures
- [ ] 1.6 Run `pnpm test:e2e` and fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. Implementation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 In `resolve-skill-install-source.ts`, replace the `file-path-pattern` error case with a call to `routeFilePathInput(pattern.path)` — import `routeFilePathInput` from `../../../sources/resolve-source.js`
- [ ] 2.2 Run `pnpm typecheck` and fix any errors
- [ ] 2.3 Run `pnpm lint` and fix any errors
- [ ] 2.4 Run `pnpm test` and fix any failures
- [ ] 2.5 Run `pnpm test:e2e` and fix any failures
- [ ] 2.6 Kill any vitest worker processes
