## Why

The universal skills target (`.agents/skills`) is an always-on materialization
location, but the codebase models it as a special case rather than as an agent.
Direct skill installs include that target manually, while sync and pack
expansion flow through configured agents only. That creates divergent behavior:
canonical skill content can exist in `.axm/extensions/` and per-agent skill
directories while the universal artifact is missing.

## What Changes

- Introduce a synthetic `universal` agent id that is always included for
  materialization but never persisted to `settings.json`.
- Add `getMaterializationAgents()` to the coding agent repository. It returns
  `universal` plus real configured agents; existing configured-agent accessors
  stay real-agent-only.
- Route skill install, sync/materialization, enable/disable, cleanup, and
  source-resolution materialization paths through the new accessor where they
  need render targets.
- Remove the special universal-artifact lockfile field. Skill lock entries use
  `agents: ["universal", ...]`; old lockfiles migrate by appending
  `universal` and dropping `universalArtifact`.
- Retarget `workspace/skills-universal-artifact-present` to verify that enabled
  locked skills include `universal` in `agents[]`, with an autofix that updates
  the lock entry.

## Capabilities

### Modified Capabilities

- `cli-skills-install`: install renders `.agents/skills/<name>` through the
  same materialization loop used for configured agents.
- `workspace-reconciliation`: sync and pack-implied materialization include the
  universal skill target.
- `workspace-context`: the lockfile read model accepts the old
  `universalArtifact` shape and normalizes it to `agents: ["universal", ...]`.

## Impact

- `packages/core/src/unstable/agents/*` — add the synthetic agent model and
  materialization accessor.
- `packages/core/src/unstable/skills/*` — remove universal special casing and
  render via the shared agent loop.
- `packages/core/src/unstable/lockfile/*` — bump schema version and migrate
  legacy universal artifact fields.
- `packages/core/src/unstable/lint/catalog/workspace/skills-universal-artifact-present.ts`
  — retarget from artifact-path presence to `agents[]` membership.
- Existing workspaces will begin materializing `.agents/skills/` on the next
  install or sync.
