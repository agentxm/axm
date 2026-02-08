## Why

The `axm skills uninstall` command exists as a stub but has no implementation. Users need a way to remove installed skills — both from the lockfile and from disk (canonical directory + agent symlinks). The install handler already establishes the plan-based reconciliation pattern; uninstall should follow the same flow for consistency.

## What Changes

- Implement the uninstall handler using the same desired-state reconciliation pattern as install: load lockfile → build `UninstallSkillOperation`s → build plan → resolve plan via workspace
- Create `uninstall-skill` operation handler that removes canonical skill directory, agent symlinks, and lockfile entry
- Create `build-plan` for uninstall that checks lockfile (and optionally disk) to determine expected results
- Support glob patterns for skill names (e.g., `effect-*` matches all skills starting with `effect-`), expanding against lockfile keys before building operations
- Support partial uninstall via `--agent` flag (remove from specific agents only, update lockfile agents list)
- Support `--preview` and `--non-interactive` flags via workspace context (already wired in command.ts)

## Capabilities

### New Capabilities

- `skills-uninstall-build-plan`: Building uninstall plans from UninstallSkillOperations against lockfile state
- `skills-uninstall-execute`: Executing individual skill removals — delete canonical directory, remove agent symlinks, remove lockfile entry
- `skill-name-glob`: Expanding glob patterns against a list of installed skill names. Supports `*` only (match any sequence of characters). Patterns are matched against the full skill name — no path separators or directory semantics involved. Examples: `effect-*` matches `effect-basics`, `effect-stream`; `*-testing` matches `unit-testing`, `e2e-testing`. Does not support `?`, brace expansion (`{a,b}`), character classes (`[abc]`), or recursive globs (`**`). Literal skill names (no wildcards) are passed through unchanged. A pattern that matches zero skills produces a no-op plan entry (not an error)

### Modified Capabilities

- `cli-skills-uninstall`: Updating the existing spec to reflect the implemented handler flow and operation-based architecture

## Impact

- `packages/cli/src/cli-commands/skills/uninstall/handler.ts` — Replace stub with full implementation
- `packages/cli/src/cli-commands/skills/uninstall/build-plan.ts` — New file for plan construction
- `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts` — New file for operation handler
- Lockfile module (`removeLockEntry`) — Already exists, will be consumed
- Operations module — `UninstallSkillOperation` type already defined
- No breaking changes — new functionality only
