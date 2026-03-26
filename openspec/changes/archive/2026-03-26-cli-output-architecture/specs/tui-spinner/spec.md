## REMOVED Requirements

### Requirement: Spinner service provides animated progress indicator

**Reason**: Absorbed into `CliRenderer`. The `Activity` service is removed. `startSpinner`/`withSpinner` become `CliRenderer.spinner()`/`withSpinner()` with identical `SpinnerHandle` signatures (`stop`, `update`, `cancel`, `error`, `clear`).
**Migration**: Replace `yield* Activity` with `yield* CliRenderer`. Use `renderer.spinner(message)` and `renderer.withSpinner(message, f, options)`.

### Requirement: Dev demo for spinner

**Reason**: Dev demo commands will be updated to use `CliRenderer` as part of migration.
**Migration**: Update dev demo to yield `CliRenderer` instead of `Activity`. Method signatures are unchanged.
