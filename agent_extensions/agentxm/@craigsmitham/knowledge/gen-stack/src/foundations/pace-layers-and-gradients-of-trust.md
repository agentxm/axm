---
type: Principle
title: Pace layers and gradients of trust
description: How different rates of change and levels of confidence determine containment, observability, reversibility, and review.
tags: [pace-layers, trust, change, containment, observability, reversibility]
---

# Pace layers and gradients of trust

Let each layer change at the speed its consequences and evidence justify.

Requirements, public contracts, persistent data, and conservation boundaries
usually change more slowly than generated implementation. Evaluators and
tooling may change at another pace. Treating all of them as equally disposable
either fossilizes fast layers or exposes slow assets to avoidable churn.

Trust is also graduated. A new generator, model, evaluator, or implementation
path does not need universal trust before use, but its authority and blast
radius must match the confidence available. Increase constrainability,
containment, observability, reversibility, independent evaluation, and review
as a change approaches a slower or more consequential boundary.

Useful questions are:

- Which assets must survive this replacement?
- Which Requirement or contract authorizes the changed behavior?
- How will a failure be detected, contained, and reversed?
- What operational knowledge exists only in the current implementation or the
  people who maintain it?
- Which independent witness would expose a shared misunderstanding?

The aim is not permanent layers. It is a gradient of disposability in which
the cheapest layers can be regenerated and the load-bearing layers change
through explicit authority.
