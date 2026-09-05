---
type: Guide
title: Explanation guide
description: Use when readers need to understand a subject's context, connections, perspectives, or rationale; write bounded discussion without absorbing procedures or reference.
tags: [docs, explanation, authoring, how-to, diataxis]
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
generated:
  by: claude/fable-5
  at: 2026-08-26T14:02:36Z
---

# Explanation guide

Use this guide when readers need to **understand** a topic better through
reflection, context, and connection, not a runbook or catalog. For what
explanation is and is not, read
[Explanation explainer](../explainers/explanation.md).

Canonical principles below follow Diátaxis explanation guidance (connections,
context, *about* the subject, opinion and perspective, tightly bounded scope).

## Goal

After reading, the audience has a clearer mental model, knows main tradeoffs
and alternatives, and can approach related how-tos and reference with less
anxiety — not a longer checklist of steps or fields.

## Steps

1. **Name one understanding goal** — a real or imagined *why?* / *Can you
   tell me about …?* that bounds the page. Without a spine, explanation
   sprawls. Draw deliberate lines around a **topic** (an area of knowledge),
   not a task and not the whole product surface.

2. **Title as *about* the subject** — explicit or implicit *About …* (*About
   user authentication*, *About database connection policies*). The piece
   sits *around* the topic, not as a procedure to execute or a machine to
   inventory.

3. **Orient for study, not work** — write so the piece can be read **away
   from the product** (reflection after practice). Do not require hands on
   the console to make sense of the discussion.

4. **Provide context** — background that illuminates: design decisions,
   historical reasons, technical constraints, implications, and selective
   examples. Unfold what is implicit in how the system behaves when that
   aids grasp — not every fact the reference already owns.

5. **Make connections** — weave related ideas, other product areas, and
   (when useful) external analogies or industry practice. Understanding is
   a web; isolated fact dumps do not seal craft knowledge.

6. **Admit opinion and perspective** — weigh alternatives, counter-examples,
   and different approaches. Mark judgment clearly (*W is better here
   because…*, *Some prefer X; that can work, but…*). Separate opinion from
   hard system facts so the reader can trust both.

7. **Build the model with room to digress usefully** — definition,
   relationships, implications, diagrams, and “what if” only when they
   serve insight. Discursive form is allowed; a single brittle outline is
   not required — but every section still serves the central question.

8. **Keep explanation closely bounded** — do **not** absorb instruction or
   exhaustive technical description “while covering the topic.” Those jobs
   have homes: how-to and reference. Creeping procedures and field tables
   dilute reflection and hide the real owners of action and facts.

9. **Close with orientation** — where to go next for *doing* (how-tos) or
   *looking up* (reference). Optional further reading for deeper study.
   Do not turn the ending into a second runbook.

10. **Review for job drift** — if most of the page is numbered steps or
    parameter tables, retype or split. Test: would someone turn to this
    while *working* a task, or while *studying* away from the console?
    Work → reference or how-to; study of concepts → explanation.

## Language that fits

The characteristic language shapes live in the
[Explanation explainer](../explainers/explanation.md#language-that-fits-explanation);
use them as drafting checks rather than restating them here. One
production-specific cue: title the piece as *About …* (explicit or implicit)
to signal discussion of a topic, not a task.

## Preconditions

- Enough real context (design decisions, domain knowledge, history) to
  discuss honestly — invent no rationale
- Willingness to state tradeoffs and deferred choices without turning the
  page into a defense brief
- Clarity that the primary job is understanding, not shipping a task or
  completing an interface inventory

## Pitfalls

The diagnostic taxonomy of failure modes (scattered explanation, tutorial
overload, absorbed runbook or reference, unscoped essay, neutral-only false
discipline) is owned by the
[Explanation explainer](../explainers/explanation.md#failure-modes-common);
review drafts against it. Two production-time pitfalls to catch while
writing:

- **Work-mode framing** — written as if the reader is mid-task and needs
  commands now, rather than as study material for later grasp.
- **Starving both jobs** — pasting field catalogs or option lists into the
  discussion leaves reference interrupted by digression and explanation
  without room to develop.

## Related

- [Explanation explainer](../explainers/explanation.md)
- [Documentation craft guide](documentation-craft.md)
- [How-to guide](how-to.md)
- [Reference guide](reference.md)
- [Tutorial guide](tutorial.md)
