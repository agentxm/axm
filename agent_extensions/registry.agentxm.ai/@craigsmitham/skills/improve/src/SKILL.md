---
name: improve
description: Improve a codebase or a specified part with evidence-backed gains in fitness for its intended purpose.
disable-model-invocation: true
---

Improve the requested scope's fitness for its intended purpose, with a
worthwhile gain in the qualities that matter to its users, maintainers,
or operators.

For opportunity questions, assess candidates and their tradeoffs without
implementing them. For change requests, carry the requested outcome through
implementation and verification within the authorized scope.

Select the quality to improve from the user's priorities and the system's
context, and establish a relevant starting baseline. Name applicable
requirements, affected consumers, and acceptable tradeoffs. Preserve required
behavior and existing obligations unless explicitly superseded; existing
defects need not be preserved.

Choose a bounded intervention whose expected benefit justifies transition,
operating, and ongoing maintenance costs. Keep intentional behavior changes
distinguishable from restructuring. Establish confidence proportionate to
the change's risk rather than requiring unrelated cleanup or perfect coverage.

Evidence should fit the claim. Performance gains need representative
measurements; maintainability gains may use concrete change scenarios and
dependency reasoning. Passing tests can support behavior preservation without
establishing that a design is better. Avoid selecting goals merely because a
metric is easy to collect or a style is preferred.

Complete affected configuration, tests, documentation, and operational guidance.
Remove superseded or transitional machinery when its obligations end; name
remaining work and exit conditions otherwise. Where worthwhile, retain a
proportionate way to detect recurrence or preserve the gain.

The result should have evidence supporting the claimed improvement over
the starting point, with material costs, tradeoffs, and uncertainty made
explicit. Distinguish demonstrated improvement from expected benefit. Stop
when the selected outcome is supported; no change is needed when no worthwhile
improvement is justified.
