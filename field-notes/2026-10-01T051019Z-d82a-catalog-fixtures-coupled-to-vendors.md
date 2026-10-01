---
observed_at: "2026-10-01T05:10:19Z"
session: "d82a"
area: "Agent catalog refresh verification"
---

# Live vendor declarations changed unrelated ownership fixtures

## Context

Refreshing agent identities, lifecycle and native reader declarations while
preserving workspace ownership and lint behavior.

## Friction

Seven feature assertions depended on the old vendor catalog: retired-agent
mechanisms, manual-delivery text, shared-reader counts, and authored/native
Skill overlap. Moving an authored fixture into `.claude/skills` during recovery
failed with `WorkspaceLayoutError` because that directory is reserved for
agent projections. Thirty CLI gallery snapshots also retained the old catalog.

## Outcome

The ownership and lint scenarios now supply explicit reader fixtures while
retaining their original read-only and ownership assertions. Authored content
stays in its valid source directory. All 22 focused feature cases pass. The
reviewed gallery update passes all 449 cases again without snapshot-update
mode. Broader verification remains a separate delivery gate.

## Evidence

`workspace-features/src/linting/catalog/workspace/` contains the ownership and
reader fixtures; `apps/cli/src/test-support/gallery/__snapshots__/` contains the
rendered catalog snapshots. The failed source CI run was `36814127305`.
