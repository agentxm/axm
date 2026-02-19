## Why

Local skill development requires installing skills from the filesystem. The infrastructure for local sources already exists (path parsing, local provider, discovery, install execution, lockfile schema) but `resolveSkillInstallSource` explicitly rejects `file-path-pattern` input. Removing this block enables `axm skills install ./path` with minimal changes.

## What Changes

- Enable `file-path-pattern` input in the skill install source resolver (currently blocked with `SKILL_INSTALL_UNSUPPORTED_INPUT`)
- Route file path inputs through existing `parseLocalPath()` to produce a `LocalSource`
- Local skills are discovered, installed, locked, and persisted using the existing local source infrastructure

## Capabilities

### New Capabilities

_None — this change enables an existing capability path that is currently blocked._

### Modified Capabilities

- `cli-skills-install`: Add requirement for local path input support (e.g., `./path`, `../path`, `/absolute/path`)

## Impact

- `packages/cli/src/cli-commands/skills/install/resolve-skill-install-source.ts` — route `file-path-pattern` to local source resolution instead of erroring
- Existing tests for the unsupported input error will need updating
- No changes to lockfile schema, install execution, source types, or provider infrastructure
