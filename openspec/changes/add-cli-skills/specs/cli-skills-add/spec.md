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

#### Scenario: GitHub shorthand with git ref

- **WHEN** the source is `owner/repo@ref` where ref is a tag, branch, or commit SHA
- **THEN** the CLI clones the repository at the specified ref

Unit tests SHALL verify:
- Basic shorthand parsing (`owner/repo` -> `https://github.com/owner/repo.git`)
- Shorthand with subpath extraction
- Shorthand with git ref extraction
- Invalid shorthand rejection (e.g., `owner` alone, `owner/repo/too/many/parts@ref@ref`)

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

Unit tests SHALL verify:
- GitHub URL parsing (with and without `.git` suffix)
- Branch extraction from `/tree/branch-name` URLs
- Path extraction from URLs with branch and path
- Invalid GitHub URL rejection

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

Unit tests SHALL verify:
- Detection of local paths (starts with `./`, `../`, `/`, or Windows drive letter)
- Path resolution relative to working directory
- Distinction between local paths and GitHub shorthand (e.g., `./owner/repo` is local, `owner/repo` is GitHub)

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

Unit tests SHALL verify:
- Symlink target path is relative (for portability)
- Copy fallback triggers on symlink error
- Installed skill is readable from agent directory (either via symlink or copy)

### Requirement: Non-Interactive Mode

The CLI SHALL support non-interactive operation for automation.

#### Scenario: Skip prompts with --yes flag

- **WHEN** the user runs `axm skills add owner/repo --yes`
- **THEN** the CLI uses default selections without interactive prompts

#### Scenario: Install all with --all flag

- **WHEN** the user runs `axm skills add owner/repo --all`
- **THEN** the CLI installs all discovered skills to all detected agents without prompts

### Requirement: Settings Persistence

The CLI SHALL persist user preferences and installed skills in `.axm/settings.json`.

#### Scenario: Settings file creation

- **WHEN** skills are installed for the first time
- **THEN** the CLI creates `.axm/settings.json` with target agents, preferences, and installed skills

#### Scenario: Remember last selected agents

- **WHEN** the user selects agents during installation
- **THEN** the selection is saved and offered as default for subsequent installations

#### Scenario: Track installed skills in settings

- **WHEN** a skill is installed
- **THEN** the CLI records the skill name, canonical source, and target agents in `settings.json`

#### Scenario: Settings file format

- **WHEN** viewing the settings file
- **THEN** it is in JSON format with `version`, `agents`, and `skills` (mapping skill names to canonical source and agents)

#### Scenario: Canonical source notation in settings

- **WHEN** a skill is installed from any supported input format
- **THEN** the source is stored in canonical prefix notation (e.g., `github:owner/repo`, `gitlab:owner/repo`, `local:./path`)

Unit tests SHALL verify:
- JSON serialization/deserialization round-trip
- Settings schema validation
- Merge behavior (new skills added, existing preserved)
- Default values for missing fields

### Requirement: Lockfile Management

The CLI SHALL maintain a lockfile tracking resolved versions for reproducibility.

#### Scenario: Lockfile creation

- **WHEN** skills are installed
- **THEN** the CLI creates or updates `.axm/axm.lock` with resolved version metadata

#### Scenario: Lockfile format

- **WHEN** viewing the lockfile
- **THEN** it is in YAML format with skill entries containing source (canonical notation), skillPath, commitSha, contentHash, installedAt, and updatedAt

#### Scenario: Canonical source notation in lockfile

- **WHEN** a skill is recorded in the lockfile
- **THEN** the source uses canonical prefix notation (e.g., `github:owner/repo`) which encodes the source type

#### Scenario: Lockfile excludes user preferences

- **WHEN** comparing settings.json and axm.lock
- **THEN** the lockfile contains only version resolution data, not user preferences or agent selections

Unit tests SHALL verify:
- YAML serialization/deserialization round-trip
- Lockfile schema validation
- Partial updates (adding skills without losing existing entries)
- Timestamp formatting (ISO 8601)

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

### Requirement: Git Ref Version Pinning

The CLI SHALL support pinning to specific git refs (tags, branches, commit SHAs) for reproducible installations.

#### Scenario: Pin to semantic version tag

- **WHEN** the source is `owner/repo@v1.2.0`
- **THEN** the CLI clones the repository at the `v1.2.0` tag

#### Scenario: Pin to branch name

- **WHEN** the source is `owner/repo@main` or `owner/repo@feature-branch`
- **THEN** the CLI clones the repository at the specified branch

#### Scenario: Pin to commit SHA

- **WHEN** the source is `owner/repo@abc123def` (partial or full SHA)
- **THEN** the CLI clones the repository at the specified commit

#### Scenario: Pin with subpath

- **WHEN** the source is `owner/repo/path/to/skills@v1.0.0`
- **THEN** the CLI clones at the specified ref and scopes discovery to the path

#### Scenario: GitHub URL with ref

- **WHEN** the source is `https://github.com/owner/repo@v1.0.0`
- **THEN** the CLI clones the repository at the specified ref

#### Scenario: Lockfile records resolved ref

- **WHEN** a skill is installed from a ref
- **THEN** the lockfile records the resolved commit SHA (not the ref name) for reproducibility

Unit tests SHALL verify:
- Parsing of various ref formats (tags, branches, SHAs, partial SHAs)
- Ref extraction from shorthand and URL sources
- Lockfile correctly stores resolved commit SHA

### Requirement: Private Repository Authentication

The CLI SHALL support authentication for private repositories.

#### Scenario: SSH URL for private repos

- **WHEN** the source is `git@github.com:owner/private-repo.git`
- **THEN** the CLI clones using SSH authentication

#### Scenario: SSH passphrase prompt

- **WHEN** cloning via SSH requires a passphrase
- **THEN** the CLI allows the passphrase prompt to display and accepts user input (stdio inherited)

#### Scenario: HTTPS with credential helper

- **WHEN** cloning via HTTPS and git credential helper is configured
- **THEN** the CLI allows git to use the configured credential helper

#### Scenario: Private repo clone failure

- **WHEN** authentication fails for a private repository
- **THEN** the CLI displays a clear error suggesting SSH URL or credential configuration

#### Scenario: Local content hashing for private repos

- **WHEN** computing the lockfile hash for any repository
- **THEN** the CLI computes the hash locally from cloned content (not via GitHub API)

Unit tests SHALL verify:
- SSH URL parsing and detection
- Error message generation for auth failures
- Local hash computation produces consistent results

### Requirement: Cross-Platform Path Handling

The CLI SHALL handle filesystem paths correctly on all supported platforms (macOS, Linux, Windows).

#### Scenario: Path construction uses platform APIs

- **WHEN** constructing file paths internally
- **THEN** the CLI uses `path.join()`, `path.resolve()`, and `path.relative()` instead of string concatenation

#### Scenario: Symlink paths are relative

- **WHEN** creating symlinks from agent directories to canonical skills
- **THEN** the CLI uses relative paths computed via `path.relative()` for portability

#### Scenario: Windows path separators

- **WHEN** running on Windows
- **THEN** the CLI handles backslash separators in user-provided paths and normalizes internally

#### Scenario: Path comparison is normalized

- **WHEN** comparing paths (e.g., checking if a skill is already installed)
- **THEN** the CLI normalizes paths before comparison to handle separator differences

Unit tests SHALL verify:
- Path joining produces correct results on the test platform
- Relative path computation for symlinks
- Path normalization for comparison
- Windows-style paths are accepted as input (can mock `path.win32` for cross-platform testing)

### Requirement: Canonical Source Notation

The CLI SHALL normalize all source inputs to a canonical prefix notation for storage.

#### Scenario: GitHub shorthand normalized

- **WHEN** the user provides `owner/repo` as input
- **THEN** it is stored as `github:owner/repo`

#### Scenario: GitHub URL normalized

- **WHEN** the user provides `https://github.com/owner/repo` or `git@github.com:owner/repo.git`
- **THEN** it is stored as `github:owner/repo`

#### Scenario: GitLab URL normalized

- **WHEN** the user provides `https://gitlab.com/owner/repo`
- **THEN** it is stored as `gitlab:owner/repo`

#### Scenario: Local path stored as-is

- **WHEN** the user provides `./path/to/skills` or `/absolute/path`
- **THEN** it is stored as `./path/to/skills` or `/absolute/path` (no prefix needed, already unambiguous)

#### Scenario: Direct URL stored as-is

- **WHEN** the user provides `https://example.com/skill.md`
- **THEN** it is stored as `https://example.com/skill.md` (no prefix needed, already unambiguous)

#### Scenario: Git ref preserved in canonical form

- **WHEN** the user provides `owner/repo@v1.0.0`
- **THEN** it is stored as `github:owner/repo@v1.0.0`

Unit tests SHALL verify:
- Normalization from liberal input to canonical form
- Shorthand sources get appropriate prefix (github:, gitlab:)
- URLs and local paths stored without prefix
- Round-trip: canonical form -> fetch URL reconstruction

### Requirement: Source Metadata Preservation

The CLI SHALL preserve source metadata to enable future update operations.

#### Scenario: Source recorded in settings

- **WHEN** a skill is installed
- **THEN** `settings.json` records the canonical source (e.g., `github:owner/repo`)

#### Scenario: Lockfile records full source details

- **WHEN** a skill is installed
- **THEN** the lockfile records canonical `source`, `skillPath`, resolved `commitSha`, and `contentHash`

#### Scenario: Source metadata enables re-fetch

- **WHEN** a future update command needs to check for updates
- **THEN** the stored source metadata provides sufficient information to re-fetch from the original location

Unit tests SHALL verify:
- Settings correctly stores canonical source notation
- Lockfile correctly stores canonical source and resolved details
- Round-trip: liberal input -> canonical form -> can reconstruct fetch URL
- Canonical notation parsing (prefix extraction, value extraction)

### Requirement: Content Hash Computation

The CLI SHALL compute content hashes locally for lockfile integrity.

#### Scenario: Hash computed from skill directory

- **WHEN** recording a skill in the lockfile
- **THEN** the CLI computes a hash from the skill directory contents (not from external APIs)

#### Scenario: Hash is deterministic

- **WHEN** the same skill content is installed twice
- **THEN** the computed hash is identical

#### Scenario: Hash changes with content

- **WHEN** skill content changes (files added, modified, or removed)
- **THEN** the computed hash changes

#### Scenario: Hash algorithm is documented

- **WHEN** computing the content hash
- **THEN** the CLI uses SHA-256 of sorted file paths and contents

Unit tests SHALL verify:
- Hash computation is deterministic for same content
- Hash changes when content changes
- Hash is independent of file system metadata (timestamps, permissions)
