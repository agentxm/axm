## Why

Command handlers currently split output across three services (`Output`, `Activity`, `Input`) with format switching handled per-service (`OutputLive`/`OutputStructured`, `ActivityLive`/`ActivityStructured`). This creates several problems:

- **No typed data output path.** Handlers that support `--json` manually call `process.stdout.write(JSON.stringify(...))` — there's no service method for emitting structured results. Machine consumers get ad-hoc JSON with no schema contract.
- **No data display primitives.** There's no table or list rendering — handlers that need tabular output must format strings themselves, duplicating layout logic across commands.
- **Coarse verbosity control.** `CliEnvironment` exposes boolean `verbose`/`debug` flags. There's no quiet mode, no verbosity levels, and no helpers to conditionally emit output based on verbosity.
- **Fragmented service surface.** Three services with six implementations (live + structured × 3) increases wiring complexity. Handlers import from multiple services for a single command's output needs.
- **stdout/stderr separation is informal.** Chrome and data output aren't systematically routed to separate channels, so `axm command | jq` doesn't reliably work.

## What Changes

- Replace `Output`, `Activity`, and their structured variants with a single `CliRenderer` service that handles all output — chrome (spinners, logs, notes, intro/outro), data display (tables, trees), and machine output (JSON, NDJSON streaming).
- Replace `--output-format text|json|stream-json` with a per-command `--json` flag. Only commands with output schemas declare it. Streaming is handled by `resultStream()` method, not a separate format mode.
- Replace boolean `verbose`/`debug` in `CliEnvironment` with a `Verbosity` service exposing four levels (quiet, normal, verbose, debug) and conditional emission helpers.
- Add `result()` and `resultStream()` methods for typed data output with schema-per-command — each command declares its output schema, which drives JSON field names, table columns, and future shell completions.
- Add `table()` for tabular data display and `tree()` as a unified primitive for all non-tabular structured output (flat lists, key-value displays, grouped lists, dependency trees) — styled to match Clack's visual language.
- Add `-q`/`--quiet` and `-v`/`--verbose` flags; `-vv` as alias for `--debug`.
- Formalize stdout/stderr channel separation: data methods write to stdout, chrome methods write to stderr.
- Add two-axis terminal detection (`canRender` × `isInteractive`) so CI environments get colored static output without animated spinners.
- Ship `TestRenderer` that captures structured calls for assertion — tests never parse ANSI escape codes.

## Capabilities

### New Capabilities

- `cli-renderer`: Unified rendering service contract — method signatures, mode selection (interactive vs machine), channel routing (stdout vs stderr), and implementation switching via layers (InteractiveRenderer / MachineRenderer / TestRenderer).
- `cli-data-output`: Typed data output — `result()`, `resultStream()`, schema-per-command, NDJSON streaming with sequence numbers.
- `cli-verbosity`: Verbosity service — four levels (quiet/normal/verbose/debug), flag resolution (`-q`, `-v`, `-vv`), conditional emission helpers (`whenVerbose`, `whenNotQuiet`), and Effect logger integration.
- `cli-data-display`: Table and tree rendering — `table()` takes typed data + column definitions (header, value accessor, width, alignment, priority). `tree()` takes typed `TreeNode<T>` roots + a `TreeDef<T>` (label, detail, icon callbacks), unifying flat lists, key-value displays, grouped lists, and dependency trees under one primitive. Renderer owns all formatting. Column priority enables verbosity-aware column visibility without handler branching.
- `cli-test-renderer`: Test renderer — captures all renderer calls as structured data, `TestRendererState` for assertions, `TestMachineRenderer` variant for machine output path testing.

### Superseded Capabilities

- `cli-output-service`: Superseded by `cli-renderer`. `Output` methods (`message`, `info`, `success`, `warn`, `error`, `intro`, `outro`, `note`) become `CliRenderer` chrome methods. `Output.stream()` becomes `CliRenderer.streamLog()`.
- `cli-flags`: `--output-format` removed; per-command `--json` flag added (same pattern as `--yes`, `--force`). `-q`/`--quiet`, `-v`/`--verbose` added as global flags. Verbosity resolution moves to dedicated `Verbosity` service.
- `tui-spinner`: `Activity` service removed. `startSpinner`/`withSpinner` become `CliRenderer.spinner()`/`withSpinner()`.
- `tui-log`: Per-level methods (`info`/`warn`/`error`/`success`/`step`) become `CliRenderer.log()` with a `LogMessage` discriminant.
- `tui-note`: `Output.note()` becomes `CliRenderer.note()`.

## Impact

- **packages/core** — `CliRenderer` + `Verbosity` services and layers replace `Output`, `Activity`, and their live/structured layers. `cli-flags` gains new flag definitions.
- **packages/cli** — Handlers use `CliRenderer` for all output. Handlers supporting machine output declare output schemas, add the `--json` flag, and use `result()`. Runtime wiring in `run()` boundary updated.
- **Test infrastructure** — `TestRenderer` replaces `makeOutputTestLayer()`.
- **Dependencies** — No new runtime dependencies expected.
