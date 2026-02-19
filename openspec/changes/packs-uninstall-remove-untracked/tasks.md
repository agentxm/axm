> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Tests

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add handler test: pack folder exists on disk but not in lockfile → folder removed, result is `success`
- [ ] 1.2 Add handler test: pack folder does not exist on disk or in lockfile → result is `no-op`
- [ ] 1.3 Add handler test: pack folder exists under multiple namespaces → all matching directories removed
- [ ] 1.4 Run `pnpm typecheck` and fix any errors

## 2. Implementation

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 In `extensions/packs/operations/uninstall.ts`, before the early `no-op` return: scan `.axm/extensions/@*/packs/<name>/` for matching directories and remove them using `removeIfExists`. If any were found, return `success` instead of `no-op`.
- [ ] 2.2 Run `pnpm typecheck` and fix any errors

## 3. Verification

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 3.1 Run `pnpm test` — fix any failures
- [ ] 3.2 Run `pnpm lint` — fix any issues
- [ ] 3.3 Run `pnpm test:e2e` — fix any failures
- [ ] 3.4 Kill any remaining vitest worker processes
