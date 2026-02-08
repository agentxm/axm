## Requirements

### Requirement: Multiselect prompt collects multiple selections from a list

The Multiselect service SHALL be a self-contained module under `src/tui/multiselect/` with its own Effect service tag, live layer, types (`MultiselectConfig`), Ink component, and test layer factory. It SHALL provide a `prompt` method that renders a list of options for multiple selection. It accepts a config with `message` (required), `items` (readonly array of `T`), `toOption` (function mapping `T` to `{ label: string, value: string, hint: Option<string> }`), and optional `initialValues` (`Option<readonly string[]>`) and `required` (`Option<boolean>`). It returns `Effect<readonly T[], PromptError | PromptCancelled>`.

#### Scenario: Basic multiselect

- **WHEN** a handler calls `multiselect.prompt({ message: "Skills?", items: [...], toOption, ... })`
- **THEN** the prompt SHALL render the message and a navigable list with toggleable checkboxes
- **WHEN** the user toggles two items and presses Enter
- **THEN** the effect SHALL succeed with an array containing the two selected original items

#### Scenario: Multiselect with initial values

- **WHEN** `initialValues` is `Option.some(["skill-a", "skill-b"])`
- **THEN** items whose `toOption` value matches SHALL be pre-selected

#### Scenario: Multiselect with required flag

- **WHEN** `required` is `Option.some(true)` and the user attempts to submit with no selections
- **THEN** the prompt SHALL prevent submission and indicate that at least one selection is required

#### Scenario: Multiselect cancelled

- **WHEN** the user presses Escape or Ctrl+C during multiselect
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Multiselect has a test layer

The test layer factory SHALL return a `[Layer, MockMultiselectService]` tuple. The mock SHALL support configurable behavior: return by indices, return by values, or simulate cancellation.

#### Scenario: Mock returns by indices

- **WHEN** a test creates a multiselect test layer with `{ type: "return", indices: [0, 2] }`
- **AND** a handler calls `multiselect.prompt(...)` with 3 items
- **THEN** the mock SHALL return the first and third items without rendering any UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test creates a multiselect test layer with `{ type: "cancel" }`
- **AND** a handler calls `multiselect.prompt(...)`
- **THEN** the mock SHALL fail with `PromptCancelled`

### Requirement: Dev demo for multiselect

The dev entry point at `src/dev/tui.ts` SHALL include a `multiselect` sub-command for manually testing multiple selection.

#### Scenario: Run multiselect demo

- **WHEN** a developer runs `pnpm tui multiselect`
- **THEN** the dev entry point SHALL render a multiselect prompt with sample options and print the selections
