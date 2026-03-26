## REMOVED Requirements

### Requirement: Input service provides interactive prompts

**Reason**: Renamed to `CliPrompt`. Same prompt methods (`text`, `password`, `confirm`, `select`, `multiselect`, `path`), renamed service for consistency with `CliRenderer`. Rarely-used Clack-specific methods (`groupMultiselect`, `selectKey`, `autocomplete`, `autocompleteMultiselect`) are dropped from the initial interface.
**Migration**: Replace `yield* Input` with `yield* CliPrompt`. Method signatures are unchanged for core prompt types.

### Requirement: Input prompts support cancellation

**Reason**: Unchanged behavior, moved to `CliPrompt`. `PromptCancelled` remains a distinct control-flow signal.
**Migration**: No change in cancellation behavior. `CliPrompt` methods still fail with `PromptCancelled`.

### Requirement: Input prompts support validation

**Reason**: Unchanged behavior, moved to `CliPrompt`.
**Migration**: Pass `validate` functions to `CliPrompt` methods as before.

### Requirement: Input service guards against non-interactive mode

**Reason**: Moved to `CliPrompt` with improved semantics. Non-interactive guard is built into the `InteractivePrompt` layer. When non-interactive and no default exists, the prompt fails fast with `PROMPT_REQUIRED` and suggests the equivalent flag.
**Migration**: `CliPrompt` handles non-interactive mode internally. `--yes` is handled by the handler via `autoConfirm()`, not inside the prompt service.

### Requirement: Input service has structured output layer

**Reason**: Removed. `--json` mode does not block prompts. Prompts use stderr/stdin and are independent of the stdout data channel.
**Migration**: Remove `InputStructured` layer references. `CliPrompt` works in both interactive and `--json` modes. Use `--non-interactive` to suppress prompts in scripts.

### Requirement: Input config types are owned, not Clack types

**Reason**: Unchanged principle, moved to `CliPrompt`. Config types (`TextOpts`, `ConfirmOpts`, `SelectOpts`, etc.) are defined in `cli-prompt.ts`.
**Migration**: Import config types from `@axm.sh/core/unstable/cli-prompt`.

### Requirement: Input service replaces legacy prompt wrappers

**Reason**: Already completed. Legacy prompt services were removed in the original migration.
**Migration**: No action needed.

### Requirement: Input service is injectable and testable

**Reason**: Superseded by `TestPrompt`. The `makeInputTestLayer()` factory is replaced by `TestPrompt` with canned response queues and call recording.
**Migration**: Replace `makeInputTestLayer()` with `TestPrompt.make({ textResponses, confirmResponses, ... })`.

### Requirement: Input live layer imports @clack/prompts directly

**Reason**: Moved to `CliPrompt`. The Clack import constraint moves to `cli-prompt-interactive.ts`.
**Migration**: `InteractivePrompt` imports `@clack/prompts` directly.
