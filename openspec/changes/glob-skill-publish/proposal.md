## Why

`axm skills publish` only accepts a single exact extension name. When managing many skills with a common prefix (e.g., `effect-*`), publishing them requires running the command once per skill. Glob support already exists for install, fork, and uninstall — publish should work the same way.

## What Changes

- Accept glob patterns in the `extension` positional argument (e.g., `axm skills publish "effect-*"`)
- Expand glob patterns against managed extensions in `.axm/extensions/` (not lockfile — publish operates on managed extensions)
- Build a multi-step plan with one `PublishSkillOperation` per matched extension
- Fail with a descriptive error when no managed extensions match the pattern
- Accept multiple positional arguments for publishing several skills or patterns at once (e.g., `axm skills publish "effect-*" commit`)

## Capabilities

### New Capabilities

- `cli-skills-publish-glob`: Glob pattern support for the `skills publish` command, expanding patterns against managed extensions and building multi-skill publish plans.

### Modified Capabilities

- `registry-publish`: Update to reflect that the command accepts glob patterns and multiple extensions, not just a single extension name.

## Impact

- `packages/cli/src/cli-commands/skills/publish/handler.ts` — handler rewritten to support glob expansion and multi-extension plans
- `packages/cli/src/cli-commands/skills/publish/command.ts` — yargs definition updated from single positional to variadic positional
- `packages/cli/src/skills/glob.ts` — may need a new helper to expand globs against managed extension names (vs lockfile names)
- Existing single-extension publish behavior is preserved (a literal name is just a pattern that matches one extension)
