---
observed_at: "2026-09-25T17:02:03Z"
session: "z4n8"
area: "public PR merge readiness and branch preview handoff"
---

# Main advance required a new branch preview

## Context

The branch preview was published from commit `bf16afee8`. GitHub then
reported PR #450 as conflicting with current `main` after #451 merged.

## Friction

Merging `origin/main` into the public branch conflicted in reconciliation
operations, its index, and the generated specification catalog. The new Pack
member step also imported the deprecation warning helper from its former
location, causing the first merged workspace typecheck to fail.

## Cost / impact

The PR needed conflict resolution, catalog regeneration, and another
typecheck. The published preview no longer represents the branch head, so
exact-commit CI and preview publication must run again before delivery.

## Outcome

The conflicts were resolved in the same public PR. The catalog was regenerated
and the merged workspace typecheck passed. Fresh branch CI and preview
publication remain pending.

## Evidence

- `origin/main` advanced to `50404837c` (#451), and GitHub reported PR #450
  `mergeable: CONFLICTING`.
- The merge conflicted in three files; the regenerated catalog reported 406
  specifications and 35 execution bindings.
- `workspace:typecheck` passed after the Pack member import was updated.
