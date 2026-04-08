# Capability: CLI Spike Custom Prompts

## Purpose

Custom prompt module for CLI spike providing `selectKey`, `groupMultiselect`, and `autocompleteMultiselect` prompts built on the Effect v4 `Prompt` render-loop pattern.

## Requirements

### Requirement: AxmPrompt namespace exports custom prompt constructors and helpers

The `@axm.sh/core/unstable/cli/prompt` module SHALL export an `AxmPrompt` namespace containing custom prompt constructors (`selectKey`, `groupMultiselect`, `autocompleteMultiselect`) and prompt helpers (`unless`, `autoConfirm`).

#### Scenario: Import and use AxmPrompt namespace

- **WHEN** a consumer imports `AxmPrompt` from `@axm.sh/core/unstable/cli/prompt`
- **THEN** `AxmPrompt.selectKey`, `AxmPrompt.groupMultiselect`, `AxmPrompt.autocompleteMultiselect`, `AxmPrompt.unless`, and `AxmPrompt.autoConfirm` SHALL be available

### Requirement: selectKey returns a Prompt that resolves on single keypress

`AxmPrompt.selectKey` SHALL accept a `SelectKeyOptions<A>` object with `message` (string), `choices` (array of `SelectKeyChoice<A>` with `key`, `title`, `value`, and optional `description`), and optional `caseSensitive` (boolean, default false). It SHALL return a `Prompt<A>`.

#### Scenario: User presses a matching key

- **WHEN** the user presses a key that matches a choice's `key` field
- **THEN** the prompt SHALL submit with that choice's `value`

#### Scenario: User presses a non-matching key

- **WHEN** the user presses a key that does not match any choice
- **THEN** the prompt SHALL display an error message and wait for another keypress

#### Scenario: Case-insensitive matching (default)

- **WHEN** `caseSensitive` is not set or is false
- **AND** the user presses an uppercase key that matches a lowercase choice key
- **THEN** the prompt SHALL treat it as a match

#### Scenario: Case-sensitive matching

- **WHEN** `caseSensitive` is true
- **AND** the user presses an uppercase key that matches a lowercase choice key
- **THEN** the prompt SHALL treat it as a non-match and display an error

### Requirement: groupMultiselect returns a Prompt for grouped multi-selection

`AxmPrompt.groupMultiselect` SHALL accept a `GroupMultiselectOptions<A>` object with `message` (string), `groups` (array of `GroupMultiselectGroup<A>` with `label`, `choices`, and optional `selectableHeader`), and optional `maxPerPage`, `min`, `max`, and `validate`. It SHALL return a `Prompt<ReadonlyArray<A>>`.

#### Scenario: User toggles individual choices

- **WHEN** the user navigates to a choice with arrow keys and presses Space
- **THEN** the choice SHALL toggle between selected and unselected

#### Scenario: User submits selections

- **WHEN** the user presses Enter
- **THEN** the prompt SHALL submit with an array of all selected choice values

#### Scenario: Selectable group header toggles all children

- **WHEN** a group has `selectableHeader: true`
- **AND** the user navigates to the group header and presses Space
- **THEN** all choices in that group SHALL toggle (all selected if any were unselected, all unselected if all were selected)

#### Scenario: Minimum selection validation

- **WHEN** `min` is set
- **AND** the user presses Enter with fewer than `min` selections
- **THEN** the prompt SHALL display a validation error and not submit

#### Scenario: Maximum selection validation

- **WHEN** `max` is set
- **AND** the user attempts to select more than `max` choices
- **THEN** the prompt SHALL prevent additional selections or display a validation error

### Requirement: autocompleteMultiselect returns a Prompt for searchable multi-selection

`AxmPrompt.autocompleteMultiselect` SHALL accept an `AutocompleteMultiselectOptions<A>` object with `message` (string), `choices` (array of `SelectChoice<A>`), and optional `maxPerPage`, `min`, `max`, `filterLabel`, `filterPlaceholder`, `emptyMessage`, and `validate`. It SHALL return a `Prompt<ReadonlyArray<A>>`.

#### Scenario: Typing filters the visible choices

- **WHEN** the user types characters
- **THEN** the visible choice list SHALL filter to show only choices whose title matches the typed query

#### Scenario: Selections persist across filter changes

- **WHEN** the user selects a choice, then changes the filter query so that choice is no longer visible
- **THEN** the previously selected choice SHALL remain selected

#### Scenario: Submit returns all selected choices

- **WHEN** the user presses Enter
- **THEN** the prompt SHALL submit with all selected choice values, including those not currently visible due to filtering

#### Scenario: Empty filter results

- **WHEN** the user types a query that matches no choices
- **THEN** the prompt SHALL display the `emptyMessage` (default: "No matches")

### Requirement: All custom prompts return Prompt and compose with native prompts

Every constructor in the `AxmPrompt` namespace SHALL return a `Prompt<A>` that is compatible with `Prompt.all`, `Prompt.map`, `Prompt.flatMap`, and `yield*` in `Effect.gen`.

#### Scenario: Custom prompt in Prompt.all

- **WHEN** an `AxmPrompt.selectKey` prompt is passed as a member of `Prompt.all({ ... })`
- **THEN** it SHALL execute in sequence with other prompts and its result SHALL appear in the combined output

#### Scenario: Custom prompt with Prompt.flatMap

- **WHEN** an `AxmPrompt.selectKey` prompt is piped to `Prompt.flatMap`
- **THEN** the follow-up prompt SHALL receive the selectKey result and execute after it

#### Scenario: Custom prompt with yield\*

- **WHEN** a custom prompt is used with `yield*` inside `Effect.gen`
- **THEN** it SHALL resolve to the prompt's output value

### Requirement: unless skips a prompt when a flag value is provided

`AxmPrompt.unless` SHALL be a dual(2) function that accepts a `Prompt<A>` as self and an `Option<A>` as the flag value. When the Option is Some, it SHALL return `Effect.succeed` with the value. When the Option is None, it SHALL return the prompt.

#### Scenario: Flag value is present (Option.some)

- **WHEN** `AxmPrompt.unless` is called with `Option.some(value)`
- **THEN** the prompt SHALL be skipped and the value SHALL be returned directly

#### Scenario: Flag value is absent (Option.none)

- **WHEN** `AxmPrompt.unless` is called with `Option.none()`
- **THEN** the prompt SHALL execute and its result SHALL be returned

#### Scenario: Pipe style usage

- **WHEN** a prompt is piped to `AxmPrompt.unless(someOption)`
- **THEN** it SHALL behave identically to the data-first call `AxmPrompt.unless(prompt, someOption)`

### Requirement: autoConfirm skips a confirm prompt when yes flag is true

`AxmPrompt.autoConfirm` SHALL be a dual(2) function that accepts a `Prompt<boolean>` as self and a `boolean` as the yes flag. When yes is true, it SHALL return `Effect.succeed(true)`. When yes is false, it SHALL return the prompt.

#### Scenario: Yes flag is true

- **WHEN** `AxmPrompt.autoConfirm` is called with `yes: true`
- **THEN** the confirm prompt SHALL be skipped and `true` SHALL be returned

#### Scenario: Yes flag is false

- **WHEN** `AxmPrompt.autoConfirm` is called with `yes: false`
- **THEN** the confirm prompt SHALL execute and its result SHALL be returned

#### Scenario: Pipe style usage

- **WHEN** a confirm prompt is piped to `AxmPrompt.autoConfirm(true)`
- **THEN** it SHALL behave identically to the data-first call `AxmPrompt.autoConfirm(prompt, true)`
