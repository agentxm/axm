## Why

axm writes `.axm/settings.json` into user projects. The current approach re-serializes the entire file on every mutation (`JSON.stringify` with hardcoded 2-space indent), which can conflict with a project's formatting rules (Prettier, EditorConfig, tabs vs spaces, trailing newlines, etc.). This creates noisy diffs and forces users to re-format after every `axm` operation.

## What Changes

- Replace full-file re-serialization with surgical JSON text edits using `jsonc-parser` (Microsoft's format-preserving JSON editor, used in VS Code)
- Mutations (`addSkill`, `removeSkill`, `addAgent`) read the raw file text, compute minimal edits at the target JSON path, and write back — preserving all formatting outside the edit region
- New files still get a sensible default format (2-space indent + trailing newline) since there's no existing style to preserve

## Capabilities

### New Capabilities

- `format-preserving-json`: Format-preserving JSON read-modify-write capability that makes targeted edits to JSON files without reformatting unchanged content

### Modified Capabilities

- `settings-service`: Mutations switch from full re-serialization to surgical edits, preserving existing file formatting

## Impact

- **Code**: `packages/cli/src/settings/` — `writeSettings` replaced or augmented with edit-based approach; service mutations updated to pass JSON paths instead of whole objects
- **Dependencies**: New dependency on `jsonc-parser` (MIT, zero-dep, ~50KB, maintained by Microsoft)
- **Tests**: Existing settings write tests need updating to verify formatting preservation rather than exact `JSON.stringify` output
