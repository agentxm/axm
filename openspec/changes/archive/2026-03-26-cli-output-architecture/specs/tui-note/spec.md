## REMOVED Requirements

### Requirement: Note service displays boxed informational callouts

**Reason**: Absorbed into `CliRenderer`. `note(message, title?)` moves to `CliRenderer.note()` with identical signature. Notes write to stderr as chrome output.
**Migration**: Replace `output.note(message, title)` with `renderer.note(message, title)`. Signature is unchanged.

### Requirement: Dev demo for note

**Reason**: Dev demo commands will be updated to use `CliRenderer` as part of migration.
**Migration**: Update dev demo to yield `CliRenderer` instead of `Output`.
