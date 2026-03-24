## MODIFIED Requirements

### Requirement: Workspace skill directory resolution

The Workspace service SHALL provide a `getSkillDir` method that resolves the canonical directory and skill source path for a skill.

`getSkillDir` SHALL accept a skill display name and an optional source discriminant:

- **Name-only** `getSkillDir(name)` — looks up the lock entry to determine source type. SHALL fail with `AppError` if the skill is not in the lockfile.
- **Explicit source** `getSkillDir(name, source)` — uses the provided source discriminant, skipping lockfile lookup. The source discriminant requires `type`; when `type` is `"registry"`, it also requires `scope`.

`getSkillDir` SHALL sanitize the name internally via `sanitizeName`.

`getSkillDir` SHALL return `{ canonicalPath, skillSrcPath }`:

- `canonicalPath`: root directory of the installed skill
- `skillSrcPath`: directory containing actual skill source files (agents symlink to this)

For non-registry sources, `canonicalPath` and `skillSrcPath` SHALL be equal (`<base>/.axm/extensions/external/skills/<sanitized-name>`).

For registry sources, `canonicalPath` SHALL be `<base>/.axm/extensions/<namespace>/skills/<sanitized-name>` and `skillSrcPath` SHALL be `<canonicalPath>/src`.

#### Scenario: Non-registry skill resolved by name

- **WHEN** calling `getSkillDir("my-skill")` and the lockfile entry has `type: "github"`
- **THEN** `canonicalPath` is `<base>/.axm/extensions/external/skills/my-skill`
- **AND** `skillSrcPath` is `<base>/.axm/extensions/external/skills/my-skill`

#### Scenario: Registry skill resolved by name

- **WHEN** calling `getSkillDir("my-skill")` and the lockfile entry has `type: "registry"` with `namespace: "@acme"`
- **THEN** `canonicalPath` is `<base>/.axm/extensions/@acme/skills/my-skill`
- **AND** `skillSrcPath` is `<base>/.axm/extensions/@acme/skills/my-skill/src`

#### Scenario: Explicit source for install (no lock entry)

- **WHEN** calling `getSkillDir("my-skill", { type: "registry", namespace: "@acme" })`
- **THEN** the lockfile is NOT consulted
- **AND** `canonicalPath` is `<base>/.axm/extensions/@acme/skills/my-skill`
- **AND** `skillSrcPath` is `<base>/.axm/extensions/@acme/skills/my-skill/src`

#### Scenario: Explicit non-registry source

- **WHEN** calling `getSkillDir("my-skill", { type: "local" })`
- **THEN** `canonicalPath` and `skillSrcPath` are both `<base>/.axm/extensions/external/skills/my-skill`

#### Scenario: Name-only with missing lock entry

- **WHEN** calling `getSkillDir("unknown-skill")` and no lockfile entry exists
- **THEN** the call SHALL fail with an `AppError`

#### Scenario: Name is sanitized internally

- **WHEN** calling `getSkillDir("My Fancy Skill!")`
- **THEN** the directory name uses the sanitized form (e.g., `my-fancy-skill`)

### Requirement: Universal skills directory constant

The constant identifying the agent-visible symlink directory SHALL be named `UNIVERSAL_SKILLS_DIR` with value `.agents/skills`. This directory SHALL only contain symlinks to canonical locations, never source files directly.

#### Scenario: Constant value

- **WHEN** referencing the agent-visible skills directory constant
- **THEN** the constant is `UNIVERSAL_SKILLS_DIR` with value `.agents/skills`

## ADDED Requirements

### Requirement: External extensions directory constant

The constant identifying the non-registry canonical storage directory SHALL be named `EXTERNAL_EXTENSIONS_DIR` with value `.axm/extensions/external`.

#### Scenario: Constant value

- **WHEN** referencing the non-registry canonical storage directory
- **THEN** the constant is `EXTERNAL_EXTENSIONS_DIR` with value `.axm/extensions/external`

#### Scenario: Non-registry canonical path uses external extensions directory

- **WHEN** computing the canonical path for a non-registry skill
- **THEN** the path SHALL be `<base>/<EXTERNAL_EXTENSIONS_DIR>/skills/<sanitized-name>`
