## REMOVED Requirements

### Requirement: InteractionContext exposes Clack service via p property

**Reason**: InteractionContext is an unnecessary abstraction layer. The `Clack` service already provides the same functionality directly.

**Migration**: Replace `yield* InteractionContext` with `yield* Clack`. Access prompts directly via `clack.confirm()`, `clack.select()`, etc. instead of `interaction.p.confirm()`.

### Requirement: OperationContext exposes optional InteractionContext

**Reason**: Mixing UI dependencies into `OperationContext` conflates concerns. Whether a command needs prompts is a handler-level decision expressed through Effect dependencies, not an optional context field.

**Migration**: Remove `interaction` field access from `OperationContext`. Add `Clack` to the handler's Effect requirements if prompts are needed.

### Requirement: InteractionContext has live and test layers

**Reason**: The `Clack` service already provides `ClackLive` and `makeClackTestLayer()` for the same purpose.

**Migration**: Replace `InteractionContextLive` with `ClackLive`. Replace custom `InteractionContext.layer()` with `Clack.layer()` or `makeClackTestLayer()`.
