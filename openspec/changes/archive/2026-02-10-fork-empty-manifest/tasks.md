> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Rename ForkSkillOperation → CopySkillOperation

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Rename `ForkSkillOperationArgs` → `CopySkillOperationArgs` and `ForkSkillOperation` → `CopySkillOperation` in `operations.ts`. Remove the `agents` field from `CopySkillOperationArgs`. Update the operation name string from `"fork-skill"` to `"copy-skill"`.
- [x] 1.2 Rename `fork-skill.ts` → `copy-skill.ts`. Rename the exported `forkSkill` handler to `copySkill`. Update the operation name check from `"fork-skill"` to `"copy-skill"`.
- [x] 1.3 Remove the `agents` property from the generated manifest object — the manifest should only contain `name`, `version`, and `dependencies`.
- [x] 1.4 Update all imports of `ForkSkillOperation`, `ForkSkillOperationArgs`, `forkSkill`, and `fork-skill` across the codebase to use the new names.
- [x] 1.5 Update tests: `fork-skill.test.ts` → `copy-skill.test.ts`. Update test assertions to expect no `agents` property in the manifest. Update operation type references.
- [x] 1.6 Run `pnpm typecheck` and fix any errors.
- [x] 1.7 Run `pnpm lint:fix` and fix any remaining errors.
- [x] 1.8 Run `pnpm test` and fix any failures.
- [x] 1.9 Run `pnpm test:e2e` and fix any failures.

## 2. Update fork handler

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 In `fork/handler.ts`, update the import from `fork-skill` to `copy-skill` and the type from `ForkSkillOperation` to `CopySkillOperation`.
- [x] 2.2 Remove `agents` from the `ForkSkillOperation` args object in the plan builder. The `CopySkillOperation` step no longer needs an `agents` field.
- [x] 2.3 Update the operation handler map passed to `resolvePlan`: change `"fork-skill": forkSkill` to `"copy-skill": copySkill`.
- [x] 2.4 Update `fork/handler.test.ts` to reflect the renamed operation type and removed agents field. Assertions on the plan's fork step should expect `CopySkillOperation` with no `agents`.
- [x] 2.5 Run `pnpm typecheck` and fix any errors.
- [x] 2.6 Run `pnpm lint:fix` and fix any remaining errors.
- [x] 2.7 Run `pnpm test` and fix any failures.
- [x] 2.8 Run `pnpm test:e2e` and fix any failures.
