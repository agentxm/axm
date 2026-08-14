---
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

Update and reinstall may replace divergent external canonical extension content
because the command explicitly requests replacement. AXM discloses that
replacement; it does not require `--force` for the routine operation the user
selected.

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

## Testing strategy

Behavior tests distinguish constraint-preserving update, explicit constraint
change, and reinstall. They prove replacement disclosure, closure atomicity,
exact source-class rematerialization, idempotence, unrelated-state
preservation, and parity between root and type-specific forms.
