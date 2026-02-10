> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Update fork handler to include install-skill operation

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Update handler tests: assert the plan contains three operations (fork-skill, publish-skill, install-skill) per skill with correct `InstallSkillOperationArgs` fields (source: registry, force: true, version: "0.1.0", gitTreeSha: none)
- [ ] 1.2 Expand `ForkOp` type to `ForkSkillOperation | PublishSkillOperation | InstallSkillOperation`
- [ ] 1.3 Import `installSkill` from `../install/install-skill.js` and `InstallSkillOperation` from `../operations.js`
- [ ] 1.4 Add `install-skill` step to the plan per skill (after publish-skill), constructing `InstallSkillOperationArgs` from fork context per design doc
- [ ] 1.5 Register `"install-skill": installSkill` in the handler registry passed to `resolvePlan`
- [ ] 1.6 Remove the entire manual post-plan Step 8 block (lockfile update, agent symlink creation, per-skill log) — only keep `log.success("Done")`
- [ ] 1.7 Remove unused imports (`LockfileService`, `sourceToLockEntry`, `createSymlink`, `getAgentById`) if no longer referenced
- [ ] 1.8 Run `pnpm typecheck` and fix any errors
- [ ] 1.9 Run `pnpm lint` and fix any errors
- [ ] 1.10 Run `pnpm test` and fix any failures
- [ ] 1.11 Run `pnpm test:e2e` and fix any failures
- [ ] 1.12 Kill any vitest worker processes

## 2. Add E2E assertion for settings.json

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 In `fork.e2e.test.ts`, add assertion that `settings.json` contains the forked skill name under `skills` with a registry source string after a successful fork
- [ ] 2.2 Run `pnpm typecheck` and fix any errors
- [ ] 2.3 Run `pnpm lint` and fix any errors
- [ ] 2.4 Run `pnpm test` and fix any failures
- [ ] 2.5 Run `pnpm test:e2e` and fix any failures
- [ ] 2.6 Kill any vitest worker processes
