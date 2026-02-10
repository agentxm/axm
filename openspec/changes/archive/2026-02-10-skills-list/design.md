## Context

The CLI has `skills install`, `skills uninstall`, `skills fork`, and `skills publish`
but no way to view what's already installed. The lockfile (`axm-lock.yaml`) already
contains all installed skill data — the list command is a read-only projection of it.

## Goals / Non-Goals

**Goals:**

- Display installed skills from the lockfile with source and agent info
- Filter by agent via `--agent` (repeatable)
- Support `--global` flag to read from global lockfile
- Alias `ls` for convenience

**Non-Goals:**

- JSON/machine-readable output (future concern)
- Querying remote registries or sources
- Showing skills from settings that aren't yet installed

## Decisions

### Read from lockfile via LockfileService

The handler calls `LockfileService.getSkills()` to get the `SkillsLockMap`. This
reuses existing infrastructure and respects the workspace scope (`--global` selects
the global workspace).

**Alternative**: Read settings `skills` map. Rejected — settings represent desired
state, lockfile represents actual installed state. Users want to see what's installed.

### Filter in handler, not in service

Agent filtering is applied in the handler after fetching all skills. The lockfile
service stays a generic data layer; the list command owns its display logic.

### Output format: table-like plain text

Each skill shows its name, source type, and agents. This follows the pattern of
other CLI tools (`npm ls`, `brew list`). No `--json` flag in this change.

### Command wiring

Register `listCommand` (alias `ls`) in `skills/command.ts` alongside the existing
sub-commands. The handler uses the standard `run()` wrapper with workspace config
for scope resolution.
