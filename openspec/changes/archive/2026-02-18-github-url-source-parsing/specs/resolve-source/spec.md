## ADDED Requirements

### Requirement: resolveSkillInstallSource handles URL inputs

`resolveSkillInstallSource` SHALL resolve `url-input` patterns via a `resolveSkillUrl` function that matches the URL hostname against configured + built-in sources, identical to `routeUrlInput` behavior.

#### Scenario: GitHub HTTPS URL resolves to GitHubSource

- **WHEN** `resolveSkillInstallSource` receives input `https://github.com/vercel-labs/agent-skills`
- **AND** built-in default config `{ name: "github", type: "github", url: "https://github.com" }` is present
- **THEN** the result is a `GitHubSource` with `owner: "vercel-labs"`, `repo: "agent-skills"`, `url: URL("https://github.com")`

#### Scenario: GitLab HTTPS URL resolves to GitLabSource

- **WHEN** `resolveSkillInstallSource` receives input `https://gitlab.com/team/skills`
- **AND** built-in default config for gitlab.com is present
- **THEN** the result is a `GitLabSource` with `owner: "team"`, `repo: "skills"`, `url: URL("https://gitlab.com")`

#### Scenario: Custom GitHub Enterprise URL resolves via configured source

- **WHEN** `resolveSkillInstallSource` receives input `https://ghe.corp.com/team/repo`
- **AND** workspace has config `{ name: "ghe", type: "github", url: "https://ghe.corp.com" }`
- **THEN** the result is a `GitHubSource` with `owner: "team"`, `repo: "repo"`, `url: URL("https://ghe.corp.com")`

#### Scenario: URL with no matching source fails

- **WHEN** `resolveSkillInstallSource` receives input `https://unknown-host.com/owner/repo`
- **AND** no configured or built-in source matches the hostname
- **THEN** the result is a `CliError` with code `SOURCE_PARSE_FAILED`
