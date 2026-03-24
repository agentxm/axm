## Why

CLI command handlers are coupled to Clack's API surface for all output, activity indicators, and user input. This means Clack's presentation vocabulary (intro/outro/box/note) leaks into business logic, structured output implementations are awkward translations of Clack's visual concepts, and swapping the TUI library would require changing every handler. The handler should express _what_ it wants to communicate, and the layer should decide _how_ to present it.

## What Changes

- **BREAKING**: Introduce three new Effect services — `Output`, `Activity`, `Input` — that replace the six Clack services (`ClackLog`, `ClackStream`, `ClackSpinner`, `ClackProgress`, `ClackTaskLog`, `ClackPrompt`) as the API handlers use.
- **BREAKING**: All config types, handle types, and option types are redefined as our own — no Clack types in handler signatures.
- **BREAKING**: `writeOutput(format, schema, data, textRenderer)` is absorbed into `Output.result(schema, data, textRenderer)` — the output format is resolved by the layer, not passed by the handler.
- **BREAKING**: The merged convenience layers `ClackLive` / `ClackStructuredLive` are replaced by `OutputLive` / `ActivityLive` / `InputLive` and their structured counterparts.
- **BREAKING**: Legacy aliases (`Log`, `Spinner`, `PromptBehavior`) are removed.
- `runTasks` helper moves to `Activity.runTasks`.
- Clack remains the text-mode implementation behind the layers — it becomes a private dependency, not a public API surface.
- All existing handler behavior is preserved with full 1:1 method parity to current Clack services.

## Capabilities

### New Capabilities

- `cli-output-service`: Output service providing one-shot messages (info, success, warn, error, message, step, intro, outro, cancel, note, box), streaming text output, and typed result emission. Replaces ClackLog, ClackStream, and writeOutput.
- `cli-activity-service`: Activity service providing lifecycle-managed operation wrappers — spinner (indeterminate), progress bar (determinate), task log (grouped hierarchical), and sequential task runner. Replaces ClackSpinner, ClackProgress, ClackTaskLog, and runTasks.
- `cli-input-service`: Input service providing interactive user prompts — text, password, confirm, select, multiselect, groupMultiselect, selectKey, autocomplete, autocompleteMultiselect, path. Replaces ClackPrompt.

### Modified Capabilities

- `tui-log`: Requirements change from ClackLog service to Output service.
- `tui-spinner`: Requirements change from ClackSpinner service to Activity service (spinner methods).
- `tui-confirm`: Requirements change from ClackPrompt.confirm to Input.confirm.
- `tui-select`: Requirements change from ClackPrompt.select to Input.select.
- `tui-multiselect`: Requirements change from ClackPrompt.multiselect to Input.multiselect.
- `tui-text-input`: Requirements change from ClackPrompt.text to Input.text.
- `tui-password-input`: Requirements change from ClackPrompt.password to Input.password.
- `tui-note`: Requirements change from ClackLog.note to Output.note.

## Impact

- **Handlers** (~25 files in `cli-commands/`, `workflows/`, `workspace/`, `auth/`): All imports and service references change from Clack services to Output/Activity/Input.
- **Command runtime** (`command-runtime.ts`): Layer composition changes from `ClackLive`/`ClackStructuredLive` to new service layers.
- **Test layers**: `makeClackLogTestLayer`, `makeClackSpinnerTestLayer`, `makeClackPromptTestLayer` etc. are replaced with `makeOutputTestLayer`, `makeActivityTestLayer`, `makeInputTestLayer`.
- **clack-effect/**: Deleted entirely — Clack delegation inlined into `*-live.ts` files. `@clack/prompts` becomes a direct dependency of the live layers only.
- **output.ts**: `writeOutput` and `resolveOutputFormat` move into the Output layer implementation. `emitEvent` and NDJSON schemas remain for structured layer use.
- **E2E tests**: No change expected — they test CLI binary output, not internal service interfaces.
