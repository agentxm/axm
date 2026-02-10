## Why

JSON lockfile diffs are noisy—adding a single extension produces large diffs due to brace positioning and lack of trailing commas. YAML produces cleaner, more reviewable diffs. The spec (`schema-lockfile`) already requires YAML format, but the code still uses JSON.

## What Changes

- **BREAKING**: Rename lockfile from `axm.lock` to `axm-lock.yaml`
- **BREAKING**: Change serialization format from JSON to YAML
- Update `readLockfile` to parse YAML instead of JSON
- Update `writeLockfile` to serialize as YAML instead of JSON
- Update all unit tests to use YAML format and new filename
- Update all E2E tests to use YAML format and new filename

## Capabilities

### New Capabilities

None - this is implementation work for an existing spec.

### Modified Capabilities

None - the `schema-lockfile` spec already defines YAML format. This change brings code into conformance with that spec.

## Impact

- `packages/core/src/experimental/skills/lockfile.ts` - change JSON.parse/stringify to YAML.parse/stringify
- `packages/core/src/experimental/skills/lockfile.test.ts` - update filename references
- `packages/cli/src/commands/skills/install/handler.ts` - update comments
- `packages/cli/src/commands/skills/install/handler.test.ts` - update filename references
- `packages/cli/e2e/skills-install.test.ts` - update filename references and content parsing
