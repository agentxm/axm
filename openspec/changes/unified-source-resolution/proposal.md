## Why

`axm skills install` and `axm skills fork` accept different input types and resolve them through divergent code paths. Install only accepts source strings (e.g. `github:owner/repo`, `./local/path`). Fork accepts globs and installed skill names (against the lockfile) in addition to source strings, but its glob path only matches already-installed skills — making `fork "effect-*"` useless when skills come from an uninstalled source. This inconsistency confuses users and limits composability between commands.

## What Changes

- **Unify source resolution** across `install` and `fork` so both commands accept the same input types: source strings, installed skill names, and glob patterns.
- **Extend glob matching to work with source-discovered skills**, not just lockfile entries. When a glob is provided alongside a source (or a default/configured source context), expand the glob against skill names discovered from that source.
- **Add glob support to `install`** so users can install a subset of skills from a source by name pattern (e.g. `axm skills install github:owner/repo "effect-*"`).
- **BREAKING**: Fork's glob resolution changes from lockfile-only to source-aware. A glob that previously matched zero installed skills and failed may now match and fork skills from configured sources.

## Capabilities

### New Capabilities

- `source-aware-glob`: Glob expansion against skills discovered from a source, not just lockfile entries. Enables `install` and `fork` to filter by name pattern from any source.
- `cli-skills-fork`: Fork command behavior — converting unmanaged skills into managed extensions via fork + publish. Currently unspecified.

### Modified Capabilities

- `cli-skills-install`: Install command gains glob filtering support for discovered skills.
- `skill-name-glob`: Glob expansion is used in a new context (source-discovered names) in addition to the existing lockfile context.

## Impact

- `packages/cli/src/cli-commands/skills/fork/handler.ts` — replace bespoke 3-path resolution with shared resolution logic
- `packages/cli/src/cli-commands/skills/install/handler.ts` — add optional glob filtering after source discovery
- `packages/cli/src/cli-commands/skills/install/command.ts` — add optional glob/filter argument
- `packages/cli/src/cli-commands/skills/fork/command.ts` — may need argument changes to accept source + glob separately
- `packages/cli/src/cli-commands/skills/uninstall/glob.ts` — may move to shared location since it's now used by install, fork, and uninstall
- Existing `skill-name-glob` spec and tests remain valid; new scenarios added for source-aware usage
