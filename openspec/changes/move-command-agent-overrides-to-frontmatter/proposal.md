## Why

Commands and subagents use different locations for `agentOverrides`, which makes authoring inconsistent.

## What Changes

- Move command `agentOverrides` from `command.json` to `${name}.md` frontmatter.
- Strip `agentOverrides` before rendering agent-native command files.
- Keep RFC 7396 merge-patch semantics and orphan-agent warnings.
- Reject old command manifests that still contain `agentOverrides` during publish validation.

## Impact

- `packages/core/src/unstable/commands/**`
- `packages/core/src/unstable/publish/manifest-policy.ts`
- `openspec/specs/commands/spec.md`
- `contributing/guides/cli-design.md`
