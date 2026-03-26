## REMOVED Requirements

### Requirement: Activity service provides spinner (indeterminate progress)

**Reason**: Absorbed into `CliRenderer`. `startSpinner`/`withSpinner` become `CliRenderer.spinner()`/`withSpinner()` with identical handle signatures.
**Migration**: Replace `yield* Activity` with `yield* CliRenderer`. Use `renderer.spinner()` and `renderer.withSpinner()`.

### Requirement: Activity service provides progress (determinate progress)

**Reason**: Absorbed into `CliRenderer`. `startProgress`/`withProgress` become `CliRenderer.progress()`/`withProgress()`.
**Migration**: Replace `activity.startProgress()`/`activity.withProgress()` with `renderer.progress()`/`renderer.withProgress()`.

### Requirement: Activity service provides task log (grouped hierarchical output)

**Reason**: Absorbed into `CliRenderer`. `startTaskLog`/`withTaskLog` become `CliRenderer.taskLog()`/`withTaskLog()`.
**Migration**: Replace `activity.startTaskLog()`/`activity.withTaskLog()` with `renderer.taskLog()`/`renderer.withTaskLog()`.

### Requirement: Activity service provides sequential task runner

**Reason**: Absorbed into `CliRenderer`. `runTasks` becomes `CliRenderer.runTasks()`.
**Migration**: Replace `activity.runTasks()` with `renderer.runTasks()`.

### Requirement: Activity service has structured output layers

**Reason**: Superseded by `MachineRenderer`. NDJSON progress events move to `MachineRenderer` stderr output. JSON mode no-ops are handled by `MachineRenderer` internally.
**Migration**: The `run()` boundary selects `MachineRenderer` when `--json` is active. No per-handler structured layer wiring needed.

### Requirement: Activity service is injectable and testable

**Reason**: Superseded by `TestRenderer`. The `makeActivityTestLayer()` factory is replaced by `TestRenderer` which captures spinner messages and all activity calls.
**Migration**: Replace `makeActivityTestLayer()` with `TestRenderer.make()`. Assert on `testRenderer.state.spinnerMessages`.

### Requirement: Activity live layer imports @clack/prompts directly

**Reason**: Superseded by `InteractiveRenderer`. The Clack import constraint moves to `cli-renderer-interactive.ts`.
**Migration**: `InteractiveRenderer` imports `@clack/prompts` directly.
