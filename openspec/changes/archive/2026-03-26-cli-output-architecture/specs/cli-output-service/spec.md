## REMOVED Requirements

### Requirement: Output service provides semantic message output

**Reason**: Superseded by `CliRenderer`. All semantic output methods (`message`, `info`, `success`, `step`, `warn`, `error`, `intro`, `outro`, `cancel`, `note`, `box`) move to `CliRenderer` with identical signatures.
**Migration**: Replace `yield* Output` with `yield* CliRenderer`. Method names are unchanged.

### Requirement: Output service provides streaming text output

**Reason**: Superseded by `CliRenderer`. The `stream` method is no longer needed as a separate concept. Chrome streaming is handled internally by renderer implementations.
**Migration**: Use `CliRenderer` per-level methods directly. For data streaming, use `resultStream()`.

### Requirement: Output service has structured output layers

**Reason**: Superseded by `MachineRenderer`. The `OutputStructured(mode)` factory is replaced by a single `MachineRenderer` layer that handles JSON/NDJSON output. Mode selection is driven by the `--json` flag and TTY detection at the `run()` boundary.
**Migration**: The `run()` boundary selects `MachineRenderer` when `--json` is active or stdout is not a TTY. No per-handler format branching needed.

### Requirement: Output service is injectable and testable

**Reason**: Superseded by `TestRenderer`. The `makeOutputTestLayer()` factory is replaced by `TestRenderer` which captures all `CliRenderer` calls as structured data.
**Migration**: Replace `makeOutputTestLayer()` with `TestRenderer.make()`. Assert on `testRenderer.state.logs`, `testRenderer.state.notes`, etc.

### Requirement: Output live layer imports @clack/prompts directly

**Reason**: Superseded by `InteractiveRenderer`. The Clack import constraint moves to `cli-renderer-interactive.ts`.
**Migration**: `InteractiveRenderer` imports `@clack/prompts` directly. No intermediate modules.
