## ADDED Requirements

### Requirement: Add Command Basic Invocation

The CLI SHALL provide an `add` sub-command under `skills` that installs skills from a source.

#### Scenario: Add command with GitHub shorthand

- **WHEN** the user runs `axm skills add owner/repo`
- **THEN** the CLI clones the repository, discovers available skills, prompts for selection, and installs selected skills

#### Scenario: Add command with GitHub URL

- **WHEN** the user runs `axm skills add https://github.com/owner/repo`
- **THEN** the CLI clones the repository, discovers available skills, prompts for selection, and installs selected skills

#### Scenario: Add command with local path

- **WHEN** the user runs `axm skills add ./path/to/skills`
- **THEN** the CLI discovers skills from the local path and installs them

### Requirement: GitHub Shorthand Sources

The CLI SHALL support GitHub shorthand notation for specifying skill sources.

#### Scenario: Basic GitHub shorthand

- **WHEN** the source is `owner/repo`
- **THEN** the CLI interprets it as `https://github.com/owner/repo.git` and clones via HTTPS

#### Scenario: GitHub shorthand with subpath

- **WHEN** the source is `owner/repo/path/to/skills`
- **THEN** the CLI clones the repository and scopes skill discovery to the specified path

#### Scenario: GitHub shorthand with skill filter

- **WHEN** the source is `owner/repo@skill-name`
- **THEN** the CLI clones the repository and filters to install only the skill matching `skill-name`

### Requirement: GitHub URL Sources

The CLI SHALL support full GitHub URLs for specifying skill sources.

#### Scenario: GitHub repository URL

- **WHEN** the source is `https://github.com/owner/repo`
- **THEN** the CLI clones the repository from the default branch

#### Scenario: GitHub URL with branch

- **WHEN** the source is `https://github.com/owner/repo/tree/branch-name`
- **THEN** the CLI clones the repository at the specified branch

#### Scenario: GitHub URL with branch and path

- **WHEN** the source is `https://github.com/owner/repo/tree/branch-name/path/to/skills`
- **THEN** the CLI clones the repository at the specified branch and scopes skill discovery to the specified path

#### Scenario: GitHub URL with .git suffix

- **WHEN** the source is `https://github.com/owner/repo.git`
- **THEN** the CLI clones the repository, stripping the `.git` suffix for display purposes

### Requirement: GitLab URL Sources

The CLI SHALL support GitLab URLs for specifying skill sources.

#### Scenario: GitLab repository URL

- **WHEN** the source is `https://gitlab.com/owner/repo`
- **THEN** the CLI clones the GitLab repository from the default branch

#### Scenario: GitLab URL with branch

- **WHEN** the source is `https://gitlab.com/owner/repo/-/tree/branch-name`
- **THEN** the CLI clones the repository at the specified branch

#### Scenario: GitLab URL with branch and path

- **WHEN** the source is `https://gitlab.com/owner/repo/-/tree/branch-name/path/to/skills`
- **THEN** the CLI clones the repository at the specified branch and scopes skill discovery to the specified path

### Requirement: Local Filesystem Sources

The CLI SHALL support local filesystem paths for specifying skill sources.

#### Scenario: Relative path with dot-slash

- **WHEN** the source is `./path/to/skills`
- **THEN** the CLI resolves the path relative to the current working directory and discovers skills without cloning

#### Scenario: Relative path with parent directory

- **WHEN** the source is `../sibling-project/skills`
- **THEN** the CLI resolves the path relative to the current working directory and discovers skills without cloning

#### Scenario: Absolute POSIX path

- **WHEN** the source is `/home/user/skills` or `/Users/name/skills`
- **THEN** the CLI uses the absolute path directly and discovers skills without cloning

#### Scenario: Absolute Windows path

- **WHEN** the source is `C:\Users\name\skills` or `D:\projects\skills`
- **THEN** the CLI uses the absolute path directly and discovers skills without cloning

#### Scenario: Current directory shorthand

- **WHEN** the source is `.` or `..`
- **THEN** the CLI resolves to the current or parent directory respectively

### Requirement: Direct Skill URL Sources

The CLI SHALL support direct URLs to SKILL.md files.

#### Scenario: Direct SKILL.md URL

- **WHEN** the source is a URL ending in `/SKILL.md` (case-insensitive) on a non-GitHub/GitLab host
- **THEN** the CLI fetches the skill file directly via HTTP(S)

#### Scenario: Raw GitHub content URL

- **WHEN** the source is `https://raw.githubusercontent.com/owner/repo/branch/path/SKILL.md`
- **THEN** the CLI fetches the skill file directly

### Requirement: Well-Known URL Sources

The CLI SHALL support well-known URL discovery for skill sources.

#### Scenario: Well-known skills endpoint

- **WHEN** the source is an HTTP(S) URL that is not a git host and does not end in `.git` or `/SKILL.md`
- **THEN** the CLI checks for `/.well-known/skills/index.json` at that host to discover available skills

### Requirement: Git URL Fallback

The CLI SHALL treat unrecognized URLs as direct git URLs.

#### Scenario: SSH git URL

- **WHEN** the source is `git@github.com:owner/repo.git`
- **THEN** the CLI clones using the SSH URL directly

#### Scenario: Generic git URL

- **WHEN** the source is a URL ending in `.git` that doesn't match GitHub or GitLab patterns
- **THEN** the CLI attempts to clone it as a generic git repository

### Requirement: Installation Scope

The CLI SHALL support project-level and global installation scopes.

#### Scenario: Default project-level installation

- **WHEN** the user runs `axm skills add owner/repo` without flags
- **THEN** skills are installed to `.axm/skills/` in the current project

#### Scenario: Global installation with --global flag

- **WHEN** the user runs `axm skills add owner/repo --global`
- **THEN** skills are installed to `~/.axm/skills/` (user home directory)

### Requirement: Agent Selection

The CLI SHALL allow users to select target agents for skill installation.

#### Scenario: Interactive agent selection

- **WHEN** the user runs `axm skills add owner/repo` and multiple agents are detected
- **THEN** the CLI prompts the user to select which agents to install skills for

#### Scenario: Explicit agent selection with --agent flag

- **WHEN** the user runs `axm skills add owner/repo --agent claude-code cursor`
- **THEN** the CLI installs skills only to the specified agents without prompting

#### Scenario: Agent detection

- **WHEN** the CLI starts the add flow
- **THEN** it detects installed agents by checking for their configuration directories

### Requirement: Skill Selection

The CLI SHALL allow users to select which skills to install from a source.

#### Scenario: Interactive skill selection

- **WHEN** the source contains multiple skills
- **THEN** the CLI prompts the user to select which skills to install

#### Scenario: Explicit skill selection with --skill flag

- **WHEN** the user runs `axm skills add owner/repo --skill pr-review commit`
- **THEN** the CLI installs only the specified skills without prompting

#### Scenario: List available skills with --list flag

- **WHEN** the user runs `axm skills add owner/repo --list`
- **THEN** the CLI displays available skills and exits without installing

### Requirement: Installation Method

The CLI SHALL install skills using symlinks by default with copy fallback.

#### Scenario: Symlink installation

- **WHEN** symlinks are supported on the system
- **THEN** skills are copied to canonical `.axm/skills/<name>/` and symlinks are created in each agent's skills directory

#### Scenario: Copy fallback

- **WHEN** symlink creation fails
- **THEN** the CLI falls back to copying skill files directly to each agent's directory

### Requirement: Non-Interactive Mode

The CLI SHALL support non-interactive operation for automation.

#### Scenario: Skip prompts with --yes flag

- **WHEN** the user runs `axm skills add owner/repo --yes`
- **THEN** the CLI uses default selections without interactive prompts

#### Scenario: Install all with --all flag

- **WHEN** the user runs `axm skills add owner/repo --all`
- **THEN** the CLI installs all discovered skills to all detected agents without prompts

### Requirement: Settings Persistence

The CLI SHALL persist user preferences and installed skill metadata.

#### Scenario: Settings file creation

- **WHEN** skills are installed for the first time
- **THEN** the CLI creates `.axm/settings.json` with target agents and preferences

#### Scenario: Remember last selected agents

- **WHEN** the user selects agents during installation
- **THEN** the selection is saved and offered as default for subsequent installations

### Requirement: Lockfile Management

The CLI SHALL maintain a lockfile tracking installed skill versions.

#### Scenario: Lockfile creation

- **WHEN** skills are installed
- **THEN** the CLI creates or updates `.axm/axm.lock` with skill source, hash, and timestamps

#### Scenario: Lockfile format

- **WHEN** viewing the lockfile
- **THEN** it is in YAML format with skill entries containing source, sourceType, sourceUrl, hash, installedAt, and updatedAt

### Requirement: Error Handling

The CLI SHALL provide clear error messages for common failure scenarios.

#### Scenario: Invalid source

- **WHEN** the source cannot be parsed or accessed
- **THEN** the CLI displays a descriptive error message and exits with non-zero status

#### Scenario: No skills found

- **WHEN** no SKILL.md files are discovered in the source
- **THEN** the CLI displays a message indicating no skills were found

#### Scenario: No agents detected

- **WHEN** no supported agents are detected on the system
- **THEN** the CLI displays a message and suggests using --agent to specify agents manually
