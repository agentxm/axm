## Context

The spike CLI (`packages/cli-spike`) serves as a proving ground for Effect v4 CLI patterns. It currently has a `tui` subcommand group with 8 minimal demo commands — 5 prompts (text, password, confirm, select, multiselect) and 3 outputs (log, note, spinner). Each demo is hardcoded with no flags, covering a fraction of the CliPrompt (10 methods) and CliRenderer (~20 methods) surface areas.

The existing commands follow a consistent pattern: `Command.make(name, {}, () => withRuntime(Effect.gen(...)))` with `Command.withDescription()`. Commands that accept flags use a config object as the second argument to `Command.make()`.

## Goals / Non-Goals

**Goals:**

- Replace `tui` with two subcommand groups (`prompts`, `outputs`) that together cover every CliPrompt and CliRenderer method
- Each subcommand has per-command flags that exercise the configuration options of the underlying service method
- Each subcommand has descriptive help text (`Command.withDescription`) explaining what the component does and when to use it
- Maintain the same command pattern used by existing spike commands
- Update E2E tests to cover the new subcommand structure

**Non-Goals:**

- Changing `@axm.sh/core` services (CliRenderer, CliPrompt) — this is spike-only
- Backward compatibility with the old `tui` subcommand
- Exhaustive E2E coverage of every flag combination — E2E tests verify the subcommands exist and run, not every permutation
- Adding new capabilities to the core services

## Decisions

### 1. One file per subcommand, parent command.ts aggregates

Keep the existing pattern: each demo lives in its own file (`text.ts`, `box.ts`, etc.) and a parent `command.ts` re-exports the group.

```
packages/cli-spike/src/root/
  prompts/
    command.ts          # promptsCommand with all subcommands
    text.ts
    password.ts
    confirm.ts
    select.ts
    multiselect.ts
    group-multiselect.ts
    select-key.ts
    autocomplete.ts
    autocomplete-multiselect.ts
    path.ts
  outputs/
    command.ts          # outputsCommand with all subcommands
    log.ts
    intro.ts
    note.ts
    box.ts
    spinner.ts
    progress.ts
    task-log.ts
    run-tasks.ts
    table.ts
    detail.ts
    tree.ts
    stream-log.ts
    result.ts
    raw.ts
```

**Why over grouping further:** Flat is simple. Each file is small (~30-60 lines). The parent `command.ts` provides the hierarchy.

### 2. Command reference

#### `prompts` — Interactive input demos (CliPrompt service)

| Command                            | Service method                     | Args | Flags                                                                     | Intent                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------- | ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompts text`                     | `prompt.text()`                    | —    | `--placeholder <str>`, `--default <str>`, `--initial <str>`, `--validate` | Free-form text entry. `--placeholder` shows ghost text, `--default` supplies a value for non-interactive mode, `--initial` pre-fills the input, `--validate` enables a sample length validator.                         |
| `prompts password`                 | `prompt.password()`                | —    | `--mask <char>`                                                           | Masked secret input (tokens, passwords). `--mask` sets the mask character (e.g., `*`); omit for invisible input.                                                                                                        |
| `prompts confirm`                  | `prompt.confirm()`                 | —    | `--active <str>`, `--inactive <str>`, `--initial`, `--vertical`           | Yes/no boolean prompt. `--active`/`--inactive` customize the labels (default: "Yes"/"No"). `--initial` pre-selects "yes". `--vertical` stacks choices vertically.                                                       |
| `prompts path`                     | `prompt.path()`                    | —    | `--root <dir>`, `--directory`, `--initial <path>`                         | Filesystem path input with completion. `--root` constrains browsing to a directory. `--directory` restricts to directories only. `--initial` pre-fills a path.                                                          |
| `prompts select`                   | `prompt.select()`                  | —    | `--max-items <n>`, `--initial <value>`                                    | Single-choice from a list. `--max-items` controls visible options before scrolling. `--initial` pre-selects a value. Uses sample color options.                                                                         |
| `prompts multiselect`              | `prompt.multiselect()`             | —    | `--max-items <n>`, `--required`, `--cursor-at <value>`                    | Multi-choice from a list (space to toggle, enter to submit). `--required` enforces at least one selection. `--max-items` limits visible options. `--cursor-at` sets initial cursor position. Uses sample fruit options. |
| `prompts group-multiselect`        | `prompt.groupMultiselect()`        | —    | `--selectable-groups`, `--group-spacing <n>`, `--required`                | Multi-choice with options organized into named groups. `--selectable-groups` allows toggling entire groups at once. `--group-spacing` controls vertical gap between groups. Uses sample grouped permission options.     |
| `prompts select-key`               | `prompt.selectKey()`               | —    | `--case-sensitive`                                                        | Single-key keyboard selection — user presses one key to choose. `--case-sensitive` distinguishes upper/lower case keys. Uses sample action options (e.g., [d]elete, [r]ename, [c]opy).                                  |
| `prompts autocomplete`             | `prompt.autocomplete()`            | —    | `--max-items <n>`, `--placeholder <str>`, `--initial-input <str>`         | Searchable single-choice — type to filter. `--max-items` limits visible results. `--placeholder` shows hint text. `--initial-input` pre-fills the search query. Uses sample timezone options.                           |
| `prompts autocomplete-multiselect` | `prompt.autocompleteMultiselect()` | —    | `--max-items <n>`, `--required`                                           | Searchable multi-choice — type to filter, space to toggle. `--max-items` limits visible results. `--required` enforces at least one selection. Uses sample package dependency options.                                  |

#### `outputs` — Rendering/display demos (CliRenderer service)

| Command              | Service method                                                                               | Args | Flags                                                                                                                                        | Intent                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outputs log`        | `renderer.message()`, `.info()`, `.success()`, `.step()`, `.warn()`, `.error()`, `.cancel()` | —    | —                                                                                                                                            | Demonstrate all log-level message styles. Shows all seven levels in sequence — message, info, success, step, warn, error, cancel. No flags; the point is seeing them side-by-side.                               |
| `outputs intro`      | `renderer.intro()`, `renderer.outro()`                                                       | —    | —                                                                                                                                            | Session bookend messages — shows both `intro` and `outro` together with hardcoded demo text. No flags; demonstrates the session frame pattern.                                                                   |
| `outputs note`       | `renderer.note()`                                                                            | —    | —                                                                                                                                            | Boxed informational callout. Shows two examples: one with a title, one without. No flags; demonstrates both `note()` signatures.                                                                                 |
| `outputs box`        | `renderer.box()`                                                                             | —    | `--title <str>`, `--content-align <left\|center\|right>`, `--title-align <left\|center\|right>`, `--width <n>`, `--padding <n>`, `--rounded` | Customizable bordered box. Exercises all `BoxOptions`: text alignment, explicit width, inner padding, and corner style. Without flags, shows a default box; with flags, demonstrates each visual option.         |
| `outputs spinner`    | `renderer.withSpinner()`                                                                     | —    | `--success-message <str>`, `--failure-message <str>`                                                                                         | Animated spinner for indeterminate async work. `--success-message` and `--failure-message` customize the completion text (maps to `SpinnerOptions`).                                                             |
| `outputs progress`   | `renderer.withProgress()`                                                                    | —    | `--style <light\|heavy\|block>`, `--max <n>`, `--size <n>`                                                                                   | Progress bar for determinate work. `--style` switches the bar character set, `--max` and `--size` configure the bar dimensions (maps to `ProgressConfig`).                                                       |
| `outputs task-log`   | `renderer.withTaskLog()`                                                                     | —    | `--limit <n>`, `--retain-log`                                                                                                                | Structured task logger with collapsible message groups. `--limit` caps visible log lines, `--retain-log` keeps output after completion (maps to `TaskLogConfig`).                                                |
| `outputs run-tasks`  | `renderer.runTasks()`                                                                        | —    | —                                                                                                                                            | Sequential task runner with pass/fail status. Runs a hardcoded set of simulated tasks to show the multi-task progress pattern.                                                                                   |
| `outputs table`      | `renderer.table()`                                                                           | —    | `--caption <str>`                                                                                                                            | Columnar data table for structured output. Uses sample skill data. `--caption` sets the table caption (maps to `table()` caption param).                                                                         |
| `outputs detail`     | `renderer.detail()`                                                                          | —    | `--title <str>`                                                                                                                              | Single-record detail view — key/value layout for one item. `--title` customizes the section header (maps to `detail()` title param).                                                                             |
| `outputs tree`       | `renderer.tree()`                                                                            | —    | `--title <str>`                                                                                                                              | Hierarchical tree display with labels, details, and icons. Uses a sample workspace file structure. `--title` customizes the header (maps to `tree()` title param).                                               |
| `outputs stream-log` | `renderer.streamLog()`                                                                       | —    | —                                                                                                                                            | Stream text line-by-line with log-level styling. Simulates a streaming build log with hardcoded info-level styling.                                                                                              |
| `outputs result`     | `renderer.result()`, `renderer.resultStream()`                                               | —    | `--json`                                                                                                                                     | Machine-readable structured output via Effect Schema. Shows both `result()` (single value) and `resultStream()` (streaming). `--json` switches to JSON on stdout; without it, shows the human-readable fallback. |
| `outputs raw`        | `renderer.raw()`, `renderer.json()`                                                          | —    | `--json`                                                                                                                                     | Escape-hatch output methods. Without `--json`, uses `raw()` to write unformatted text to stdout. With `--json`, uses `json()` to write raw JSON. Demonstrates the low-level output path.                         |

### 3. Flags defined inline per command, not in a shared flags module

Demo-specific flags (like `--duration`, `--placeholder`, `--style`) are defined inline in each command file rather than in `cli-flags/index.ts`.

**Why:** These flags are single-use demo-specific knobs, not reusable across the real CLI. Shared flags (`--yes`, `--force`, `--non-interactive`) remain imported from `@axm.sh/core/unstable/cli-flags`.

### 4. Help text: single-line imperative description

Main CLI uses single-line imperative descriptions. Demo commands follow the same convention. Flag documentation lives on each flag's `Flag.withDescription()`, not in the command description.

```typescript
// Good: matches main CLI style
Command.withDescription("Render content in a bordered box with optional title");

// Bad: multi-paragraph with flag docs in description
Command.withDescription("Render content in a bordered box...\n\n--title sets the box title...");
```

Each flag carries its own description:

```typescript
title: Flag.string("title").pipe(Flag.withDescription("Box title")),
contentAlign: Flag.choice("content-align", ["left", "center", "right"] as const).pipe(
  Flag.withDescription("Content alignment (default: left)"),
),
```

This keeps `--help` output consistent with the main CLI: command description at the top, flag descriptions in the flags section.

### 5. Demo data is hardcoded but meaningful

Each demo uses illustrative sample data rather than lorem ipsum. Tables show a realistic skill listing, trees show a realistic file hierarchy, selects offer plausible choices. This makes the demos useful as visual references.

### 6. Flags use `Flag.optional` with sensible defaults in the handler

Optional flags return `Option<T>`. The handler uses `Option.getOrElse` to apply defaults. This keeps the flag definition clean and the default behavior documented in the help text.

```typescript
const boxConfig = {
  title: Flag.string("title").pipe(Flag.withDescription("Box title"), Flag.optional),
  contentAlign: Flag.choice("content-align", ["left", "center", "right"] as const).pipe(
    Flag.withDescription("Content alignment (default: left)"),
    Flag.optional,
  ),
  // ...
} as const;
```

### 7. Command naming: single words where possible, hyphenated for multi-word API methods

The main CLI uses single-word command names exclusively (`install`, `list`, `publish`). Demo commands follow this where possible. Where the underlying API method is multi-word (`groupMultiselect`, `selectKey`, `streamLog`), hyphenated names are used since there's no single-word alternative that stays recognizable. This is a spike-only convention — real CLI commands should find single-word names.

Compound names used: `group-multiselect`, `select-key`, `autocomplete-multiselect`, `stream-log`, `task-log`, `run-tasks`. Single-word names used everywhere else: `text`, `password`, `confirm`, `select`, `multiselect`, `autocomplete`, `path`, `log`, `note`, `box`, `spinner`, `progress`, `table`, `detail`, `tree`, `result`.

`intro` and `outro` are combined into a single `intro` command (not `intro-outro`) since they're session bookends that only make sense demonstrated together. The command shows both with hardcoded demo text.

### 8. `result` and `raw` commands demonstrate `--json` interplay

The `result` subcommand shows how `CliRenderer.result()` and `resultStream()` work with the per-command `--json` flag. `result()` returns a boolean indicating whether JSON was emitted (true in machine mode, false in interactive mode). `resultStream()` demonstrates the streaming variant. The `raw` subcommand shows the escape-hatch methods: `raw()` for unformatted text and `json()` for raw JSON output.

### 9. Flags map to real service options — no simulation knobs or content overrides

Every per-command flag maps directly to a configuration option on the underlying CliPrompt or CliRenderer method. Flags like `--placeholder`, `--mask`, `--style`, `--max-items`, `--retain-log` correspond 1:1 to `TextOpts.placeholder`, `PasswordOpts.mask`, `ProgressConfig.style`, `SelectOpts.maxItems`, `TaskLogConfig.retainLog`.

Two categories of flags are **removed**:

1. **Simulation knobs** (`--count`, `--rows`, `--duration`, `--fail-at`, `--lines`, `--groups`, `--depth`, `--steps`) — control the demo harness, not the service. Async demos use hardcoded `Effect.sleep`. Data demos use hardcoded sample data.

2. **Content overrides** (`--message`, `--title` on `note`/`intro`, `--level` on `log`/`stream-log`) — set demo text or route to specific methods, not service configuration options. Demo content is hardcoded. `outputs log` always shows all six levels. `outputs stream-log` uses a fixed level. `outputs note` and `outputs intro` use hardcoded text.

Exception: `--title` on `outputs box`, `outputs table`, `outputs detail`, `outputs tree` is kept because it maps directly to an optional parameter on the service method (`box(message, title?)`, `table(items, columns, caption?)`, `detail(item, columns, title?)`, `tree(roots, def, title?)`). `--caption` on `table` maps to the same concept.

Commands that use `Effect.sleep` for simulation set `isLongRunning: true` in `withRuntime`.

### 10. Prompt commands respect `--non-interactive`

The CliPrompt service already handles non-interactive mode (returns defaults or fails with `PROMPT_REQUIRED`). Prompt demo commands that provide a `--default` flag (like `text`) demonstrate the non-interactive path: `axm-spike prompts text --non-interactive --default "hello"` succeeds. Prompt demos without defaults fail fast with a clear message in non-interactive mode — this is correct behavior, not a bug.

For E2E testability, prompt demos that support `initialValue` (confirm, select, multiselect) must pass a hardcoded `initialValue` to the prompt options so that `--non-interactive` has a value to return. This is an implementation requirement — without it, non-interactive E2E tests for these prompts would always fail.

### 11. E2E tests serve dual purpose: demo validation and CliRenderer/CliPrompt service coverage

These E2E tests validate two things at once:

1. **Spike demo commands** work end-to-end (built artifact, correct wiring, exit codes)
2. **CliRenderer and CliPrompt services** behave correctly when exercised through real CLI invocations — output formatting, non-interactive fallbacks, error handling, machine-readable modes

This makes the spike E2E suite the reference E2E test suite for `@axm.sh/core`'s rendering and prompt services. The main CLI's E2E project (`cli-e2e`) will reuse the shared helpers to test these same services in production commands.

### 12. E2E test structure

Tests live in `packages/cli-spike-e2e/` and follow existing patterns: `createCliRunner` against the built artifact, `NO_COLOR=1`, `AXM_TELEMETRY=0`, try/finally cleanup.

**Output command tests** — exercise rendering end-to-end without user interaction:

| Test                                 | What it validates                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `outputs --help`                     | Lists all 14 output subcommands                                                                   |
| `outputs log`                        | All seven log levels (message, info, success, step, warn, error, cancel) produce output on stderr |
| `outputs intro`                      | Intro/outro framing renders                                                                       |
| `outputs note`                       | Boxed note renders with and without title                                                         |
| `outputs box`                        | Default box renders                                                                               |
| `outputs box --rounded --width 40`   | Box options pass through to renderer                                                              |
| `outputs spinner`                    | Spinner completes with success message (long timeout)                                             |
| `outputs progress --style block`     | Progress bar style selection                                                                      |
| `outputs task-log --retain-log`      | Task log retains output                                                                           |
| `outputs run-tasks`                  | Multi-task runner shows pass/fail status                                                          |
| `outputs table`                      | Table renders with columns and data                                                               |
| `outputs table --caption "My Table"` | Caption passes through                                                                            |
| `outputs detail`                     | Detail view renders key/value pairs                                                               |
| `outputs tree`                       | Tree renders hierarchical structure                                                               |
| `outputs stream-log`                 | Streaming log produces line-by-line output                                                        |
| `outputs result`                     | Human-readable fallback on stdout                                                                 |
| `outputs result --json`              | Machine-readable JSON on stdout, validates against schema                                         |
| `outputs raw`                        | Raw text output to stdout                                                                         |
| `outputs raw --json`                 | Raw JSON output to stdout                                                                         |

**Prompt command tests** — validate non-interactive behavior and help:

| Test                                            | What it validates                                 |
| ----------------------------------------------- | ------------------------------------------------- |
| `prompts --help`                                | Lists all 10 prompt subcommands                   |
| `prompts text --help`                           | Help text renders for interactive command         |
| `prompts text --non-interactive --default "hi"` | Non-interactive path succeeds with default        |
| `prompts text --non-interactive` (no default)   | Fails with `PROMPT_REQUIRED` error, non-zero exit |
| `prompts confirm --non-interactive`             | Confirm with default initial value succeeds       |
| `prompts select --non-interactive`              | Select with initial value succeeds                |
| Each prompt `--help`                            | Every prompt subcommand's help renders            |

**Machine-readable mode tests** — validate `--output-format` interplay:

| Test                                  | What it validates                      |
| ------------------------------------- | -------------------------------------- |
| `outputs result --output-format json` | Structured JSON output via global flag |
| `outputs table --output-format json`  | Table data as JSON                     |

### 13. Shared E2E helpers in `e2e-utils`

New helpers added to `packages/e2e-utils/` for reuse by both `cli-spike-e2e` and `cli-e2e`:

**Output assertion helpers:**

- `expectStderr(result, pattern)` — Assert stderr contains a string or matches a regex. Wraps the common `expect(result.stderr).toContain()` / `.toMatch()` pattern with a clearer name for output tests (CliRenderer chrome goes to stderr).
- `expectStdout(result, pattern)` — Assert stdout contains a string or matches a regex. Used for data output (table, detail, tree, result).
- `getOutput(result)` — Concatenate stdout + stderr for flexible assertions where output channel doesn't matter. Already exists in spike E2E utils — promote to shared.
- `expectExitCode(result, code)` — Assert exit code with a descriptive failure message that includes stdout/stderr on mismatch.
- `parseJsonOutput(result)` — Parse stdout as JSON, failing with a clear message if it's not valid JSON. For `--json` / `--output-format json` tests.
- `parseNdjsonOutput(result)` — Parse stdout as newline-delimited JSON, returning an array of parsed objects. For `--output-format stream-json` tests.

**Non-interactive prompt helpers:**

- `expectNonInteractiveSuccess(runCli, args)` — Run a command with `--non-interactive` appended, assert exit code 0. Convenience for testing that a prompt command works with defaults.
- `expectNonInteractiveFailure(runCli, args)` — Run a command with `--non-interactive` appended, assert non-zero exit code and stderr contains "PROMPT_REQUIRED" or similar. Validates that prompts without defaults fail correctly.

These helpers are thin wrappers — they don't hide the underlying assertions, just reduce repetition and make test intent clearer. The main CLI E2E project imports them for its own command tests.

## Risks / Trade-offs

**23 subcommands is a lot of files** → Each file is small and formulaic. The consistency makes them easy to maintain. The alternative (fewer commands doing more) would make each command harder to understand and lose the 1:1 mapping with service methods.

**Some prompts can't be fully exercised in E2E** → Prompt commands that require TTY interaction (text, password, autocomplete) can only be E2E-tested via `--help` and `--non-interactive` paths. Interactive testing requires manual invocation. This is acceptable — the non-interactive paths still validate the CliPrompt service's fallback behavior.

**Flag names may not match CliPrompt/CliRenderer option names exactly** → CLI flags use kebab-case (`--max-items`) while TypeScript options use camelCase (`maxItems`). The mapping is consistent with standard CLI conventions.
