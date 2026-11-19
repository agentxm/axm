---
type: Guide
title: "Composing extension packs"
description: "Choose pack members and compatible versions from the job a clean installation must support."
tags: ["packs", "composition", "dependencies", "versions", "distribution"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:16:02Z" }
---

# Composing extension packs

Imagine installing the pack into an empty workspace. Which promised task
breaks if a member is missing? A [routing skill with a knowledge bundle](../patterns/progressive-disclosure.md)
needs both members to answer a request.
An unrelated skill used by the maintainer has no such claim to membership.
When an optional companion helps with a follow-up, [trace both requests](extension-sets.md#trace-a-request) to decide which one the pack promises to support.

A version range promises that the members work together. If the skill names
a concept introduced in version 2, a range admitting version 1 leaves some
consumers with a broken route. Base the range on the routes and behavior the
skill uses. Pin the combination if that is the extent of the evidence.

Try the promised task from the selected archives in a clean consumer. A sibling
installed for unrelated work can hide a missing dependency in the author's
workspace. AXM's membership and dependency conventions are in `axm help packs`.

Also start from a member's package page. Follow its
[README install route](authoring-readme.md#when-the-extension-belongs-to-a-pack)
and check that this supplies the companions its first example uses.
