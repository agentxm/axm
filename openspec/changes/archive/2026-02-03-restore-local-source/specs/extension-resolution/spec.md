## ADDED Requirements

### Requirement: Input Syntax - Home Directory Path

The resolution module SHALL recognize home directory paths starting with `~` and expand them to the user's home directory.

#### Scenario: Home directory path with tilde

- **WHEN** the input is `~/skills/my-skill`
- **THEN** the module expands `~` to the user's home directory and resolves as a local path

#### Scenario: Home directory path on Windows

- **WHEN** the input is `~\skills\my-skill` on Windows
- **THEN** the module expands `~` to the user's home directory and resolves as a local path
