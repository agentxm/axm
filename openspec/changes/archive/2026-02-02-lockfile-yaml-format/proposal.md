## Why

The current JSON lockfile (`axm.lock`) produces noisy diffs when extensions are added, updated, or removed. YAML format provides better human readability and cleaner version control diffs, making it easier to review lockfile changes in pull requests.

## What Changes

- **BREAKING**: Rename lockfile from `axm.lock` to `axm-lock.yaml`
- **BREAKING**: Change lockfile format from JSON to YAML
- Update all code that reads/writes the lockfile to use YAML serialization
- Update proposal.md documentation to reflect new filename and format

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `schema-lockfile`: Change file format from JSON to YAML and filename from `axm.lock` to `axm-lock.yaml`

## Impact

- **Code**: Lockfile read/write operations need YAML parser/serializer
- **Documentation**: proposal.md lockfile sections need updating
- **Schema**: `openspec/specs/schema-lockfile/spec.md` needs format update
- **Tests**: Any tests referencing lockfile format or filename
