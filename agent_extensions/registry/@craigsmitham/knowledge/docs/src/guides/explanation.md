---
type: Guide
title: Explanation guide
description: Use when authoring or revising an explanation; develop a bounded conceptual structure, consequential distinctions, and examples that support explicit reader understanding outcomes.
tags: [docs, explanation, authoring, conceptual-structure, distinctions, examples, evidence, review, how-to, diataxis]
status: stable
sources:
  - id: diataxis-explanation
    resource: https://diataxis.fr/explanation/
    title: Diátaxis — Explanation
  - id: diataxis-explanation-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/explanation.rst
    title: Diátaxis source — explanation.rst
  - id: diataxis-ref-explanation
    resource: https://diataxis.fr/reference-explanation/
    title: Diátaxis — Reference vs explanation
  - id: diataxis-ref-explanation-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/reference-explanation.rst
    title: Diátaxis source — reference-explanation.rst
  - id: diataxis-start
    resource: https://diataxis.fr/start-here/
    title: Diátaxis — Start here
  - id: johnson-diataxis
    resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
    title: Tom Johnson — What is Diátaxis (explanation pattern notes)
  - id: mintlify-content-types
    resource: https://www.mintlify.com/guides/content-types
    title: Mintlify — Content types (explanation notes)
  - id: explanation-principles
    resource: ../explainers/explanation.md
    title: Explanation explainer — How explanation builds understanding
generated:
  by: codex/gpt-6
  at: 2026-09-09T02:13:49Z
---

# Explanation guide

Use this guide when authoring or revising documentation whose primary job is to
help readers understand a subject. It applies the principles in
[Explanation explainer](../explainers/explanation.md#how-explanation-builds-understanding),
which supplies the rationale and limits.[^explanation-principles]

## Goal

Produce an explanation in which readers can find the support needed to explain
important relationships, distinguish neighboring concepts, and reason about
relevant tradeoffs. Keep that purpose recognizable while linking to procedures
and reference for other reader needs.

## Preconditions

- An identified audience and understanding question, or enough context to draft
  and refine them.
- Access to the authoritative material needed to support the subject's claims;
  gaps remain explicit until researched.
- Clarity about the document's authority: explanation of a field, an argued
  perspective, or an explanation of decisions already made by its owner.

## Steps

1. **Define the understanding outcomes.** Name the audience, what they likely
   know, and the question that brings them to the page. State a few things they
   should be able to explain, distinguish, or reason about afterward. For
   example, “explain why a model boundary and a business boundary need not
   align” gives an author more direction than “understand architecture.” Bound
   the subject around those outcomes; identify adjacent topics to link out to.

2. **Map the concepts before outlining.** Identify essential concepts, their
   dependencies, relationships, and likely confusions. Notice where readers
   must classify something, choose a scope, or compare perspectives. Use this
   working map to find gaps; it need not become a published diagram. Cover what
   the reader needs to reason about the subject without expanding into an
   exhaustive vocabulary catalog.

3. **Establish the source basis.** Consult primary definitions and method owners
   where appropriate, and seek relevant alternatives when the subject is
   contested. Record which source supports which claim. Separate an author's
   account of their method from evidence of its effectiveness. Use the actual
   text supporting a claim; a search result, synopsis, or unread recording does
   not warrant a claim about the full source. Identify your synthesis and any
   unresolved disagreement instead of silently merging terminology.

4. **Build an outline that reveals the subject.** Group related concepts and
   introduce prerequisites before relying on them. Use recognizable subject
   terms in headings where they help orientation. Include distinctions where
   the reader needs them. A conceptual explanation may progress from
   foundations through relationships to implications; a historical explanation
   may need another order. Choose the structure from the reader outcomes rather
   than copying a previous document's sections. Use a subject title with an
   implicit or explicit “About.”

5. **Develop the consequential distinctions and judgments.** Explain what each
   central concept means, why it matters, how it relates to others, and where
   its interpretation changes. For classifications or framing choices, supply
   defining criteria, evidence to examine, implications, and limits. Distinguish
   heuristics from rules and tentative judgments from established facts. Show
   what confusion would lead a reader to infer incorrectly. These are coverage
   questions for the author, not mandatory subheadings for every concept.

6. **Choose examples that expose the reasoning.** Select a running example when
   several concepts benefit from shared context; use contrasting examples when
   variation or limits are the point. At each use, identify the new relationship
   or inference the example makes visible. Include a changed circumstance that
   changes the conclusion where helpful. Label fictional scenarios, preserve
   relevant assumptions, and avoid implying that one implementation is
   inevitable. Add a table or diagram when comparison, boundaries, or causality
   become clearer through it.

7. **Connect the concepts to consequences and limits.** Explain what follows
   from a concept, what remains undecided, and which other considerations matter.
   Discuss applicability, costs, alternatives, and complementary approaches
   when they affect understanding. Attribute perspectives and make your own
   judgment visible. Keep the discussion readable away from an active task,
   while allowing criteria and practical implications that illuminate why.
   Link to the owner of an operational procedure or authoritative inventory.

8. **Provide useful reading routes.** Connect readers to material for deeper
   understanding, doing, and lookup. For selected sources, explain what question
   each helps answer or which perspective it develops. Prefer a small relevant
   selection over an undifferentiated bibliography. Keep attribution near the
   claims it supports and represent the reviewed source's scope honestly.

9. **Review against the understanding outcomes.** For each outcome, locate the
   passage or example that supports it. Check that the reader has the
   prerequisites to follow the reasoning. Try a contrasting case: does the
   explanation support a defensible interpretation when a relevant condition
   changes? Recheck source claims, terminology, example assumptions, links, and
   any host metadata. If the document makes an effectiveness claim about reader
   understanding, obtain reader evidence; author review alone cannot prove it.

10. **Review purpose and proportion.** Read the headings as a conceptual map,
    then read the body as a connected discussion. Expand an unsupported
    distinction; trim repeated definitions, decorative examples, and digressions
    that do not serve the outcomes. Judge tables and lists by what they do, not
    how many appear. If the primary job has become executing a procedure or
    looking up facts, move that material to the appropriate document and keep
    the explanatory connection. Refresh indexes and previews when the canonical
    title or description changes, then run the applicable documentation checks.

## Language that fits

The characteristic language shapes live in the
[Explanation explainer](../explainers/explanation.md#language-that-fits-explanation);
use them as drafting checks rather than restating them here. One
production-specific cue: title the piece as *About …* (explicit or implicit)
to signal discussion of a topic, not a task.

## Pitfalls

Use the [explainer's failure modes](../explainers/explanation.md#failure-modes-common)
to diagnose weaknesses. When revising, match the response to the problem:

- If the outline hides the subject, revisit the concept map before polishing
  individual sentences.
- If definitions are present but the reader cannot distinguish the concepts,
  add the relationship, boundary, or contrasting case that is missing.
- If examples feel repetitive, identify their explanatory contribution and
  combine or remove those that add none.
- If source accounts conflict, preserve the disagreement and explain its
  consequence before offering a synthesis.
- If the page looks structured, inspect its purpose before reclassifying it.
  A comparison table or classification criterion can carry essential reasoning.

## Related

- [Explanation explainer](../explainers/explanation.md)
- [Documentation craft guide](documentation-craft.md)
- [How-to guide](how-to.md)
- [Reference guide](reference.md)
- [Tutorial guide](tutorial.md)

[^explanation-principles]: [Explanation explainer](../explainers/explanation.md#how-explanation-builds-understanding), this bundle's practical elaboration of explanation craft.
