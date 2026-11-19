---
type: Guide
title: "Designing and reviewing a workspace setup"
description: "Trace a user's workflow through the capabilities, scopes, and hosts that the workspace supplies."
tags: ["workspace", "setup", "contributors", "configuration", "design", "review"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:36:43Z" }
---

# Designing and reviewing a workspace setup

Choose someone the workspace serves and one task they should be able to
finish. For example, a new contributor should be able to draft a release note
from the release pack on their first day. Which host and project scope will
they use? What provides the drafting skill, who owns the release policy it
reads, and how will that contributor receive both?

Use the requested outcome to bound the assessment. For a first draft in chat,
follow the path until the contributor can read that draft. Publishing it or
maintaining the author's other extensions would be separate tasks. Tie each
finding to a step that changes for this user.

For a design, follow that task from a fresh checkout to its intended result.
Place a capability at the scope of the people and projects that need it.
Consider a second host or user when it changes that decision. A maintainer
may legitimately use a personal publishing helper. A release policy every
contributor needs belongs on a shared installation path.

For a review, compare that intended path with what the project declares,
which packages and versions it resolves, and what the selected host receives.
Suppose the maintainer can draft the note because their personal setup
supplies the policy. Follow the [pack installation](composing-packs.md) in a
clean consumer to locate the missing dependency. If the contributor's draft
itself appears twice, [trace that request](extension-sets.md#trace-a-request)
to identify the participating extensions. A receipt for a later append
leaves the draft's behavior open.
A projection establishes placement. Use an [observed request or event](verification.md)
to establish selection, execution, or the resulting change.

In an AXM workspace, use the `axm` skill and current CLI help for ownership,
desired and observed state, and managed changes. Use that evidence to decide
which capability the workflow requires, where it belongs, and what would
show that the intended user can complete the task. Carry the selected
subject and evidence into an authorized repair. Recheck the contributor's
original task in the affected scope.
