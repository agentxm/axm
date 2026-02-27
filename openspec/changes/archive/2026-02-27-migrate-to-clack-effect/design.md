## Context

The CLI uses 8 Ink-based TUI services (`Spinner`, `Confirm`, `Select`, `Multiselect`, `TextInput`, `PasswordInput`, `Note`, `Log`) across ~70 source files and ~60 test files. Each is a separate Effect service backed by React/Ink rendering. Test layer factories are heavily used: `makeLogTestLayer` in ~39 files, `makeConfirmTestLayer` in ~25, `makeSpinnerTestLayer` in ~12, with many files using multiple factories.

A replacement module `clack-effect` already exists at `src/clack-effect/`, wrapping `@clack/prompts` with 6 Effect services (`ClackSpinner`, `ClackPrompt`, `ClackLog`, `ClackProgress`, `ClackTaskLog`, `ClackStream`). It's fully implemented and tested but has zero consumers — every handler still imports from `@/tui`.

## Goals / Non-Goals

**Goals:**

- Replace all TUI service usage with clack-effect equivalents
- Remove the `src/tui/` directory and Ink/React dependencies
- Update the runtime layer to provide `ClackLive`
- All existing tests pass against clack-effect services

**Non-Goals:**

- Redesigning CLI UX or interaction flows
- Adopting new clack-effect capabilities (progress, task-log, stream) — those are separate future changes
- Backward compatibility with the old TUI API

## Decisions

### 1. Direct migration, no adapter layer

Migrate each call site directly from old API to new API. No shim or compatibility layer.

**Why**: The API differences are small and mechanical. An adapter adds code that would be immediately deleted. The migration is a one-time operation.

**Alternative considered**: Adapter layer that maps old service tags to new implementations. Rejected — adds indirection for no lasting value.

### 2. Service mapping

8 old services consolidate into 3 clack-effect services:

| Old Service     | New Service    | Method                                                |
| --------------- | -------------- | ----------------------------------------------------- |
| `Spinner`       | `ClackSpinner` | `start(msg)` → `start(msg)`                           |
| `Confirm`       | `ClackPrompt`  | `prompt(config)` → `confirm(config)`                  |
| `Select`        | `ClackPrompt`  | `prompt(config)` → `select(config)`                   |
| `Multiselect`   | `ClackPrompt`  | `prompt(config)` → `multiselect(config)`              |
| `TextInput`     | `ClackPrompt`  | `prompt(config)` → `text(config)`                     |
| `PasswordInput` | `ClackPrompt`  | `prompt(config)` → `password(config)`                 |
| `Note`          | `ClackLog`     | `display(msg, title)` → `note(msg, title)`            |
| `Log`           | `ClackLog`     | `info/warn/error/success/message` — same method names |

### 3. Config shape adaptation at each call site

Old `Select`/`Multiselect` use `items: T[]` + `toOption: (item: T) => SelectOption` to map domain objects to display options. Clack-effect uses `options: ClackOption<V>[]` directly.

**Migration pattern**: Move the mapping to the call site — build `options` array before calling the prompt.

```typescript
// Before
yield *
  select.prompt({
    message: "Pick one",
    items: skills,
    toOption: (s) => ({ label: s.name, value: s.id }),
  });

// After
yield *
  prompt.select({
    message: "Pick one",
    options: skills.map((s) => ({ label: s.name, value: s.id })),
  });
```

### 4. SpinnerHandle changes

Old `SpinnerHandle` has `stop(msg)`. New `ClackSpinnerHandle` has `stop(msg?)`, `message(msg)`, `cancel(msg)`, `error(msg)`, `clear()`.

The `stop(msg)` call signature is compatible. Most call sites can stay as-is.

`stopAll` has no clack equivalent. Before deleting `stopAll` from `runtime/index.ts`, harden spinner call sites so started spinners are always finalized (prefer `withSpinner`; otherwise ensure explicit `stop/cancel/error` in all failure paths).

Only after that hardening is complete should `runtime/index.ts` drop the global cleanup hook.

### 4.1 PromptCancelled import path

Do not rely on `src/tui/errors.ts` during migration. Import `PromptCancelled` directly from `src/prompt-cancelled.ts` everywhere.

This includes runtime and non-runtime files (notably `workspace/service.ts`).

### 5. `--yes` / `--non-interactive` — no migration work

Prompt-skipping for `--yes` and `--non-interactive` is handled at the handler level, not the TUI/clack layer. Handlers check `WorkspaceContext` flags and skip prompt calls entirely when these flags are set. Neither the old TUI services nor clack-effect services are aware of these flags. No migration work needed.

### 6. Runtime layer swap

Replace `TuiLive` with `ClackLive` in `src/runtime/index.ts`. The `ClackLive` layer merges all 6 clack-effect services. Handlers only need `ClackSpinner`, `ClackPrompt`, and `ClackLog` for now.

### 7. Test layer migration

Old pattern: separate test layer factories per service (`makeLogTestLayer()`, `makeConfirmTestLayer()`, etc.).

New pattern: clack-effect provides its own test layer factories (`makeClackPromptTestLayer()`, `makeClackLogTestLayer()`, `makeClackSpinnerTestLayer()`).

Each test file migrates its layer setup. Mock APIs are not 1:1:

- old tests often use per-prompt typed behaviors (`ConfirmBehavior`, `SelectBehavior`, `MultiselectBehavior`)
- clack prompt tests currently use one shared behavior across prompt methods

Migration needs a small test-helper upgrade first: support per-method (and when needed per-call) prompt behaviors so existing assertions stay precise.

### 7.1 Config adaptation rules (beyond `items` + `toOption`)

Apply these rules at every migrated prompt call site:

- `Option`-wrapped config fields from old TUI (`initialValues`, `required`, etc.) must be unwrapped to clack optional fields
- preserve domain return types when needed (old select/multiselect returned selected domain items; clack returns selected option values)
- keep cancel semantics unchanged (`PromptCancelled` must continue to bubble to runtime)

### 8. Dev CLI playground commands

The `src/dev-cli-commands/tui/` directory contains playground commands for each TUI component. Migrate these to use clack-effect or remove them if clack-effect's own tests provide sufficient coverage.

**Decision**: Migrate them — they're useful for manual testing of prompt rendering.

## Risks / Trade-offs

**Visual behavior change** → Users will see clack-style prompts instead of Ink-rendered ones. Clack's style is well-established (used by Astro, SvelteKit, etc.). Accept the change — no mitigation needed.

**Large changeset** (~110 files) → Risk of merge conflicts with in-flight work. Mitigate by doing the migration in ordered phases (see Migration Plan) and merging promptly.

**Test mock API differences** → Some tests may need more than mechanical find-replace if they rely on specific mock behaviors. Mitigate by running tests continuously during migration.

**`stopAll` removal** → No clack global equivalent. Removing it before call-site hardening risks leaked spinner state on failure paths.

**Spinner finalization regressions** → Any path that starts a spinner and fails before stop/cancel/error can leak terminal state. Mitigate with a pre-migration hardening pass plus targeted failure-path tests.

**Test helper mismatch** → Existing tests rely on richer per-prompt mocks than current clack prompt test helper provides. Mitigate by introducing enhanced clack prompt test utilities before bulk test migration.

## Impact Audit

80 files need updating, plus ~45 TUI module files to delete.

### Files by category

| Category                  | Count | Primary imports                                                                      |
| ------------------------- | ----- | ------------------------------------------------------------------------------------ |
| Runtime/infrastructure    | 4     | `TuiLive`, `Spinner.stopAll`, `PromptCancelled`                                      |
| Handler source files      | 24    | `Log` (all), `Spinner` (7), `Multiselect` (2), `TextInput` (1)                       |
| Handler test files        | 19    | `makeLogTestLayer` (all), `makeConfirmTestLayer` (5), `makeMultiselectTestLayer` (5) |
| Operation/workflow source | 8     | `Log` (7), `Confirm` (1), `Multiselect` (1), `TextInput` (1)                         |
| Operation/workflow test   | 15    | `makeLogTestLayer` (all), `makeConfirmTestLayer` (4), `makeSelectTestLayer` (3)      |
| Dev CLI commands/tests    | 10    | `TuiLive` (8), various services, dev TUI e2e assertions                              |
| TUI module (delete)       | ~45   | Entire `src/tui/` directory                                                          |

### Service usage frequency

| Old Service     | Source files     | Test factory               | Test files |
| --------------- | ---------------- | -------------------------- | ---------- |
| `Log`           | ~32              | `makeLogTestLayer`         | ~28        |
| `Spinner`       | 7                | `makeSpinnerTestLayer`     | 2          |
| `Confirm`       | 2                | `makeConfirmTestLayer`     | 7          |
| `Multiselect`   | 3                | `makeMultiselectTestLayer` | 7          |
| `Select`        | 0                | `makeSelectTestLayer`      | 4          |
| `TextInput`     | 2                | `makeTextInputTestLayer`   | 1          |
| `Note`          | 1                | —                          | 0          |
| `PasswordInput` | 0 (dev cmd only) | —                          | 0          |

### Runtime/infrastructure

| File                        | Imports                                           | Impact                                                                            |
| --------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `runtime/index.ts`          | `TuiLive`, all 8 service types, `Spinner.stopAll` | Replace `TuiLive` with `ClackLive`, update `AppLayer` type, remove `stopAll` call |
| `runtime/error-handling.ts` | `PromptCancelled`                                 | Update import path (from `tui/errors` to `prompt-cancelled`)                      |
| `runtime/runtime.test.ts`   | `PromptCancelled`                                 | Update import path                                                                |
| `workspace/service.ts`      | `PromptCancelled`                                 | Update import path (from `tui/index` to `prompt-cancelled`)                       |

### Handler source files

| File                                               | Imports                                      | Impact                                                        |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `cli-commands/init/handler.ts`                     | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/skills/install/command-actions.ts`   | `Log`, `Spinner`, `Multiselect`, `TextInput` | All four services → `ClackLog`, `ClackSpinner`, `ClackPrompt` |
| `cli-commands/skills/install/plan.ts`              | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/skills/install/select-skills.ts`     | `Log`, `Multiselect`                         | `Log` → `ClackLog`, `Multiselect` → `ClackPrompt.multiselect` |
| `cli-commands/skills/new/handler.ts`               | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/skills/list/handler.ts`              | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/skills/publish/handler.ts`           | `Log`, `Spinner`                             | `Log` → `ClackLog`, `Spinner` → `ClackSpinner`                |
| `cli-commands/skills/update/handler.ts`            | `Log`, `Spinner`                             | `Log` → `ClackLog`, `Spinner` → `ClackSpinner`                |
| `cli-commands/skills/enable/handler.ts`            | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/skills/disable/handler.ts`           | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/skills/rename/handler.ts`            | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/skills/fork/handler.ts`              | `Log`, `Spinner`                             | `Log` → `ClackLog`, `Spinner` → `ClackSpinner`                |
| `cli-commands/skills/uninstall/command-actions.ts` | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/packs/add/handler.ts`                | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/packs/new/handler.ts`                | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/packs/install/plan.ts`               | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/packs/install/command-actions.ts`    | `Log`, `Spinner`                             | `Log` → `ClackLog`, `Spinner` → `ClackSpinner`                |
| `cli-commands/packs/remove/handler.ts`             | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/packs/uninstall/plan.ts`             | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/packs/uninstall/command-actions.ts`  | `Log`                                        | `Log` → `ClackLog`                                            |
| `cli-commands/packs/unpack/handler.ts`             | `Log`, `Spinner`                             | `Log` → `ClackLog`, `Spinner` → `ClackSpinner`                |
| `cli-commands/packs/publish/handler.ts`            | `Log`, `Spinner`                             | `Log` → `ClackLog`, `Spinner` → `ClackSpinner`                |
| `workspace/display-plan.ts`                        | `Log`                                        | `Log` → `ClackLog`                                            |
| `workspace/service.ts`                             | `Confirm`, `Log`, `Multiselect`              | All three → `ClackLog`, `ClackPrompt`                         |

### Operation/workflow source files

| File                                           | Imports     | Impact                           |
| ---------------------------------------------- | ----------- | -------------------------------- |
| `extensions/skills/operations/install.ts`      | `Log`       | `Log` → `ClackLog`               |
| `extensions/packs/operations/install.ts`       | `Log`       | `Log` → `ClackLog`               |
| `extensions/packs/operations/uninstall.ts`     | `Log`       | `Log` → `ClackLog`               |
| `extensions/commands/operations/install.ts`    | `Log`       | `Log` → `ClackLog`               |
| `extensions/mcp-servers/operations/install.ts` | `Log`       | `Log` → `ClackLog`               |
| `sources/registry-guard.ts`                    | `TextInput` | `TextInput` → `ClackPrompt.text` |

### Handler test files

| File                                                | Test factories                                                                                                        | Impact                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `cli-commands/init/handler.test.ts`                 | `makeConfirmTestLayer`, `makeLogTestLayer`, `makeMultiselectTestLayer`                                                | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`                              |
| `cli-commands/skills/install/handler.test.ts`       | `makeConfirmTestLayer`, `makeLogTestLayer`, `makeMultiselectTestLayer`                                                | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`                              |
| `cli-commands/skills/install/plan.test.ts`          | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/install/select-skills.test.ts` | `makeMultiselectTestLayer`                                                                                            | → `makeClackPromptTestLayer`                                                       |
| `cli-commands/skills/new/handler.test.ts`           | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/list/handler.test.ts`          | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/publish/handler.test.ts`       | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/enable/handler.test.ts`        | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/disable/handler.test.ts`       | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/rename/handler.test.ts`        | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/fork/handler.test.ts`          | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/skills/uninstall/handler.test.ts`     | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/packs/add/handler.test.ts`            | `makeConfirmTestLayer`, `makeLogTestLayer`, `makeMultiselectTestLayer`, `makeSelectTestLayer`                         | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`                              |
| `cli-commands/packs/new/handler.test.ts`            | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/packs/install/handler.test.ts`        | `makeConfirmTestLayer`, `makeLogTestLayer`, `makeMultiselectTestLayer`, `makeSelectTestLayer`, `makeSpinnerTestLayer` | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`, `makeClackSpinnerTestLayer` |
| `cli-commands/packs/install/plan.test.ts`           | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/packs/remove/handler.test.ts`         | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/packs/uninstall/handler.test.ts`      | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/packs/uninstall/plan.test.ts`         | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/packs/unpack/handler.test.ts`         | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |
| `cli-commands/packs/publish/handler.test.ts`        | `makeLogTestLayer`                                                                                                    | → `makeClackLogTestLayer`                                                          |

### Operation/workflow test files

| File                                                   | Test factories                                                                                                         | Impact                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `extensions/skills/operations/install.test.ts`         | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/skills/operations/enable.test.ts`          | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/skills/operations/new-skill.test.ts`       | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/packs/operations/install.test.ts`          | `makeConfirmTestLayer`, `makeLogTestLayer`, `makeMultiselectTestLayer`, `makeSelectTestLayer`, `makeSpinnerTestLayer`  | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`, `makeClackSpinnerTestLayer` |
| `extensions/packs/operations/add-to-pack.test.ts`      | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/packs/operations/remove-from-pack.test.ts` | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/packs/operations/uninstall.test.ts`        | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/packs/operations/new-pack.test.ts`         | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/commands/operations/install.test.ts`       | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `extensions/mcp-servers/operations/install.test.ts`    | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `workspace/display-plan.test.ts`                       | `makeLogTestLayer`                                                                                                     | → `makeClackLogTestLayer`                                                          |
| `workspace/service.test.ts`                            | `makeConfirmTestLayer`, `makeLogTestLayer`, `makeMultiselectTestLayer`, `makeSelectTestLayer`, `Log`, `MockLogService` | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`                              |
| `sources/registry-guard.test.ts`                       | `makeTextInputTestLayer`                                                                                               | → `makeClackPromptTestLayer`                                                       |
| `workflows/install-command/workflow.test.ts`           | `makeConfirmTestLayer`, `makeLogTestLayer`                                                                             | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`                              |
| `workflows/uninstall-command/workflow.test.ts`         | `makeConfirmTestLayer`, `makeLogTestLayer`                                                                             | → `makeClackPromptTestLayer`, `makeClackLogTestLayer`                              |

### Dev CLI command files

| File                                             | Imports                                | Impact                                                       |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------ |
| `dev-cli-commands/tui/confirm/command.ts`        | `Confirm`, `Log`, `TuiLive`            | → `ClackPrompt`, `ClackLog`, `ClackLive`                     |
| `dev-cli-commands/tui/log/command.ts`            | `Log`, `TuiLive`                       | → `ClackLog`, `ClackLive`                                    |
| `dev-cli-commands/tui/note/command.ts`           | `Note`, `TuiLive`                      | → `ClackLog.note`, `ClackLive`                               |
| `dev-cli-commands/tui/password-input/command.ts` | `Log`, `PasswordInput`, `TuiLive`      | → `ClackLog`, `ClackPrompt.password`, `ClackLive`            |
| `dev-cli-commands/tui/select/command.ts`         | `Log`, `Select`, `TuiLive`             | → `ClackLog`, `ClackPrompt.select`, `ClackLive`              |
| `dev-cli-commands/tui/spinner/command.ts`        | `Spinner`, `TuiLive`                   | → `ClackSpinner`, `ClackLive`                                |
| `dev-cli-commands/tui/multiselect/command.ts`    | `Log`, `Multiselect`, `TuiLive`        | → `ClackLog`, `ClackPrompt.multiselect`, `ClackLive`         |
| `dev-cli-commands/tui/text-input/command.ts`     | `Log`, `TextInput`, `TuiLive`          | → `ClackLog`, `ClackPrompt.text`, `ClackLive`                |
| `dev-main.ts`                                    | `tuiCommand`                           | Update import if dev command directory changes               |
| `dev-cli-commands/tui/command.e2e.test.ts`       | TUI command behavior/output assertions | Update expectations for clack-backed dev playground behavior |

## Migration Plan

Migrate per-command-group (source + tests together) to keep lint passing at each step. Avoids unused import errors from partially-migrated state.

1. **Pre-hardening** — Eliminate spinner leak risks before runtime swap:
   - convert suitable `start/stop` flows to `withSpinner`
   - add explicit failure-path finalization where `start` remains
   - add/adjust tests for failure-path spinner cleanup
2. **Test helper prep** — Enhance clack prompt test helpers to support per-method/per-call behaviors used by existing tests.
3. **Runtime layer** — Replace `TuiLive` with `ClackLive` in `AppLayer`. Update the `AppLayer` type. Remove `stopAll` only after pre-hardening is complete. Migrate `PromptCancelled` imports to `prompt-cancelled`.
4. **Per-group migration** — For each command group (init, skills/_, packs/_, extensions/\*, workspace, sources), migrate handler + operation source files and their corresponding test files together. Update service yields, config shapes (including `Option` unwrapping and return-type preservation), and test layer factories in lockstep.
5. **Dev CLI commands + tests** — Migrate `src/dev-cli-commands/tui/` playground commands and `command.e2e.test.ts` expectations.
6. **Cleanup** — Delete `src/tui/` directory, remove `ink`, `ink-spinner`, `ink-select-input`, `ink-text-input`, and `react` from `package.json`.
7. **Verify** — Full build, lint, typecheck, test pass.
