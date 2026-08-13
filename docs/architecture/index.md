# AXM architecture

Navigation for the accepted product and system architecture of AXM.

## Foundations

- [Overview](overview.md) — AXM's purpose, responsibilities, state model, and
  major system elements
- [Principles](principles.md) — command ownership, recovery, content authority,
  change scope, overrides, and verification
- [Workspaces](workspaces.md) — desired state, current state, authority,
  reachability, and ownership

## Product surfaces and capabilities

- [Commands](commands.md) — responsibility boundaries across lifecycle,
  inspection, lint, sync, and type-specific commands
- [CLI output](output.md) — human and machine surfaces, channel boundaries, and
  contract authority
- [Lint](lint.md) — fact-only diagnostics and meaning-preserving autofix
- [Sync](sync.md) — reconciliation of managed current state with desired state
- [Capability targeting](capability-targeting.md) — portable sources with
  capability-based agent enhancements

## Workspace artifacts and execution

- [Settings](settings.md) — durable workspace configuration and editing
  authority
- [Lockfile](lockfile.md) — exact resolution pins and reproducibility
- [Workspace execution](workspace-execution.md) — read snapshots, planning,
  mutation, and adapter boundaries
