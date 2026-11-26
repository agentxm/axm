---
name: stabilize
description: Stabilize a codebase or specified scope by correcting failures and material weaknesses in behavior or engineering feedback.
disable-model-invocation: true
---

Restore dependable behavior and trustworthy engineering feedback in the
requested scope. Address concrete failures or material weaknesses, including
recurring defects, security weaknesses, flaky tests, broken builds, unreliable
environments, and verification gaps that obstruct safe change.

For opportunity questions, assess candidates and their tradeoffs without
implementing them. For change requests, carry the requested outcome through
implementation and verification within the authorized scope.

Establish intended behavior, affected consumers, applicable requirements,
and the relevant baseline. Current behavior may contain the defect; preserve
live obligations rather than freezing every observed result. Distinguish a
reproduced failure, a supported risk, and an unconfirmed hypothesis.

Choose a bounded correction informed by the cause and consequence. Urgent
mitigation can precede complete diagnosis; distinguish containment from a
durable correction and keep remaining risk explicit. Account for transition,
operating, and ownership costs. Keep unrelated restructuring separate unless
it is needed to make the correction safely.

Use evidence that can discriminate the failure or weakness from the intended
result. Establish sufficient confidence for the affected behavior without
requiring whole-repository coverage or perfection. Tests and builds should
give attributable, repeatable feedback in relevant environments. Retries,
quarantine, skips, weakened assertions, and suppressed warnings do not by
themselves establish resolution.

Complete affected configuration, tests, documentation, and operational
guidance. Where justified, prevent recurrence through a focused check,
clearer ownership, or removal of the underlying failure mechanism; additional
automation must earn its maintenance cost.

Report the correction and evidence, preserved obligations, material costs,
and remaining uncertainty or follow-up. Do not claim production recovery from
local checks alone. Stop when the bounded outcome is supported, or explain
why further intervention is unjustified or requires missing evidence.
