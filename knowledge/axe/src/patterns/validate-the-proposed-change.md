---
type: Pattern
title: "Validate the proposed change"
description: "When one judgment drives many edits, check the proposed edits together before applying them."
tags: ["skills", "batch edits", "validation", "rename", "migration", "preview"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:13:12Z" }
sources:
  - id: forms
    resource: https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/pdf/FORMS.md
    title: Anthropic PDF form workflow
---

# Validate the proposed change

When an agent turns a request into a batch of edits, give it a representation
that can expose a mistake before the first write. Anthropic’s PDF form skill
records intended field placements and checks the boxes for collisions and
insufficient space before filling the form.[^forms] A placement can be valid
on its own and still overlap the next one.

Consider a skill for renaming knowledge concepts. List the source ID, proposed
destination, and inbound references for each move. If both the authoring guide
and the review guide map to `guides/skills`, the proposed batch already shows
a collision. Check that each source exists, each destination is available,
and all affected routes resolve against the proposed layout. Correct the
mapping while the original concepts still resolve.

Apply the checked mapping to the revision it describes. If the sources or
routes changed in the meantime, check the affected entries again. Then use the
consumer’s entry point. Ask the router for each moved concept and inspect the
returned content. Preflight can catch colliding IDs. Consumer lookup can
catch a packaged router still pointing at the retired ID.

Use a diff, a tool's existing preview, or a small table when that is enough.
A separate plan artifact earns its cost when entries interact, changes are
expensive to undo, or the checks can be reused for the next batch.

[^forms]: Anthropic PDF form workflow, checking field placements before filling.
