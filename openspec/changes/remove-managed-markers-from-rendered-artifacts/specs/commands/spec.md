## MODIFIED Requirements

### Requirement: Managed-file header

Rendered command files SHALL contain only the agent-native content produced from `COMMAND.md` frontmatter and body. AXM SHALL NOT prepend managed headers or ownership markers to Markdown, TOML, or plain-text command outputs.

#### Scenario: Markdown rendered file has no managed header

- **WHEN** a command is rendered for Claude Code
- **THEN** the rendered file SHALL begin with the Markdown content generated from the command source
- **AND** SHALL NOT begin with `<!-- Managed by axm — see "axm commands --help" -->`

#### Scenario: TOML rendered file has no managed header

- **WHEN** a command is rendered for Gemini CLI
- **THEN** the rendered file SHALL begin with TOML content
- **AND** SHALL NOT begin with `# Managed by axm — see "axm commands --help"`

#### Scenario: Sync overwrites classifier-managed files without a header check

- **WHEN** a command is installed or synced for an extension that the workspace classifier manages
- **THEN** AXM SHALL overwrite the render target with the latest rendered content
- **AND** SHALL NOT require a managed header in the existing file first

### Requirement: Install conflict detection

When rendering a command file, AXM SHALL NOT inspect target file contents for an AXM-managed header before writing. Command sync behavior is determined by classifier-managed extension state rather than content markers.

#### Scenario: No existing file

- **WHEN** the render target path has no existing file
- **THEN** the adapter SHALL render and write the command file normally

#### Scenario: Existing file is overwritten without header parsing

- **WHEN** the render target path already exists for a classifier-managed command
- **THEN** the adapter SHALL render and overwrite the file
- **AND** SHALL NOT parse the existing contents for a managed header

#### Scenario: Force is not required to replace a headerless managed target

- **WHEN** the render target path has an existing file without an AXM-managed header
- **AND** the command is being synced as a classifier-managed extension
- **THEN** the adapter SHALL overwrite the file without requiring `--force`
