---
type: Pattern
title: Concept boundaries
description: For a cohesive set of concepts readers repeatedly confuse, keep each positive definition canonical and give their comparative distinctions one explicit boundary document.
tags: [docs, concepts, boundaries, comparison, disambiguation, authority, discovery]
status: draft
sources:
  - id: documentation-craft
    resource: ../explainers/documentation-craft.md
    title: Documentation craft
  - id: documentation-audits
    resource: ../explainers/documentation-audits.md
    title: Documentation audits
  - id: documentation-organization
    resource: ../explainers/documentation-organization-and-discovery.md
    title: Documentation organization and discovery
  - id: pattern-explainer
    resource: ../explainers/pattern.md
    title: Pattern explainer
generated: { by: codex/gpt-5.6, at: 2026-08-21T22:05:43Z }
---

# Concept boundaries

For a cohesive set of concepts readers repeatedly confuse, keep each positive
definition canonical and give their comparative distinctions one explicit
boundary document.

## Context

A maintained corpus contains neighboring concepts that overlap, participate in
one workflow, or use familiar words differently. Readers need to decide which
concept applies, and authors need to state relationships without turning one
concept into the parent of every other view.

Indexes can provide short selection cues, and individual concept documents can
state local exclusions. Neither surface is a reliable authority for a
substantive comparison that recurs throughout the corpus.

## Problem

When every concept independently explains all its neighbors, definitions and
comparison tables drift. When the comparison is placed in an index, durable
knowledge becomes mixed with navigation. When every relationship is forced
into a hierarchy or glossary entry, overlap, authority, and contextual
differences disappear.

Readers then have to reconcile several plausible answers to questions such as
*Which concept owns this claim?*, *Can these concepts overlap?*, and *Which
artifact should I create?*

## Forces

- Readers need a fast routing answer before they need complete theory.
- Each concept needs a self-contained positive definition for direct search.
- A distinction is relational and may not belong exclusively to either side.
- Local reminders improve comprehension, but repeated full comparisons create
  competing authorities.
- A useful comparison is bounded to one recognizable confusion set; a universal
  matrix becomes shallow and difficult to maintain.
- Tables support lookup, while prose, examples, and counterexamples may be
  necessary to explain overlap and edge cases.

## Solution

Create one **concept boundary document** for the smallest cohesive set of
concepts whose distinctions are repeatedly needed.

1. Let each concept document own its positive definition, purpose, and detailed
   treatment.
2. Let the boundary document own the comparative claims: how the concepts
   differ, overlap, relate, and guide selection.
3. Give indexes only one-sentence selection cues and a link to the boundary
   document. Keep substantive matrices and rationale out of indexes.
4. Compare only stable axes that resolve the observed confusion. Useful axes
   include the question answered, unit represented, authority, scope,
   lifecycle, exclusions, overlap, and evidence expected.
5. Keep a short nearest-neighbor distinction in an individual concept when it
   is necessary to understand that concept, then link to the comparative
   authority instead of reproducing its complete table.
6. Use a reference form when compact lookup is the primary job. Use an
   explanation when rationale, history, tradeoffs, or worked examples are
   central. Do not create a special schema type merely to mark a comparison.
7. Express relationships in prose and ordinary links unless an actual consumer
   requires machine-readable relationship metadata.

The boundary document is not the canonical definition of every concept it
mentions. It is canonical for the relationship among them.

## Example shape

Use only the columns the reader needs:

| Concept | Question answered | Owns | Does not own |
| --- | --- | --- | --- |
| First concept | What does this concept help decide? | Its distinctive responsibility | A neighboring responsibility |
| Second concept | What different question does it answer? | Its distinctive responsibility | The first concept's responsibility |

Follow the matrix with prose when concepts can overlap, change roles by
context, or participate in a many-to-many relationship. A table should expose
the boundary, not pretend the model is simpler than it is.

## Consequences

- Readers gain one place to compare concepts without losing direct concept
  discovery.
- Authors can keep index descriptions concise and subject documents focused.
- Comparative changes require coordinated review because they may affect
  several concept documents.
- Some local repetition remains useful: a one-sentence boundary can be a
  projection of the canonical comparison rather than a second authority.
- The boundary document can become a dumping ground unless its confusion set
  and comparison axes remain explicit.

## When to use

Use this pattern when at least one of these conditions holds:

- three or more neighboring concepts are routinely confused;
- the same pairwise distinction appears in several documents;
- several artifacts need a stable selection or ownership matrix; or
- a false hierarchy is being used to compensate for missing relationship
  guidance.

## When not to use

Do not create a separate boundary document when:

- one sentence in a concept document resolves an isolated ambiguity;
- an index description is sufficient for the reader's routing decision;
- the material is really a glossary of independent definitions;
- one accepted taxonomy or containment model already owns the relationship; or
- there is no demonstrated reader or maintenance need for the comparison.

## Evidence and maturity

This is a candidate pattern mined from recurring structures in this
documentation corpus. [Documentation craft](../explainers/documentation-craft.md)
centrally distinguishes reader-need and reusable-guidance forms while its
individual form explainers retain local hard boundaries. [Documentation
audits](../explainers/documentation-audits.md) similarly distinguishes audit,
review, linting, verification, and remediation in one compact comparison.

These uses support recurrence and the proposed structure, but effectiveness has
not yet been evaluated independently. Keep the pattern in draft until use in
additional maintained corpora confirms that it reduces drift and improves
selection.

## Related patterns

- [Pattern library](pattern-library.md) provides maintained discovery,
  evidence, relationships, and lifecycle for a collection of patterns.
- [Documentation organization and
  discovery](../explainers/documentation-organization-and-discovery.md) explains
  how semantic adjacency, indexes, metadata, and paths support different
  discovery decisions.
- [Pattern explainer](../explainers/pattern.md) defines the evidence and
  maturity expected before a candidate is treated as established.
