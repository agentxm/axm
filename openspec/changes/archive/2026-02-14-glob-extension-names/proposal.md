## Why

Commands that accept extension names require exact, one-at-a-time input. Users managing groups of related extensions (e.g., all `effect-*` skills) must repeat commands for each one. Glob patterns already work in `--skill` filter flags and `packs add`, but not as primary positional arguments in commands like `skills fork`.

## What Changes

- **`skills fork` accepts glob patterns as the positional argument**, expanding against installed/available skill names instead of requiring a source + `--skill` filter for each
- **Glob-as-primary-arg semantics**: when the positional `<source>` contains a `*`, treat it as a name glob instead of a source to resolve — expand against workspace skills, fork all matches
- **Consistent glob support** across commands that accept extension names

### Example workflow

```bash
# Fork all effect-* skills from unmanaged to managed
axm skills fork "effect-*"

# Create a new pack
axm packs new effect

# Add all (now managed) effect-* skills to the pack
axm packs add effect "effect-*"
```

## Capabilities

### New Capabilities

_None_ — this extends existing capabilities.

### Modified Capabilities

- `cli-skills-fork`: Positional `<source>` accepts glob patterns; when detected, expands against installed skill names and forks all matches (bypassing source resolution)
- `source-aware-glob`: Generalize to work at the positional argument level, not just post-discovery filtering

## Impact

- `packages/cli/src/cli-commands/skills/fork/` — command definition and handler
- `packages/cli/src/skills/glob.ts` — may need to expose glob detection utility
- `packages/cli/src/sources/parser.ts` — source input classification needs to recognize globs
