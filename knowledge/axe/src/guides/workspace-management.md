---
type: Guide
title: "Managing an agent-extension workspace over time"
description: "Keep workflows usable across branch and version changes, whether your team installs published extensions or also authors its own."
tags:
  [
    "workspace management",
    "drift",
    "branch switches",
    "installed extensions",
    "authored extensions",
    "shared rules",
    "personal scope",
    "deprecated extensions",
    "retirement",
  ]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:59:53Z" }
---

# Managing an agent-extension workspace over time

A team that installs only published extensions still manages a workspace.
It chooses which extensions and versions to use, what belongs in project or
personal scope, and which hosts receive them. When the [workspace setup](workspace-setup.md)
changes, check that contributors can still do their work. In AXM,
`axm help basic-usage` covers routine installation, sync, and updates.

Identify ownership for each extension. For example, a team can author a
release pack that includes a third-party drafting skill. The team can change
which skill the pack selects. The skill’s publisher owns its implementation.
When the team changes its pack, check both the author's workspace and
[what a clean consumer gets from the packaged release](composing-packs.md).
The outcomes below apply whether the team authors any packages or only uses them.

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

Suppose the new branch requires a rollback instruction in each release note,
but a contributor still gets the old format. What changed on the branch?

| Change                                                    | What the team owns and can check                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The project adopted a newer published rule.**           | Check the project declaration and the version accepted on this branch. If that release contains the rollback requirement, reconcile the checkout with it. If the release itself lacks the requirement, revisit the selection or raise the issue with the publisher. |
| **The project authors the rule and changed its wording.** | Inspect the canonical rule source on the branch. Correct it there if needed, then reconcile the instructions generated from it. If the team distributes the rule, try the packaged change in a separate consumer workspace as well.                                 |

Choose the branch-switch policy by its effects. An advisory check gives
contributors a chance to review local edits, at the cost of a manual step
while guidance is stale. Automatic reconciliation can save that step when
the team authorizes the writes and the manager can preserve local work.
Surface conflicts and new execution approvals to their owners. An upstream
release is a separate adoption decision, even if it becomes available during
the switch. In AXM, see `axm help workspace-state` for reconciliation and
`axm help git-hooks` for Git events and commands.

Try a switch between branches with different release policies. Inspect the
instructions the contributor's host receives, then ask for a draft in a fresh
session and check it against that branch's expected format.
On a second check of the same branch, the contributor should have no further
repair to make.

## A publisher deprecates a skill our team still uses

Suppose contributors use a release pack to draft notes in the team's format.
The publisher deprecates its drafting skill and names a successor. Before the
next release, find out which declaration supplies the skill. If the pack
selects it, the pack maintainer owns the dependency change. A team consuming
that pack can try a revised pack release. If the project selects the skill
directly, the team can preview the migration in its own workspace.

Read the publisher's reason against the task contributors still need to do.
For a **superseded** skill, try the named successor on a recent release.
For an **obsolete** skill, try the workflow with the skill removed and check
that contributors can still produce the note. An **unmaintained** skill may
have no successor. If it still works and the team chooses to keep it for the
next release, name who will evaluate alternatives and when to revisit that
choice. In AXM, `axm list --deprecated` finds affected installations.
`axm help workspace-state` explains how to inspect the reason and preview
supported migrations.

After the chosen change, ask a contributor to draft a note in a fresh session
on the affected host. Check that the note follows the team's format and
includes the rollback instructions. If the old skill still appears for one
person, trace what supplies it in their scope.

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
