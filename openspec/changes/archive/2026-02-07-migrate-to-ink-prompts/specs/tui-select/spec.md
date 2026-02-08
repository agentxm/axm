## ADDED Requirements

### Requirement: Select prompt collects single selection from a list

The Select service SHALL be a self-contained module under `src/tui/select/` with its own Effect service tag, live layer, types (`SelectConfig`), Ink component, and test layer factory. It SHALL provide a `prompt` method that renders a list of options for single selection. It accepts a config with `message` (required), `items` (readonly array of `T`), and `toOption` (function mapping `T` to `{ label: string, hint: Option<string> }`). It returns `Effect<T, PromptError | PromptCancelled>`.

#### Scenario: Basic select

- **WHEN** a handler calls `select.prompt({ message: "Template?", items: [a, b, c], toOption })`
- **THEN** the prompt SHALL render the message and a navigable list of options
- **WHEN** the user navigates to the second item and presses Enter
- **THEN** the effect SHALL succeed with item `b` (the original item, not the label)

#### Scenario: Select with hints

- **WHEN** `toOption` returns a hint for an item
- **THEN** the hint text SHALL be displayed alongside the option label

#### Scenario: Select cancelled

- **WHEN** the user presses Escape or Ctrl+C during selection
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Select has a test layer

The test layer factory SHALL return a `[Layer, MockSelectService]` tuple. The mock SHALL support configurable behavior: return by index, return by value, or simulate cancellation.

#### Scenario: Mock returns by index

- **WHEN** a test creates a select test layer with `{ type: "return", index: 1 }`
- **AND** a handler calls `select.prompt(...)` with 3 items
- **THEN** the mock SHALL return the second item without rendering any UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test creates a select test layer with `{ type: "cancel" }`
- **AND** a handler calls `select.prompt(...)`
- **THEN** the mock SHALL fail with `PromptCancelled`

### Requirement: Dev demo for select

The dev entry point at `src/dev/tui.ts` SHALL include a `select` sub-command for manually testing single selection.

#### Scenario: Run select demo

- **WHEN** a developer runs `pnpm tui select`
- **THEN** the dev entry point SHALL render a select prompt with sample options and print the selection
