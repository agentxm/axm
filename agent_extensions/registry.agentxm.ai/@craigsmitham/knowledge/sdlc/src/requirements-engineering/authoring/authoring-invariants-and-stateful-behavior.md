---
type: Guide
title: Authoring invariants and stateful behavior
description: Specifies rules that must hold across states, transitions, concurrency, and failure conditions. Use when an obligation must hold continuously rather than at a single trigger, or when retry, ordering, rollback, or partial failure could falsify it.
tags: [invariant, state, transition, concurrency, failure, requirements-engineering]
generated: { by: codex/gpt-6, at: 2026-11-22T01:50:08Z }
---

# Authoring invariants and stateful behavior

Start with a state the stakeholder must be able to rely on. Ask when they
could observe a violation, including while a change is underway or after a
failure. If the rule applies only when an event completes, say so. If it
must hold throughout the change, write down what has to remain true. Define:

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

Suppose a depot requires an existing reservation to keep its machine
assignment until a replacement is secured. Trace a replacement request
from the point of view of a dispatcher reading the reservation. If the
replacement fails, the old assignment should still be visible. If the
change succeeds, the dispatcher should see the new one. Try reading between
release and reassignment, then repeat the request after a lost reply.

A trace that ends with the right machine can still contain a moment when
the reservation appeared unassigned. Mark the exact observation that would
violate the draft. If a temporary gap is acceptable, ask who may see it and
for how long, then revise the rule and check the trace against that limit.
