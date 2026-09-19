---
type: Guide
title: Authoring invariants and stateful behavior
description: Specifies rules that must hold across states, transitions, concurrency, and failure conditions. Use when an obligation must hold continuously rather than at a single trigger, or when retry, ordering, rollback, or partial failure could falsify it.
tags: [invariant, state, transition, concurrency, failure, pe-solution]
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
---

# Authoring invariants and stateful behavior

An invariant states a condition that must remain true over a declared scope,
including relevant transitions and failure paths.

Define:

- the state or resources covered and the boundary at which the rule applies;
- allowed and forbidden states or relationships;
- transitions that may affect the rule;
- concurrency, retry, ordering, rollback, recovery, and partial-failure behavior;
- tolerated transient states, if any, and their maximum duration;
- enforcement and observation points without confusing them with the obligation.

Use state diagrams, transition tables, predicates, or temporal notation when
prose cannot express the rule unambiguously. Include counterexamples and edge
cases that could falsify the invariant.

An enforcement mechanism is design. Keep it linked but distinct unless a
specific mechanism is itself an accepted constraint.

## Worked continuation

The [Northbank commitment specimens](northbank-commitment-requirements.md)
state allocation, atomic replacement, and replay obligations with explicit
scope. The replacement failure preserves allocation state without claiming
that a broken original machine is usable. The linked code case selects a
transaction mechanism separately; the requirement itself does not acquire a
lock implementation merely because that design was chosen.
