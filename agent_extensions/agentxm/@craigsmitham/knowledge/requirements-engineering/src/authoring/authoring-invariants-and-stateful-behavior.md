---
type: Guide
title: Authoring invariants and stateful behavior
description: Specifies rules that must hold across states, transitions, concurrency, and failure conditions.
tags: [invariant, state, transition, concurrency, failure]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
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
