---
type: Reference
title: Maintaining requirement identity and lineage
description: Preserves requirement identity and evidence meaning through revision, split, merge, supersession, and retirement.
tags: [identity, lineage, split, merge, supersession, retirement, requirements-engineering]
generated: { by: codex/gpt-6, at: 2026-11-22T02:01:18Z }
---

# Maintaining requirement identity and lineage

Open the current requirement, its decision history, and the proposed change.
Compare who is obligated, what they must do, and which cases count as
satisfaction. Keep an identity when edits clarify wording without changing the obligation's
meaning. Create successor identities when meaning, obligated subject, or
independent decision boundaries materially change.

- **Revision**: retain identity; record the semantic or editorial change.
- **Split**: create independently authoritative successors, link each to the
  source, and retire or narrow the source deliberately.
- **Merge**: create a successor only if one atomic obligation genuinely replaces
  the sources; preserve all predecessor links.
- **Supersession**: keep historical text and decision evidence discoverable.
- **Retirement**: record why and when the obligation ceased, plus residual impacts.

Evidence does not transfer automatically. Reassess whether a prior test,
analysis, or validation result supports each successor and its revision. A link
preserves lineage; it is not proof of satisfaction.

Check the result from both ends. If there is earlier evidence, take an
inspection record, test result, or other assessment and find the exact
obligation and revision it assessed. From today's requirement, find
the decision that retained, changed, or ended that obligation. Identify
which evidence still applies. If a successor lacks evidence for its changed
obligation, record the gap against that successor.

Work-item and requirement lineages remain separate. Merging duplicate work items does not merge the
requirements they cite, and retiring a requirement does not close the item that
retired it.
