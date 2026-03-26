## ADDED Requirements

### Requirement: prompts command group exists

The CLI spike SHALL expose a `prompts` subcommand group under the root command that aggregates all interactive prompt demo subcommands.

#### Scenario: help lists all prompt subcommands

- **WHEN** user runs `axm-spike prompts --help`
- **THEN** the output SHALL list all 10 prompt subcommands: text, password, confirm, path, select, multiselect, group-multiselect, select-key, autocomplete, autocomplete-multiselect

### Requirement: text prompt demo

The `prompts text` subcommand SHALL invoke `CliPrompt.text()` with flags that map to `TextOpts` configuration options.

#### Scenario: text with placeholder flag

- **WHEN** user runs `axm-spike prompts text --placeholder "Enter name"`
- **THEN** the text prompt SHALL display with "Enter name" as ghost text

#### Scenario: text with default in non-interactive mode

- **WHEN** user runs `axm-spike prompts text --non-interactive --default "hello"`
- **THEN** the command SHALL succeed with exit code 0 and use "hello" as the value

#### Scenario: text without default in non-interactive mode

- **WHEN** user runs `axm-spike prompts text --non-interactive`
- **THEN** the command SHALL fail with a non-zero exit code and an error indicating no default was provided

#### Scenario: text with initial value

- **WHEN** user runs `axm-spike prompts text --initial "draft"`
- **THEN** the text prompt SHALL pre-fill the input with "draft"

#### Scenario: text with validate flag

- **WHEN** user runs `axm-spike prompts text --validate`
- **THEN** the text prompt SHALL enable a sample length validator

### Requirement: password prompt demo

The `prompts password` subcommand SHALL invoke `CliPrompt.password()` with flags that map to `PasswordOpts` configuration options.

#### Scenario: password with mask character

- **WHEN** user runs `axm-spike prompts password --mask "*"`
- **THEN** the password prompt SHALL display input masked with `*` characters

#### Scenario: password without mask

- **WHEN** user runs `axm-spike prompts password`
- **THEN** the password prompt SHALL display input as invisible (no mask character)

### Requirement: confirm prompt demo

The `prompts confirm` subcommand SHALL invoke `CliPrompt.confirm()` with flags that map to `ConfirmOpts` configuration options. The command SHALL provide a hardcoded `initialValue` so that `--non-interactive` has a value to return.

#### Scenario: confirm with custom labels

- **WHEN** user runs `axm-spike prompts confirm --active "Yep" --inactive "Nope"`
- **THEN** the confirm prompt SHALL display "Yep" and "Nope" as the choice labels

#### Scenario: confirm with initial selection

- **WHEN** user runs `axm-spike prompts confirm --initial`
- **THEN** the confirm prompt SHALL pre-select the affirmative option

#### Scenario: confirm with vertical layout

- **WHEN** user runs `axm-spike prompts confirm --vertical`
- **THEN** the confirm prompt SHALL stack choices vertically

#### Scenario: confirm in non-interactive mode

- **WHEN** user runs `axm-spike prompts confirm --non-interactive`
- **THEN** the command SHALL succeed with exit code 0 using the hardcoded initial value

### Requirement: path prompt demo

The `prompts path` subcommand SHALL invoke `CliPrompt.path()` with flags that map to `PathOpts` configuration options.

#### Scenario: path with root constraint

- **WHEN** user runs `axm-spike prompts path --root "/tmp"`
- **THEN** the path prompt SHALL constrain filesystem browsing to the `/tmp` directory

#### Scenario: path restricted to directories

- **WHEN** user runs `axm-spike prompts path --directory`
- **THEN** the path prompt SHALL only allow directory selection

#### Scenario: path with initial value

- **WHEN** user runs `axm-spike prompts path --initial "./src"`
- **THEN** the path prompt SHALL pre-fill with `./src`

### Requirement: select prompt demo

The `prompts select` subcommand SHALL invoke `CliPrompt.select()` with flags that map to `SelectOpts` configuration options. The command SHALL use sample color options and provide a hardcoded `initialValue` so that `--non-interactive` has a value to return.

#### Scenario: select with max items

- **WHEN** user runs `axm-spike prompts select --max-items 3`
- **THEN** the select prompt SHALL display at most 3 visible options before scrolling

#### Scenario: select with initial value

- **WHEN** user runs `axm-spike prompts select --initial "blue"`
- **THEN** the select prompt SHALL pre-select the "blue" option

#### Scenario: select in non-interactive mode

- **WHEN** user runs `axm-spike prompts select --non-interactive`
- **THEN** the command SHALL succeed with exit code 0 using the hardcoded initial value

### Requirement: multiselect prompt demo

The `prompts multiselect` subcommand SHALL invoke `CliPrompt.multiselect()` with flags that map to `MultiselectOpts` configuration options. The command SHALL use sample fruit options.

#### Scenario: multiselect with required flag

- **WHEN** user runs `axm-spike prompts multiselect --required`
- **THEN** the multiselect prompt SHALL enforce at least one selection before allowing submission

#### Scenario: multiselect with max items

- **WHEN** user runs `axm-spike prompts multiselect --max-items 4`
- **THEN** the multiselect prompt SHALL display at most 4 visible options before scrolling

#### Scenario: multiselect with cursor position

- **WHEN** user runs `axm-spike prompts multiselect --cursor-at "banana"`
- **THEN** the multiselect prompt SHALL start with the cursor on the "banana" option

### Requirement: group-multiselect prompt demo

The `prompts group-multiselect` subcommand SHALL invoke `CliPrompt.groupMultiselect()` with flags that map to `GroupMultiselectOpts` configuration options. The command SHALL use sample grouped permission options.

#### Scenario: group-multiselect with selectable groups

- **WHEN** user runs `axm-spike prompts group-multiselect --selectable-groups`
- **THEN** the prompt SHALL allow toggling entire groups at once

#### Scenario: group-multiselect with group spacing

- **WHEN** user runs `axm-spike prompts group-multiselect --group-spacing 2`
- **THEN** the prompt SHALL display a vertical gap of 2 between groups

#### Scenario: group-multiselect with required flag

- **WHEN** user runs `axm-spike prompts group-multiselect --required`
- **THEN** the prompt SHALL enforce at least one selection

### Requirement: select-key prompt demo

The `prompts select-key` subcommand SHALL invoke `CliPrompt.selectKey()` with flags that map to `SelectKeyOpts` configuration options. The command SHALL use sample action options (e.g., [d]elete, [r]ename, [c]opy).

#### Scenario: select-key with case sensitivity

- **WHEN** user runs `axm-spike prompts select-key --case-sensitive`
- **THEN** the prompt SHALL distinguish between upper and lower case key presses

#### Scenario: select-key default behavior

- **WHEN** user runs `axm-spike prompts select-key`
- **THEN** the prompt SHALL accept a single key press and return the corresponding action

### Requirement: autocomplete prompt demo

The `prompts autocomplete` subcommand SHALL invoke `CliPrompt.autocomplete()` with flags that map to `AutocompleteOpts` configuration options. The command SHALL use sample timezone options.

#### Scenario: autocomplete with max items

- **WHEN** user runs `axm-spike prompts autocomplete --max-items 5`
- **THEN** the autocomplete prompt SHALL display at most 5 visible results while filtering

#### Scenario: autocomplete with placeholder

- **WHEN** user runs `axm-spike prompts autocomplete --placeholder "Search timezones..."`
- **THEN** the prompt SHALL display "Search timezones..." as hint text

#### Scenario: autocomplete with initial input

- **WHEN** user runs `axm-spike prompts autocomplete --initial-input "America"`
- **THEN** the prompt SHALL pre-fill the search query with "America"

### Requirement: autocomplete-multiselect prompt demo

The `prompts autocomplete-multiselect` subcommand SHALL invoke `CliPrompt.autocompleteMultiselect()` with flags that map to `AutocompleteMultiselectOpts` configuration options. The command SHALL use sample package dependency options.

#### Scenario: autocomplete-multiselect with max items

- **WHEN** user runs `axm-spike prompts autocomplete-multiselect --max-items 5`
- **THEN** the prompt SHALL display at most 5 visible results while filtering

#### Scenario: autocomplete-multiselect with required flag

- **WHEN** user runs `axm-spike prompts autocomplete-multiselect --required`
- **THEN** the prompt SHALL enforce at least one selection

### Requirement: prompt demo flags map to service options

Every per-command flag on a prompt subcommand SHALL map directly to a configuration option on the corresponding `CliPrompt` method. No simulation knobs or content override flags SHALL be present.

#### Scenario: no simulation flags exist

- **WHEN** user inspects the flags of any prompt subcommand via `--help`
- **THEN** every listed flag SHALL correspond to a parameter on the underlying `CliPrompt` method

### Requirement: prompt demo help text follows conventions

Each prompt subcommand SHALL have a single-line imperative description via `Command.withDescription()`. Flag documentation SHALL live on each flag's `Flag.withDescription()`.

#### Scenario: help text is single-line

- **WHEN** user runs `axm-spike prompts text --help`
- **THEN** the command description SHALL be a single-line imperative sentence
- **THEN** each flag SHALL have its own description in the flags section
