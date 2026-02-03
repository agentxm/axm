## ADDED Requirements

### Requirement: Input Syntax - Bitbucket Explicit Source

The resolution module SHALL recognize Bitbucket explicit source prefixes.

#### Scenario: Bitbucket explicit source

- **WHEN** the input is `bitbucket:wayne-industries/skills`
- **THEN** the module resolves via Bitbucket without checking other sources

#### Scenario: Bitbucket explicit source with path

- **WHEN** the input is `bitbucket:wayne-industries/mono/skills/grappling-hook`
- **THEN** the module resolves with `path` set to `skills/grappling-hook`

#### Scenario: Bitbucket explicit source with ref

- **WHEN** the input is `bitbucket:wayne-industries/skills@v1.0.0`
- **THEN** the module resolves with `ref` set to `v1.0.0`

### Requirement: Input Syntax - Bitbucket URL

The resolution module SHALL recognize Bitbucket URLs.

#### Scenario: Bitbucket HTTPS URL

- **WHEN** the input is `https://bitbucket.org/owner/repo`
- **THEN** the module normalizes to `bitbucket:owner/repo` and resolves via Bitbucket

#### Scenario: Bitbucket URL with branch and path

- **WHEN** the input is `https://bitbucket.org/owner/repo/src/main/skills`
- **THEN** the module resolves with `ref: "main"` and `path: "skills"`

#### Scenario: Bitbucket SSH URL

- **WHEN** the input is `git@bitbucket.org:owner/repo.git`
- **THEN** the module normalizes to `bitbucket:owner/repo` and resolves via Bitbucket

## MODIFIED Requirements

### Requirement: Input Syntax - Ambiguous Pattern

The resolution module SHALL check bare `owner/repo` patterns against git hosting platforms in popularity order.

#### Scenario: Ambiguous pattern found on GitHub

- **WHEN** the input is `owner/repo` and the repository exists on GitHub
- **THEN** the module returns a GitHub `ExtensionRef`

#### Scenario: Ambiguous pattern found on GitLab

- **WHEN** the input is `owner/repo` and the repository exists only on GitLab (not GitHub)
- **THEN** the module returns a GitLab `ExtensionRef`

#### Scenario: Ambiguous pattern found on Bitbucket

- **WHEN** the input is `owner/repo` and the repository exists only on Bitbucket (not GitHub or GitLab)
- **THEN** the module returns a Bitbucket `ExtensionRef`

#### Scenario: Ambiguous pattern found on multiple platforms

- **WHEN** the input is `owner/repo` and the repository exists on both GitHub and GitLab
- **THEN** the module returns multiple `ExtensionRef` entries for user selection

#### Scenario: Ambiguous pattern not found

- **WHEN** the input is `owner/repo` and the repository does not exist on any platform
- **THEN** the module returns an empty array

## REMOVED Requirements

### Requirement: Input Syntax - Local Path

**Reason**: Local sources are removed. Development workflows will use different mechanisms.

**Migration**: Use git sources to reference extensions from repositories.

### Requirement: Path Resolution

**Reason**: Local path scanning is removed with local source support.

**Migration**: Extensions are discovered from git sources, not local filesystem paths.
