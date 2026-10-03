---
type: Decision
status: stable
description: Pack retirement uses accepted dependency authority for reachability while preserving and reporting physical content whose ownership or integrity cannot be verified.
depends-on:
  - ../extensions/packs.md
  - ../workspace/lockfile.md
  - ./executable-specifications-authority.md
---

# Pack retirement when the package cannot be read

## Decision

Pack retirement separates dependency authority from physical deletion authority.
A configured acquired Pack with a matching accepted declaration retains known
member relationships even when its installed manifest is absent or changed.
Uninstall removes the selected registration and accepted row, then evaluates
member retention against the remaining desired graph. Direct routes and other
enabled Packs retain shared members; proven-unreachable members may retire.

Known relationships do not authorize deleting unverifiable bytes. Uninstall
separately inspects the selected Pack's canonical content and preserves it when
ownership or integrity cannot be established. The plan reports that retention
and its recovery route. Preview and apply validate both graph inputs and
physical facts; changed facts make a candidate stale.

Missing or invalid accepted dependency authority, and uncertain authored
membership, still prevent destructive negative conclusions. The existing
selected-target retirement path can remove an unreadable Pack's registration
where its own uncertainty is isolated; unrelated uncertainty remains a blocker.

## Context

Previously, the lock recorded only flat member identities. An unreadable
installed manifest therefore left dependency relationships unknown. The
selected-target retirement exception avoided requiring a temporary restored
manifest merely to remove a Pack's registration.

The accepted lock now records complete dependency declarations. That supplies
the graph evidence the previous design lacked, without making installed
content trustworthy. Keeping those two judgments separate permits safe member
retirement while preserving foreign or damaged physical state.

## Consequences

- Root and typed uninstall share the same Pack retirement plan.
- Missing acquired Pack files no longer cause a blanket unknown-membership
  blocker when their accepted declarations match configured intent.
- Authored Packs still derive relationships from current authored manifests;
  their directories remain authoring inventory and are preserved.
- A drifted acquired manifest cannot inject new member routes or authorize
  deleting the Pack's unverified directory.
- Result warnings distinguish retained physical content from retired
  registration and accepted state.

The specification
`cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable` in the
[specification catalog](../../../specifications/catalog.md) owns the behavior;
this record explains the authority split.

## Alternatives

Requiring every acquired manifest to be restored before planning removal would
repeat source acquisition solely to recover already accepted declarations.
Deleting content solely because its graph is known would mistake dependency
authority for ownership and integrity evidence. Neither approach preserves the
separation needed for safe retirement.

## Reconsideration

Reconsider if acquired dependency authority moves out of accepted state, or an
explicit operation introduces different authority for deleting unverified
content. Such a change needs its own specification and ownership policy.
