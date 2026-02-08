## ADDED Requirements

### Requirement: Confirm prompt collects yes/no boolean

The Confirm service SHALL be a self-contained module under `src/tui/confirm/` with its own Effect service tag, live layer, types (`ConfirmConfig`), Ink component, and test layer factory. It SHALL provide a `prompt` method that renders a yes/no prompt. It accepts a config with `message` (required) and optional `initialValue` (defaults to `true`). It returns `Effect<boolean, PromptError | PromptCancelled>`.

#### Scenario: Confirm defaults to yes

- **WHEN** a handler calls `confirm.prompt({ message: "Continue?" })`
- **THEN** the prompt SHALL render with "Continue?" and the default selection on "yes"
- **WHEN** the user presses Enter without changing
- **THEN** the effect SHALL succeed with `true`

#### Scenario: Confirm with initial value false

- **WHEN** a handler calls `confirm.prompt({ message: "Delete?", initialValue: false })`
- **THEN** the default selection SHALL be on "no"
- **WHEN** the user presses Enter without changing
- **THEN** the effect SHALL succeed with `false`

#### Scenario: User selects no

- **WHEN** the user navigates to "no" and presses Enter
- **THEN** the effect SHALL succeed with `false`

#### Scenario: Confirm cancelled

- **WHEN** the user presses Escape or Ctrl+C during confirmation
- **THEN** the effect SHALL fail with `PromptCancelled`

### Requirement: Confirm has a test layer

The test layer factory SHALL return a `[Layer, MockConfirmService]` tuple. The mock SHALL support configurable behavior: return a boolean, or simulate cancellation.

#### Scenario: Mock returns configured value

- **WHEN** a test creates a confirm test layer with `{ value: true }`
- **AND** a handler calls `confirm.prompt(...)`
- **THEN** the mock SHALL return `true` without rendering any UI

#### Scenario: Mock simulates cancellation

- **WHEN** a test creates a confirm test layer with `{ type: "cancel" }`
- **AND** a handler calls `confirm.prompt(...)`
- **THEN** the mock SHALL fail with `PromptCancelled`

### Requirement: Dev demo for confirm

The dev entry point at `src/dev/tui.ts` SHALL include a `confirm` sub-command for manually testing confirmation prompts.

#### Scenario: Run confirm demo

- **WHEN** a developer runs `pnpm tui confirm`
- **THEN** the dev entry point SHALL render a confirm prompt and print the boolean result
