## Why

The CLI currently uses `@clack/prompts` for interactive input, wrapped via the `clack-effect` service. Clack is a good library but its prompt-based model limits composability — each prompt is an isolated async call with no shared rendering context. Ink provides a React-like component model for terminal UIs, enabling richer composition, custom layouts, and better control over rendering. Adopting Ink as the prompt backend gives us a foundation for more sophisticated terminal interactions while maintaining the same effectful service pattern.

## What Changes

- Add `ink`, `react`, and related dependencies
- Create a new `packages/cli/src/tui/` module with individual Effect services per TUI component, each self-contained with its own service, types, test layer, and Ink component:
  - **text-input** — free-form text entry with placeholder, default value, and validation
  - **password-input** — masked text entry with validation
  - **confirm** — yes/no boolean prompt
  - **select** — single selection from a list of options with optional hints
  - **multiselect** — multiple selection with optional initial values and required flag
  - **log** — semantic log messages (info, warn, error, success, message)
  - **spinner** — indeterminate progress indicator
  - **note** — boxed informational callout
- Each component provides a test layer following the `[Layer, MockService]` tuple pattern from `clack-effect/test.ts`
- The existing `clack-effect` module is **not** modified or removed — migration of existing consumers is out of scope

## Capabilities

### New Capabilities

- `tui-log`: Effect service for semantic log output (info, warn, error, success, message)
- `tui-spinner`: Effect service for animated indeterminate progress indicator
- `tui-note`: Effect service for boxed informational callouts
- `tui-text-input`: Effect service for free-form text entry with placeholder, default value, and validation
- `tui-password-input`: Effect service for masked text entry
- `tui-confirm`: Effect service for yes/no boolean prompts
- `tui-select`: Effect service for single selection from a list of options
- `tui-multiselect`: Effect service for multiple selection from a list of options

### Modified Capabilities

_(none)_

## Impact

- **Dependencies**: `ink`, `react`, `ink-testing-library` added to `packages/cli`
- **Code**: New `packages/cli/src/tui/` module with sub-modules per component (text-input, select, spinner, etc.)
- **Existing code**: No changes — `clack-effect` remains untouched, no consumers are migrated
