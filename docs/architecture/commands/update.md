---
type: Architecture
status: stable
description: How AXM advances or rematerializes an existing extension resolution.
depends-on:
  - ./overview.md
  - ../workspace/lockfile.md
  - ../workspace/invariants.md
---

# Update

`axm update` changes an already desired extension within an explicitly stated
version intent. Reinstall is an update mode that replaces installed external
content without advancing its accepted resolution.

## Responsibilities

Update has three distinct forms:

- updating without a constraint advances the accepted resolution within existing
  workspace configuration;
- updating with a constraint changes that durable constraint and resolves the
  affected extensions as one operation; and
- `--reinstall` reacquires the accepted external resolution without changing
  version intent.

A targeted update classifies the complete desired graph before consulting the
Registry. Direct-only targets update through their direct declaration.
Pack-only targets update as one member-scoped pack transition and never acquire
a direct settings entry. Combined targets retain direct authority while every
owning pack constraint remains a guard. When several packs own a member, the
candidate must satisfy their constraint intersection.

Absent, disabled, workspace-authored, incomplete, and constraint-conflicted
targets stop before Registry lookup. An explicit version range on a pack-only
target also stops because accepting it would create new direct intent; update
the owning pack declaration instead. Preview and apply expose the same
ownership, activation, authority, owning packs, effective constraint, member
closure, expected state effects, and blocker facts in human and structured
output.

Apply revalidates those authority facts inside the workspace transaction. A
changed settings entry, owning pack, manifest identity, accepted pack evidence,
or constraint aborts the stale plan before the member step runs. The member
resolution, canonical content, and projections then commit together or roll
back together, while owner pack roots and manifests remain unchanged.

Update and reinstall may replace divergent external canonical extension content
because the command explicitly requests replacement. AXM discloses that
replacement; it does not require `--force` for the routine operation the user
selected.

Inline MCP definitions have no accepted external resolution to advance or
reinstall. Workspace-wide update reports each as not applicable, continues with
independent sourced entries, and points to sync for projection reconciliation.
A targeted inline MCP update blocks before source lookup as a source-authority
mismatch.

## Non-responsibilities

Update does not broaden a constraint unless the user supplies one, reinterpret
local drift as workspace authorship, change unrelated resolutions, or bypass
accepted-lock, ownership, stale-plan, locking, and rollback requirements.

Reinstall uses only the exact immutable identity in the authoritative lockfile.
If a mutable source no longer reproduces it and canonical content is missing,
reinstall blocks rather than substituting different bytes. Update may resolve
and atomically accept a new identity within durable intent.

Reinstall is not repair. It does not choose new intent, resolve an unrelated
invariant violation, replace workspace-authored content, or adopt an unowned
path.

## Specifications

The update specifications under `specifications/cli/update/` own update's
binding obligations — advancing the accepted resolution within durable intent,
preserving configuration and unrelated state, and repeat-run no-ops; the
[specification catalog](../../../specifications/catalog.md) indexes them.
