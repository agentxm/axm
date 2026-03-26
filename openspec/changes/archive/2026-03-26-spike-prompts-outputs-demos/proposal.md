## Why

The spike CLI has a single `tui` subcommand that demos only 8 of the ~25 CliRenderer/CliPrompt capabilities — missing progress bars, tables, trees, boxes, autocomplete, grouped multiselect, path input, task logging, and more. Each existing demo is also minimal: hardcoded options with no way to exercise the different configuration flags each component supports. Splitting into `prompts` (interactive input) and `outputs` (rendering/display) with per-command flags creates a comprehensive, self-documenting showcase of the full CLI toolkit.

## What Changes

- **Remove** the `tui` subcommand group from `cli-spike`
- **Add** `prompts` subcommand group — one subcommand per CliPrompt method, each with flags that map to the prompt's configuration options
- **Add** `outputs` subcommand group — one subcommand per CliRenderer capability, each with flags that exercise different rendering modes/options
- Each subcommand includes a single-line imperative description; flag documentation lives on each flag's `Flag.withDescription()`
- Existing E2E tests in `cli-spike-e2e` that reference `tui` are updated to target the new subcommands

### Prompts subcommands (CliPrompt service)

| Subcommand                 | CliPrompt method            | Key flags                                               |
| -------------------------- | --------------------------- | ------------------------------------------------------- |
| `text`                     | `text()`                    | `--placeholder`, `--default`, `--initial`, `--validate` |
| `password`                 | `password()`                | `--mask`                                                |
| `confirm`                  | `confirm()`                 | `--active`, `--inactive`, `--initial`, `--vertical`     |
| `select`                   | `select()`                  | `--max-items`, `--initial`                              |
| `multiselect`              | `multiselect()`             | `--max-items`, `--required`, `--cursor-at`              |
| `group-multiselect`        | `groupMultiselect()`        | `--selectable-groups`, `--group-spacing`, `--required`  |
| `select-key`               | `selectKey()`               | `--case-sensitive`                                      |
| `autocomplete`             | `autocomplete()`            | `--max-items`, `--placeholder`, `--initial-input`       |
| `autocomplete-multiselect` | `autocompleteMultiselect()` | `--max-items`, `--required`                             |
| `path`                     | `path()`                    | `--root`, `--directory`, `--initial`                    |

### Outputs subcommands (CliRenderer service)

| Subcommand   | CliRenderer method(s)                         | Key flags                                                                          |
| ------------ | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `log`        | `message/info/success/step/warn/error/cancel` | —                                                                                  |
| `intro`      | `intro()`, `outro()`                          | —                                                                                  |
| `note`       | `note()`                                      | —                                                                                  |
| `box`        | `box()`                                       | `--title`, `--content-align`, `--title-align`, `--width`, `--padding`, `--rounded` |
| `spinner`    | `withSpinner()`                               | `--success-message`, `--failure-message`                                           |
| `progress`   | `withProgress()`                              | `--style`, `--max`, `--size`                                                       |
| `task-log`   | `withTaskLog()`                               | `--limit`, `--retain-log`                                                          |
| `run-tasks`  | `runTasks()`                                  | —                                                                                  |
| `table`      | `table()`                                     | `--caption`                                                                        |
| `detail`     | `detail()`                                    | `--title`                                                                          |
| `tree`       | `tree()`                                      | `--title`                                                                          |
| `stream-log` | `streamLog()`                                 | —                                                                                  |
| `result`     | `result()`, `resultStream()`                  | `--json`                                                                           |
| `raw`        | `raw()`, `json()`                             | `--json`                                                                           |

## Capabilities

### New Capabilities

- `spike-prompts-demo`: Interactive prompt demos — one subcommand per CliPrompt method with flags to exercise all configuration options
- `spike-outputs-demo`: Renderer/display demos — one subcommand per CliRenderer capability with flags to exercise all rendering modes

### Modified Capabilities

(none — the existing `tui-*` specs describe the core services, not the spike demos)

## Impact

- **Code**: `packages/cli-spike/src/root/tui/` replaced by `packages/cli-spike/src/root/prompts/` and `packages/cli-spike/src/root/outputs/`
- **Wiring**: `app.ts` imports `promptsCommand` and `outputsCommand` instead of `tuiCommand`
- **E2E tests**: `packages/cli-spike-e2e/src/tui.e2e.test.ts` replaced with comprehensive prompt and output E2E tests — these serve dual purpose as both demo command validation and reference E2E coverage for `CliRenderer`/`CliPrompt` services
- **Shared E2E utils**: New output assertion and non-interactive prompt helpers added to `packages/e2e-utils/` for reuse by `cli-e2e`
- **No impact** on `@axm.sh/core` or `@axm.sh/cli` — this is spike + E2E only
