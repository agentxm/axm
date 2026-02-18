> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Implementation

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Add tests for `resolveSkillUrl` in `resolve-skill-install-source.test.ts` — cover GitHub HTTPS URL, GitLab HTTPS URL, custom hostname URL, and no-match error scenarios from the spec
- [x] 1.2 Add `resolveSkillUrl` function in `resolve-skill-install-source.ts` — resolves URL inputs against configured + built-in sources (same logic as `routeUrlInput`)
- [x] 1.3 Wire `url-input` case in `resolveSkillInstallSource` switch to call `resolveSkillUrl`
- [x] 1.4 Run `pnpm typecheck` and fix any errors
- [x] 1.5 Run `pnpm lint` and fix any errors

## 2. Verification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Run `pnpm test` and fix any failures
- [x] 2.2 Run `pnpm test:e2e` and fix any failures
- [x] 2.3 Kill any vitest worker processes
