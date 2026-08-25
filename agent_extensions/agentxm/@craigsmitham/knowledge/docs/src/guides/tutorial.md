---
type: Guide
title: Tutorial guide
description: How to write a learning-oriented tutorial with a bounded path and reliable first success.
tags: [docs, tutorial, authoring, how-to, diataxis]
status: stable
sources:
  - id: diataxis-tutorials
    resource: https://diataxis.fr/tutorials/
    title: Diátaxis — Tutorials
generated:
  by: claude/fable-5
  at: 2026-08-08T00:16:56Z
---

# Tutorial guide

Write a **lesson** someone can complete successfully. For what a tutorial is
and is not, read [Tutorial explainer](../explainers/tutorial.md).

## Goal

A newcomer can follow the document end to end and leave with a working result
and more confidence than when they started.

## Steps

1. **Show where the lesson is going** — one outcome, not a curriculum, framed
   as a shared journey (*In this tutorial we will create…*), not a
   presumptuous *you will learn…*.
2. **Choose a minimal path** — the smallest sequence that reaches that outcome
   reliably; cut optional branches.
3. **Set the scene briefly** — only what is needed to start (tools, sample
   project, assumptions). Defer catalogs to reference.
4. **Write concrete steps** — each step is an action the learner performs;
   show expected intermediate results where silence would strand them.
5. **Keep the path safe** — prefer defaults and happy path; handle only the
   failures that commonly block this lesson.
6. **Close the lesson** — confirm success; optionally point to a how-to or
   reference for real-world next steps (do not turn the ending into a manual).
7. **Walk the path yourself** (or have someone new try it) — fix missing steps
   before publishing.

## Language that fits

The characteristic language shapes live in the
[Tutorial explainer](../explainers/tutorial.md#language-that-fits-tutorials); use
them as drafting checks rather than restating them here.

## Preconditions

- An environment or sample the learner can actually use
- Confidence the happy path still works

## Pitfalls

The diagnostic taxonomy of failure modes is owned by the
[Tutorial explainer](../explainers/tutorial.md#failure-modes-common); review
drafts against it. Two production-time pitfalls to catch while writing:

- **Promissory framing** — opening with *you will learn…* instead of showing
  where we are going and what we will do.
- **Silent output** — steps that never narrate expected results, stranding
  the learner at the first surprise.

## Related

- [Tutorial explainer](../explainers/tutorial.md)
- [Documentation craft guide](documentation-craft.md)
- [How-to guide](how-to.md)
