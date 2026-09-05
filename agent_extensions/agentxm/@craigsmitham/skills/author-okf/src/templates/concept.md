---
# REQUIRED. Reuse a type already present in the bundle when one fits.
type: "{{Type Name}}"
# Recommended.
title: "{{Human-readable display name}}"
description: "{{One sentence distinguishing this concept from its neighbors.}}"
# Canonical URI of the underlying asset. Delete for abstract concepts.
resource: "{{https://...}}"
tags: ["{{tag}}", "{{tag}}"]
# Lifecycle. Absent status means `stable`. Delete either line if not applicable.
status: draft
stale_after: 2027-01-01
# Trust. `by` is an actor: <producer>/<version>, human:<id>, or process:<id>.
generated: { by: "{{producer}}/{{version}}", at: 2026-01-01T00:00:00Z }
# Add only on a real verification event. Append; never overwrite. Delete if unverified.
verified:
  - { by: "human:{{id}}", at: 2026-01-01T00:00:00Z }
# Provenance. `resource` is required per entry; give an `id` when the body cites it.
sources:
  - id: "{{stable-key}}"
    resource: "{{https://... | /bundle/relative/path.md | scope descriptor}}"
    title: "{{Human-readable label}}"
    author: "team:{{id}}"
    usage_count: 0
    last_modified: 2026-01-01
usage_window: { from: 2026-01-01, to: 2026-01-31 }
---

# {{Human-readable display name; match `title` above}}

{{Prefer structural markdown — tables, lists, fenced blocks — over prose paragraphs.}}

{{A claim drawn from a source.}}[^{{stable-key}}]

Related: [{{other concept}}](/{{path/to/concept}}.md).

[^{{stable-key}}]: {{Attribution text}}
