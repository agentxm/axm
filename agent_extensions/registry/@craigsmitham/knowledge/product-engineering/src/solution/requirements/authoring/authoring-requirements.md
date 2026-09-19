---
type: Guide
title: Authoring requirements
description: Provides general guidance for writing singular, bounded, necessary, feasible, and assessable requirements at an appropriate subject and level. Use when drafting or rewriting a requirement that has no special quantitative, constraint, or stateful character, or when its obligated subject or abstraction level is unclear.
tags: [authoring, clarity, singularity, subject, allocation, feasibility, assessability, pe-solution]
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Authoring requirements

Write the obligation before optimizing the sentence.

- name one obligated subject;
- state the applicable condition or trigger;
- use an explicit normative verb consistent with local policy;
- describe an observable outcome, limit, or prohibition;
- define ambiguous terms, units, scope, and exceptions;
- preserve the source and rationale without embedding rationale as obligation;
- avoid implementation detail unless it is an accepted constraint;
- identify a credible verification approach and validation basis.

A good requirement is necessary, appropriate, unambiguous for its audience,
complete within its boundary, singular enough to decide and assess, feasible,
and verifiable. A good set is also consistent, sufficiently complete for its
declared scope, traceable, modifiable, and balanced across relevant concerns.

Avoid “and” when it joins independently decidable behavior, vague qualifiers
such as *fast* or *user-friendly*, passive voice that hides the subject, and
unbounded terms such as *all*, *never*, or *secure* without a defined context.

## Subject and level

The obligated subject is the thing that must satisfy the requirement; the level
is how far into the solution that subject sits. Use the project's own
architecture and domain language, and match the level to the decision at hand:

- state stakeholder or outcome needs without prematurely selecting a solution;
- state system obligations at the externally meaningful boundary;
- allocate obligations to lower-level subjects only when the allocation is an
  accepted decision or a necessary constraint;
- link refinements so lower-level detail does not erase the parent intent.
