## ADDED Requirements

### Requirement: Install accepts local file path input

The install handler SHALL accept file path inputs (`./path`, `../path`, `/absolute/path`, `~/path`) as a valid source for skill installation. When a `file-path-pattern` input is provided, the handler SHALL resolve it to a `LocalSource` via `parseLocalPath()` and proceed with the standard discovery, selection, and install flow.

#### Scenario: Install skill from relative path

- **WHEN** a user runs `axm skills install ./my-skills`
- **THEN** the handler SHALL resolve `./my-skills` as a local source, discover skills in that directory, and install them

#### Scenario: Install skill from absolute path

- **WHEN** a user runs `axm skills install /home/user/skills`
- **THEN** the handler SHALL resolve `/home/user/skills` as a local source and install discovered skills

#### Scenario: Install skill from parent-relative path

- **WHEN** a user runs `axm skills install ../shared-skills`
- **THEN** the handler SHALL resolve `../shared-skills` as a local source and install discovered skills

#### Scenario: Install skill from home-relative path

- **WHEN** a user runs `axm skills install ~/my-skills`
- **THEN** the handler SHALL resolve `~/my-skills` as a local source and install discovered skills

### Requirement: Local install persists path as source string

The install handler SHALL persist the original path string as the settings entry via `ws.setSkill()` for locally installed skills.

#### Scenario: Local install writes path to settings

- **WHEN** a skill named `my-tool` is installed from `./my-skills`
- **THEN** `ws.setSkill()` SHALL write the entry with the local path as the source string
