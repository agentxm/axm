---
type: Guide
title: "Managing an agent-extension workspace over time"
description: "Choose how to keep shared extensions usable when branches, versions, or the people and hosts using them change."
tags:
  [
    "workspace management",
    "drift",
    "branch switches",
    "shared rules",
    "personal scope",
    "retirement",
  ]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:46:06Z" }
---

# Managing an agent-extension workspace over time

Start with a task the [workspace setup](workspace-setup.md) already supports.
A contributor can draft a release note using the team's current policy. What
should happen to that workflow when the contributor switches branches or the
team retires the drafting skill?

## Outcomes of effective workspace management

| Outcome                       | What a team can observe                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usability                     | The intended contributor can complete the task in each host the team supports for it.                                                                      |
| Reproducibility               | A fresh worktree with the declared versions and required configuration supports the task under a contributor account with only the shared setup.           |
| Alignment with project intent | Additions, changes, and removals reach the affected hosts. When a host falls behind, someone can see what needs attention.                                 |
| Deliberate change             | The team chooses when to adopt an upstream version and who may authorize newly executable behavior. Project changes preserve independent personal choices. |
| Recoverability                | A maintainer can explain a discrepancy, repair it at its source, and confirm the affected user's task works again.                                         |
| Low coordination cost         | Contributors can handle routine transitions themselves. An exception identifies the decision or repair needed and who owns it.                             |

## A shared rule changes after a pull

Suppose the release policy on the new branch requires a rollback instruction
in each note. A contributor pulls the change and still gets the old format.
Compare the branch's declaration and accepted version, the instructions
present where that contributor's host reads them, and a draft from a fresh
session in that worktree. If the local instructions are stale, reconcile them
with the branch. If they are current, use the fresh-session result to decide
whether the problem persists before changing shared configuration.

Choose the branch-switch policy by its effects. An advisory check gives
contributors a chance to review local edits, at the cost of a manual step
while guidance is stale. Automatic reconciliation can save that step when
the team authorizes the writes and the manager can preserve local work.
Surface conflicts and new execution approvals to their owners. An upstream
release is a separate adoption decision, even if it becomes available during
the switch. In AXM, see `axm help workspace-state` for reconciliation and
`axm help git-hooks` for Git events and commands.

Try a switch between branches with different release policies. Ask for a
draft in a fresh session and check it against that branch's expected format.
On a second check of the same branch, the contributor should have no further
repair to make.

## A retired shared skill still appears for one maintainer

Suppose the team has moved release drafting to a new workflow. A contributor
using only the project setup should lose the retired skill. A maintainer who
also installed it personally may still see it. Inspect the declarations and
host-visible locations in both scopes to identify which installation supplies
each user. A project retirement authorizes withdrawing the shared copy. The
maintainer owns the decision about the personal one.

Try the release workflow in a fresh session with each setup. The contributor
should be able to draft through the team's replacement. Check whether the
personal skill competes for that same request on the maintainer's host. If it
does, the observed selection gives the maintainer a concrete decision about
their own configuration. In both cases, the [verification guide](verification.md)
explains what host evidence can establish.
