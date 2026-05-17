## Why

`skillsConfig.ignore` and sibling feature ignore lists currently suppress prune
but do not suppress WorkspaceReadModel-backed lint findings. The read-model
service passes an empty ignored-name set into extension projections, so
`workspace/skills-managed` still reports ignored skill artifacts. This violates
the accepted `workspace-context` scenario "Ignored skill is suppressed but raw
evidence remains visible" in `openspec/specs/workspace-context/spec.md`.

The same gap leaves agents without a concise decision model for unmanaged skill
findings: adopt, fork, ignore, or prune.

## What Changes

- Wire `skillsConfig.ignore`, `commandsConfig.ignore`,
  `mcpServersConfig.ignore`, `subagentsConfig.ignore`, and `packsConfig.ignore`
  into the WorkspaceReadModel projection path.
- Treat ignore entries as raw patterns and match `*` globs at subject policy
  time, where detected names are available.
- Keep file and rule projections unchanged because there is no corresponding
  `filesConfig.ignore` or `rulesConfig.ignore` settings schema.
- Update `axm help skills`, the published AXM skill, and the internal SSoT guide
  with the adopt/fork/ignore/prune model for unmanaged skills.

## Impact

- `packages/core/src/unstable/workspace/read-model/**`
- `packages/core/src/unstable/lint/**`
- `packages/cli/help/topics/skills.md`
- `.axm/extensions/@agentxm/skills/axm/src/SKILL.md`
- `agentxm-internal:docs/guides/axm-skill-guide.md`

No spec delta is needed; this change implements an already-accepted
`workspace-context` scenario.
