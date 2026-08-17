---
type: Explanation
title: Dependency direction and change
description: How information hiding and dependency direction limit the effects of likely change and preserve policy ownership.
tags: [dependencies, information-hiding, modularity, change, coupling]
status: draft
sources:
  - id: parnas-decomposition
    resource: https://doi.org/10.1145/361598.361623
    title: D. L. Parnas — On the Criteria To Be Used in Decomposing Systems into Modules
generated:
  by: codex/gpt-5
  at: 2026-08-15T15:20:54Z
---

# Dependency direction and change

A dependency means one element's correctness or ability to change is affected
by another. Architecture should make the consequential dependencies deliberate,
not merely minimize their count.

Parnas showed that modules organized around hidden design decisions can be more
changeable and comprehensible than modules organized around processing
steps.[^parnas-decomposition] The enduring principle is to hide volatile
knowledge behind a stable responsibility.

Useful dependency questions include:

- Which policy is more stable?
- Which element owns the abstraction?
- What knowledge of the provider leaks into the consumer?
- Can either side change without coordinating a release?
- Does a convenience dependency reverse an intended authority boundary?

Dependency direction should preserve policy ownership. High-level decisions
should not depend directly on volatile mechanisms when an owned abstraction can
separate them. This is not a rule that every dependency must point toward a
particular layer; the correct direction follows the system's actual authority
and likely change.

Cycles are most dangerous when they indicate mutual policy ownership or force
coordinated change. A mechanical cycle can be harmless, while an apparently
acyclic design can remain tightly coupled through shared assumptions.

[^parnas-decomposition]: Parnas compares decomposition by processing step with
    decomposition around information-hiding modules and evaluates their effects
    on change and comprehensibility.
