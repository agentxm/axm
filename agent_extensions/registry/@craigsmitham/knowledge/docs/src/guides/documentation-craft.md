---
type: Guide
title: Documentation craft guide
description: Use when writing or revising one document; choose an appropriate form, account for established principles and patterns, and keep its reader job clear without inventing host layout or metadata rules.
tags: [docs, craft, authoring, how-to, diataxis]
status: stable
sources:
  - id: documentation-craft
    resource: ../explainers/documentation-craft.md
    title: Documentation craft
  - id: principle
    resource: ../explainers/principle.md
    title: Principle explainer
  - id: pattern
    resource: ../explainers/pattern.md
    title: Pattern explainer
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T14:02:36Z
---

# Documentation craft guide

Use this when you need to **write or revise one document** and want a
portable process. For *why* the four reader-need forms exist and the quality principles
behind them, read [Documentation craft](../explainers/documentation-craft.md) first. For
iterative remediation across a corpus, use
[Documentation workflow guide](documentation-workflow.md).

## Goal

Ship (or improve) a document whose **primary reader job** is clear to someone
who opens it cold and whose structure respects any established principle or
pattern that applies.

## Steps

1. **Name the reader need** — learning, doing, looking up, or understanding.
2. **Choose the reader-need form** from the craft table in
   [Documentation craft](../explainers/documentation-craft.md): tutorial,
   how-to, reference, or explanation. Keep one primary job and link adjacent
   jobs rather than letting them blur.
3. **Check reusable guidance** — when a maintained principle governs this
   class of judgment, use its good, direction, scope, and tensions. When a
   pattern matches the recurring problem, use its context, solution, and
   consequences. Do not force either form onto a situation outside its field
   or applicability conditions.
4. **Open the paired concepts** — the explainer states what good looks like;
   the guide supplies the authoring process. For reusable guidance, use the
   [Principle explainer](../explainers/principle.md) and [Principle
   guide](principle.md), or the [Pattern explainer](../explainers/pattern.md)
   and [Pattern guide](pattern.md).
5. **Bound and preview the job** — state the purpose or goal near the top;
   list non-goals; link owners of adjacent jobs instead of copying them. For
   an action-oriented document, make its context-free description name both
   the supported outcome and the situation, event, symptom, or reader intent
   that makes it relevant. Do not substitute preconditions for that selection
   condition.
6. **Draft for the form** — follow the matching guide; keep form matched to
   job (steps vs inventory vs discussion).
7. **Place and name deliberately** — when the document joins a collection,
   use [Organizing and naming documentation](organizing-and-naming-documentation.md)
   to choose the physical axis, preserve semantic adjacency, and give its file
   and title standalone meaning.
8. **Apply host rules last** — paths, indexes, metadata, and validators only
   as the repository already defines them. Do not invent a portable schema.
9. **Check** — can a stranger tell the job and, for an action document, when
   to choose it from its title and description alone? Would another form fit
   better? Are stale commands or duplicated procedures present?

## Preconditions

- Enough source material (product behavior, design decisions, or an existing
  draft) that you are not inventing policy
- Access to any local documentation guidelines the host already uses

## Pitfalls

- Starting from a folder path instead of a reader need
- Mixing a lesson, a runbook, and a reference into one undifferentiated page
- Treating an artifact name as permission to blur its reader jobs
- Applying a principle or pattern by name without checking its scope, context,
  and tensions
- Encoding monorepo-only commands or layout as if they were universal craft

## Related

- [Documentation craft](../explainers/documentation-craft.md)
- [Documentation workflow](../explainers/documentation-workflow.md) · [Documentation workflow guide](documentation-workflow.md)
- [Documentation organization and discovery](../explainers/documentation-organization-and-discovery.md) · [Organizing and naming documentation](organizing-and-naming-documentation.md)
- [Documentation quality](../explainers/documentation-quality.md)
- [Tutorial guide](tutorial.md)
- [How-to guide](how-to.md)
- [Reference guide](reference.md)
- [Explanation guide](explanation.md)
- [Principle explainer](../explainers/principle.md) · [Principle guide](principle.md)
- [Pattern explainer](../explainers/pattern.md) · [Pattern guide](pattern.md)
- [Pattern library](../patterns/pattern-library.md)
