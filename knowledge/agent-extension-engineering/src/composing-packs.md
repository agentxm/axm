---
type: Guide
title: "Composing extension packs"
description: "Choose pack members and compatible versions from the job a clean installation must support."
tags: ["packs", "composition", "dependencies", "versions", "distribution"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:24:31Z" }
---

# Composing extension packs

Imagine installing the pack into an empty workspace. Which promised task
breaks if a member is missing? A skill that routes to knowledge needs the
bundle that answers its requests. The bundle may still be useful on its own.
An unrelated skill used by the maintainer has no such claim to membership.

A version range promises that the members work together. If the skill names
a concept introduced in version 2, a range admitting version 1 leaves some
consumers with a broken route. Base the range on the routes and behavior the
skill uses. Pin the combination if that is the extent of the evidence.

Try the promised task from the selected archives in a clean consumer. A sibling
installed for unrelated work can hide a missing dependency in the author's
workspace. AXM's membership and dependency conventions are in `axm help packs`.
