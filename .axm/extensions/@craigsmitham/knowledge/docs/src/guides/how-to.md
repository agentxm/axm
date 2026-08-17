---
type: Guide
title: How-to guide
description: How to write goal-oriented directions for real work — user-problem framing, logical flow, adaptable steps, and links out for depth.
tags: [docs, how-to, guide, authoring, diataxis]
status: stable
sources:
  - id: diataxis-how-to
    resource: https://diataxis.fr/how-to-guides/
    title: Diátaxis — How-to guides
  - id: diataxis-how-to-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/how-to-guides.rst
    title: Diátaxis source — how-to-guides.rst
  - id: diataxis-tutorials-how-to
    resource: https://diataxis.fr/tutorials-how-to/
    title: Diátaxis — The difference between a tutorial and how-to guide
  - id: diataxis-tutorials-how-to-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/tutorials-how-to.rst
    title: Diátaxis source — tutorials-how-to.rst
  - id: johnson-diataxis
    resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
    title: Tom Johnson — What is Diátaxis (how-to pattern notes)
generated:
  by: claude/fable-5
  at: 2026-08-08T00:03:18Z
---

# How-to guide

Write **directions** that guide a competent reader through a problem or toward
a result. For what a how-to is and is not — and the tutorial boundary — read
[How-to explainer](../explainers/how-to.md).

Canonical principles below follow Diátaxis how-to guidance (goal focus,
real-world adaptability, omit the unnecessary, executable instructions,
logical sequence, flow, naming).

## Goal

A competent reader can complete the named task correctly under realistic
conditions — without a lesson, a catalog, or an essay getting in the way of
the work.

## Steps

1. **Name one goal from the user’s problem-field** — frame a human project or
   result (*how to calibrate the radar array*, *how to rotate the API token*),
   not operations the machinery exposes (*press Deploy to deploy*). Tools are
   means; the job defines what the guide covers — even when it cuts across
   subsystems.

2. **Title for exactly what the guide shows** — prefer *How to …* that encodes
   the outcome. Search engines and humans both need this cue.

3. **Assume competence; state preconditions only as needed** — the reader
   already knows what they want and can follow instructions. List access,
   tools, and prior skill briefly. Link a tutorial when basics may be missing;
   never re-teach them as the body (recipe ≠ cooking lesson).

4. **Write an executable approach (a contract)** — *if you face this
   situation, take these steps.* Steps are **actions**: physical acts **and**
   thinking or judgment. Solving a problem is not only button presses.

5. **Order for a logical sequence** — put first what later steps require, or
   what sets up the reader’s working environment or thinking. Order is not
   arbitrary even when two operations are technically commutative.

6. **Seek flow** — ground the sequence in how the user actually works and
   thinks: minimize thrashing between contexts and tools; avoid forcing them
   to hold unresolved thoughts longer than necessary; keep pace and rhythm
   steady. Aim for the guide that anticipates the next tool they need.

7. **Address real-world complexity** — adapt, do not script one demo. Use
   *if this, then that*, forks, overlaps, and alternate routes. How-tos are
   **not only linear procedures**; judgment is often required.

8. **Omit the unnecessary** — practical usability beats completeness.
   Start and end in a meaningful place and let the reader join the guide to
   *their* work. Leave options, history, and digression out of the path.

9. **Surface blockers and recovery** — prepare for the unexpected: name the
   failure signals that stop the goal under production-like conditions, and
   how to recover from them. The user owns risk; you still help them navigate
   it.

10. **Link out for depth** — reference for full flags/fields/inventories;
    explanation for *why*. Digression mid-task dilutes action; link instead.

11. **Verify on the real system** — walk the path against current behavior;
    fix drift before publish. Retire or rewrite when the path no longer works.

12. **Own the procedure** — one guide per goal; others link. Do not fork a
    second full copy that will drift.

## Language that fits

The characteristic language shapes and the title-grades check live in the
[How-to explainer](../explainers/how-to.md#language-that-fits-how-to); use them
as drafting checks rather than restating them here.

## Preconditions

- A bounded, testable goal (not an open-ended skill sphere such as *how to
  build a web application*)
- Clarity on role and assumed skill
- Access to the current system so steps can be verified

## Pitfalls

The diagnostic taxonomy of failure modes is owned by the
[How-to explainer](../explainers/how-to.md#failure-modes-common); review drafts
against it. Two production-time pitfalls to catch while writing:

- **Broken flow** — repeated context thrash, arbitrary order, or a rigid
  script where real work forks.
- **Multiple unrelated goals** packed into one undifferentiated document.

## Related

- [How-to explainer](../explainers/how-to.md)
- [Documentation craft guide](documentation-craft.md)
- [Tutorial guide](tutorial.md)
- [Reference guide](reference.md)
- [Explanation guide](explanation.md)
