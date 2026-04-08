> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. AxmPrompt helpers (core)

> **Subagent:** Run this entire phase in a single subagent.

No dependencies. Can run in parallel with Phase 2.

- [ ] 1.1 Write tests for `unless` (`dual(2)`, Option.some skips prompt, Option.none returns prompt, pipe style matches direct call)
- [ ] 1.2 Write tests for `autoConfirm` (`dual(2)`, `yes: true` skips prompt, `yes: false` returns prompt, pipe style matches direct call)
- [ ] 1.3 Implement `unless` and `autoConfirm` in `packages/core/src/unstable/cli/prompt/helpers.ts`
- [ ] 1.4 Run typecheck for core package, fix any issues including @effect/language-service diagnostics including @effect/language-service diagnostics
- [ ] 1.5 Deprecate old helpers in `packages/core/src/unstable/cli-prompt/helpers.ts` with `@deprecated` JSDoc annotations
- [ ] 1.6 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. AxmPrompt custom prompts (core)

> **Subagent:** Run this entire phase in a single subagent.

No dependencies. Can run in parallel with Phase 1.

> **Parallelization:** Tasks 2.1–2.4, 2.5–2.8, 2.9–2.12 are independent — launch as parallel subagents.

### selectKey

- [ ] 2.1 Write tests for `selectKey` (matching key submits, non-matching key shows error, case-insensitive default, case-sensitive option)
- [ ] 2.2 Implement `selectKey` in `packages/core/src/unstable/cli/prompt/select-key.ts` using `Prompt.custom`
- [ ] 2.3 Run typecheck for core package, fix any issues including @effect/language-service diagnostics
- [ ] 2.4 Verify selectKey tests pass

### groupMultiselect

- [ ] 2.5 Write tests for `groupMultiselect` (toggle individual choices, selectable header toggles children, min/max validation, submit returns selected values)
- [ ] 2.6 Implement `groupMultiselect` in `packages/core/src/unstable/cli/prompt/group-multiselect.ts` using `Prompt.custom`
- [ ] 2.7 Run typecheck for core package, fix any issues including @effect/language-service diagnostics
- [ ] 2.8 Verify groupMultiselect tests pass

### autocompleteMultiselect

- [ ] 2.9 Write tests for `autocompleteMultiselect` (typing filters choices, selections persist across filter changes, submit returns all selected, empty results show message)
- [ ] 2.10 Implement `autocompleteMultiselect` in `packages/core/src/unstable/cli/prompt/autocomplete-multiselect.ts` using `Prompt.custom`
- [ ] 2.11 Run typecheck for core package, fix any issues including @effect/language-service diagnostics
- [ ] 2.12 Verify autocompleteMultiselect tests pass

### Barrel + verification

- [ ] 2.13 Create barrel `packages/core/src/unstable/cli/prompt/index.ts` exporting `AxmPrompt` namespace (all constructors + helpers from Phase 1)
- [ ] 2.14 Write composability tests (custom prompt in `Prompt.all`, custom prompt with `Prompt.flatMap`, custom prompt with `yield*`)
- [ ] 2.15 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 2.16 Kill any vitest worker processes

## 3. Spike runtime update

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 and Phase 2 complete.

- [ ] 3.1 Update `packages/cli-spike/src/runtime.ts`: change error union to `AppError | Terminal.QuitError`, add `Effect.catchTag("QuitError", ...)` mapping to `PromptCancelled`
- [ ] 3.2 Run typecheck for cli-spike package, fix any issues including @effect/language-service diagnostics
- [ ] 3.3 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 3.4 Kill any vitest worker processes

## 4. Migrate existing prompt demo commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3 complete.

> **Parallelization:** Tasks 4.1–4.7 are independent file migrations — launch as parallel subagents.

- [ ] 4.1 Migrate `text.ts` — replace `CliPrompt` with `Prompt.text`, pet store theme ("Enter pet name:"), use `AxmPrompt.unless` for flag bypass, effectful validation
- [ ] 4.2 Migrate `password.ts` — replace with `Prompt.password` (returns `Redacted`), pet store theme ("Enter admin authorization code:"), `Redacted.value()` at display point
- [ ] 4.3 Migrate `confirm.ts` — replace with `Prompt.confirm`, pet store theme ("Confirm pet intake?"), use `AxmPrompt.autoConfirm` for `--yes` flag
- [ ] 4.4 Migrate `select.ts` — replace with `Prompt.select`, pet store theme (species: cat/dog/rabbit/bird/hamster)
- [ ] 4.5 Migrate `multiselect.ts` — replace with `Prompt.multiSelect`, pet store theme (care requirements: vaccination, microchip, spay/neuter, flea treatment, deworming)
- [ ] 4.6 Migrate `autocomplete.ts` — replace with `Prompt.autoComplete`, pet store theme (pet names from catalog)
- [ ] 4.7 Migrate `path.ts` — replace with `Prompt.file`, pet store theme ("Select pet records directory:")
- [ ] 4.8 Run typecheck for cli-spike package, fix any issues including @effect/language-service diagnostics
- [ ] 4.9 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 4.10 Kill any vitest worker processes

## 5. Migrate custom prompt demo commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3 complete.

> **Parallelization:** Tasks 5.1–5.3 are independent file migrations — launch as parallel subagents.

- [ ] 5.1 Migrate `select-key.ts` — replace with `AxmPrompt.selectKey`, pet store theme (quick actions: a=Adopt, i=Intake, l=List, r=Register)
- [ ] 5.2 Migrate `group-multiselect.ts` — replace with `AxmPrompt.groupMultiselect`, pet store theme (services grouped by Medical, Grooming, Training)
- [ ] 5.3 Migrate `autocomplete-multiselect.ts` — replace with `AxmPrompt.autocompleteMultiselect`, pet store theme (veterinary services)
- [ ] 5.4 Run typecheck for cli-spike package, fix any issues including @effect/language-service diagnostics
- [ ] 5.5 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 5.6 Kill any vitest worker processes

## 6. New demo commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3 complete. Can run in parallel with Phases 4 and 5.

> **Parallelization:** Tasks 6.1–6.6 are independent — launch as parallel subagents.

- [ ] 6.1 Create `integer.ts` — `Prompt.integer`, pet store theme ("Pet age in months:", min: 1, max: 360)
- [ ] 6.2 Create `date.ts` — `Prompt.date`, pet store theme ("Intake date:", defaults to today)
- [ ] 6.3 Create `toggle.ts` — `Prompt.toggle`, pet store theme ("Adoptable?", on/off)
- [ ] 6.4 Create `list.ts` — `Prompt.list`, pet store theme ("Pet tags (comma-separated):", e.g. "friendly,house-trained,good-with-kids")
- [ ] 6.5 Create `hidden.ts` — `Prompt.hidden`, pet store theme ("Admin override code:", silent input)
- [ ] 6.6 Create `composition.ts` — `Prompt.all({ name: text, species: select, age: integer, adoptable: toggle })` + `Prompt.flatMap` for conditional follow-up (if adoptable → select habitat)
- [ ] 6.7 Register all 6 new subcommands in `packages/cli-spike/src/root/prompts/command.ts`
- [ ] 6.8 Run typecheck for cli-spike package, fix any issues including @effect/language-service diagnostics
- [ ] 6.9 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 6.10 Kill any vitest worker processes

## 7. Migrate pet store commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3 complete. Can run in parallel with Phases 4, 5, 6.

- [ ] 7.1 Migrate `adopt.ts` — replace `CliPrompt.confirm` with `Prompt.confirm`, use `AxmPrompt.autoConfirm` for `--yes` flag
- [ ] 7.2 Migrate `intake.ts` — replace `CliPrompt.confirm` with `Prompt.confirm`, use `AxmPrompt.autoConfirm` for `--yes` flag
- [ ] 7.3 Run typecheck for cli-spike package, fix any issues including @effect/language-service diagnostics
- [ ] 7.4 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 7.5 Kill any vitest worker processes

## 8. Documentation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 4, 5, 6, 7 complete.

- [ ] 8.1 Update `contributing/guides/cli-design.md` — add "Effect v4 Native Prompts (CLI Spike)" section showing `yield* Prompt.text(...)`, non-interactive guard pattern, `Prompt.all` composition, `Prompt.custom` for custom types, note CliPrompt remains canonical for primary CLI
- [ ] 8.2 Update `.claude/skills/cli-conventions/SKILL.md` — add examples showing both approaches (spike uses Effect v4 prompts, primary CLI uses CliPrompt)
- [ ] 8.3 Run `pnpm typecheck` (fix any issues including @effect/language-service diagnostics), `pnpm lint`, `pnpm test`, fix any failures
- [ ] 8.4 Kill any vitest worker processes

## 9. E2E verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: All previous phases complete.

- [ ] 9.1 Run `pnpm test:e2e` for cli-spike-e2e, fix any failures
- [ ] 9.2 Manually verify `pnpm spike prompts text`, `pnpm spike prompts select`, `pnpm spike prompts composition` run correctly (smoke test)
- [ ] 9.3 Run full `pnpm run ci:affected`, fix any issues
- [ ] 9.4 Kill any vitest worker processes
