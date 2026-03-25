## REMOVED Requirements

### Requirement: Log service provides semantic log output

**Reason**: Absorbed into `CliRenderer`. Per-level methods (`info`, `warn`, `error`, `success`, `message`, `step`, `intro`, `outro`, `cancel`, `note`, `box`) move to `CliRenderer` with identical signatures. All chrome methods write to stderr in both interactive and machine modes.
**Migration**: Replace `yield* Output` with `yield* CliRenderer`. Method names and signatures are unchanged.

### Requirement: Log service is injectable and testable

**Reason**: Superseded by `TestRenderer`. Log calls are captured in `testRenderer.state.logs` as typed `LogMessage` records.
**Migration**: Replace `makeOutputTestLayer()` with `TestRenderer.make()`. Assert on `testRenderer.state.logs`.

### Requirement: Dev demo for log

**Reason**: Dev demo commands will be updated to use `CliRenderer` as part of migration.
**Migration**: Update dev demo to yield `CliRenderer` instead of `Output`.
