> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Command scaffolding and yargs wiring

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Create `packages/cli/src/cli-commands/skills/new/` directory
- [ ] 1.2 Write `command.ts` with yargs definition: positional `<name>`, options `--scope`, `--agent`, `--yes`, `--preview`, `--non-interactive` (mirror `packs new` command structure)
- [ ] 1.3 Write `command.test.ts` testing argument parsing: name positional, scope option, agent array option, yes/preview/non-interactive flags
- [ ] 1.4 Register `skillsNewCommand` in the skills command group (where other skills sub-commands are registered)
- [ ] 1.5 Run `pnpm typecheck` and fix any errors
- [ ] 1.6 Run `pnpm lint` and fix any errors
- [ ] 1.7 Run `pnpm test` and fix any failures
- [ ] 1.8 Kill any vitest worker processes

## 2. Handler implementation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Write `handler.test.ts` with tests for: default scope resolution, explicit `--scope`, skill-already-exists error, no-scope-configured error, name validation, directory and manifest creation, SKILL.md template content, settings registration, agent symlink creation, `--agent` flag narrowing
- [ ] 2.2 Write `handler.ts` implementing `handleSkillsNew` following the `packs new` handler pattern: resolve scope → validate name → check existence → create directory → write manifest → write starter SKILL.md → register in settings → create agent symlinks → log success
- [ ] 2.3 Extract or create a `computeSkillPaths` helper (analogous to `computePackPaths`) for computing the managed skill directory path from scope and name
- [ ] 2.4 Run `pnpm typecheck` and fix any errors
- [ ] 2.5 Run `pnpm lint` and fix any errors
- [ ] 2.6 Run `pnpm test` and fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. E2E tests

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [ ] 3.1 Write `command.e2e.test.ts` covering: scaffolding a new skill end-to-end (directory structure, manifest content, SKILL.md content, settings entry, agent symlinks), already-exists error, scope flag override
- [ ] 3.2 Run `pnpm test:e2e` and fix any failures
- [ ] 3.3 Run `pnpm typecheck` and fix any errors
- [ ] 3.4 Run `pnpm lint` and fix any errors
- [ ] 3.5 Run `pnpm test` to confirm no regressions
- [ ] 3.6 Kill any vitest worker processes
