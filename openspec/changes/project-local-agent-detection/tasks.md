> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Rewrite Agent Detection

> **Subagent:** Run this entire phase in a single subagent.

Depends on: nothing (start here)

- [ ] 1.1 Write tests for unified `detectAgent` — project-level detection (check `skills.dir` first segment in project dir), global detection (`~/.{agent-id}`), combined OR logic, shared `skills.dir` detecting multiple agents, concurrent execution
- [ ] 1.2 Rewrite `detectAgent` in `packages/cli/src/agents/detection.ts` — replace `defaultDetect` and custom-detect dispatch with unified function that accepts `projectDir` param and checks both project-level (`skills.dir` first segment in cwd) and global (`~/.{agent-id}` in home)
- [ ] 1.3 Update `detectAgents` signature to accept `projectDir: string` param and pass it through to `detectAgent`
- [ ] 1.4 Run `pnpm typecheck` and fix any errors
- [ ] 1.5 Run `pnpm lint` and fix any errors
- [ ] 1.6 Run `pnpm test` and fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. Remove Per-Agent Detection Files and Clean Up Types

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

> **Parallelization:** Tasks 2.1, 2.2, 2.3 are independent — launch as parallel subagents.

- [ ] 2.1 Delete 6 per-agent `detection.ts` files: `claude-code/detection.ts`, `codex/detection.ts`, `cursor/detection.ts`, `windsurf/detection.ts`, `opencode/detection.ts`, `continue/detection.ts`
- [ ] 2.2 Remove `detect` import and field from each of those 6 agent `descriptor.ts` files
- [ ] 2.3 Remove `AgentDetectFn` type from `packages/cli/src/agents/types.ts` and `detect?` field from `AgentDescriptor` interface
- [ ] 2.4 Remove now-unused `constants.ts` files from agent directories that only exported home-path constants for detection (e.g., `claudeHome`, `codexHome`)
- [ ] 2.5 Update barrel exports in `packages/cli/src/agents/index.ts` if detection-related exports changed
- [ ] 2.6 Run `pnpm typecheck` and fix any errors
- [ ] 2.7 Run `pnpm lint` and fix any errors
- [ ] 2.8 Run `pnpm test` and fix any failures
- [ ] 2.9 Kill any vitest worker processes

## 3. Simplify Init Prompt Flow

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 3.1 Write/update tests for `initializeProjectWorkspace` — verify it calls multiselect directly with detected agent IDs as `initialValues`, no two-step select prompt
- [ ] 3.2 Update `initializeProjectWorkspace` in `packages/cli/src/workspace/service.ts` — remove the two-step select prompt ("auto-detect or choose"), replace with single multiselect call; pass `process.cwd()` to `detectAgents`; pre-select detected agents via `initialValues`
- [ ] 3.3 Remove `Select` import from workspace service if no longer used
- [ ] 3.4 Run `pnpm typecheck` and fix any errors
- [ ] 3.5 Run `pnpm lint` and fix any errors
- [ ] 3.6 Run `pnpm test` and fix any failures
- [ ] 3.7 Kill any vitest worker processes

## 4. E2E Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2 and 3

- [ ] 4.1 Run `pnpm test:e2e` and fix any failures
- [ ] 4.2 Run `pnpm build` to verify clean build
- [ ] 4.3 Kill any vitest worker processes
