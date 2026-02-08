## Why

The CLI currently uses `@clack/prompts` for interactive input, wrapped via the `clack-effect` service. Clack is a good library but its prompt-based model limits composability — each prompt is an isolated async call with no shared rendering context. Ink provides a React-like component model for terminal UIs, enabling richer composition, custom layouts, and better control over rendering. Adopting Ink as the prompt backend gives us a foundation for more sophisticated terminal interactions while maintaining the same effectful service pattern.

## What Changes

- Add `ink` and `ink-testing-library` as dependencies
- Create a new `packages/cli/src/prompts` module providing an Effect service (`Prompts`) backed by Ink
- The `Prompts` service covers the same prompt primitives as the current `clack-effect` module:
  - **Text input** — free-form text entry with placeholder, default value, and validation
  - **Password input** — masked text entry with validation
  - **Confirm** — yes/no boolean prompt
  - **Select** — single selection from a list of options with optional hints
  - **Multiselect** — multiple selection with optional initial values and required flag
  - **Group** — sequenced prompt chains where later prompts can reference earlier answers
- The `Prompts` service also provides output and progress primitives:
  - **Log** — semantic log messages (info, warn, error, success, message)
  - **Intro/Outro** — session lifecycle bookends
  - **Spinner** — indeterminate progress indicator
  - **Note** — boxed informational callout
- Provide a test layer (`makePromptsTestLayer`) with mock implementations and inspection, following the same pattern as `clack-effect/test.ts`
- The existing `clack-effect` module is **not** modified or removed — migration of existing consumers is out of scope

## Capabilities

### New Capabilities

- `tui`: Effect service for terminal UI rendering — log output (info, warn, error, success, message), intro/outro lifecycle, spinner progress indicator, and boxed note callouts
- `tui-prompts`: Effect service for interactive terminal prompts — text input, password input, confirm, select, multiselect, and grouped prompt chains, with typed errors and a test layer

### Modified Capabilities

_(none)_

## Impact

- **Dependencies**: `ink`, `react`, `ink-testing-library` added to `packages/cli`
- **Code**: New `packages/cli/src/prompts/` module (service, types, errors, test utilities, index barrel)
- **Existing code**: No changes — `clack-effect` remains untouched, no consumers are migrated
