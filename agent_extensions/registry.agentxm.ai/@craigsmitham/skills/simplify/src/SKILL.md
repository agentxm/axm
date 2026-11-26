---
name: simplify
description: Simplify retained software capabilities through more direct implementation, suitable reuse, and appropriate consolidation.
disable-model-invocation: true
---

Reduce the total maintenance burden of retained capabilities in the requested
scope. Establish their intended purpose, live obligations, affected consumers,
and the concrete burden that a change would reduce.

For opportunity questions, assess candidates and their tradeoffs without
implementing them. For change requests, carry the requested outcome through
implementation and verification within the authorized scope.

Consider more direct implementation, removal of unnecessary indirection,
suitable capabilities in the codebase or platform, and consolidation of
genuinely shared knowledge. An abstraction may need to be inlined or narrowed;
useful duplication and independent policies can remain. Similar implementations
do not necessarily express the same rule, and recency or frequency does not
establish the authority of conflicting representations.

Judge alternatives against actual contracts, operational guarantees, and
intended uses. Account for adoption, migration, coupling, operating costs,
and ongoing ownership, including burden shifted to consumers. Verify capability
claims against authoritative information for the relevant versions. An upgrade
or new dependency has its own transition and support costs.

Choose a bounded intervention with a worthwhile net benefit over retention.
Preserve required behavior and justified variation, keep case-specific policy
with its owners, and maintain evidence sufficient for the proposed change.
Fewer lines, files, or dependencies alone do not establish simplification.

Leave a coherent integration with obsolete supporting machinery removed and
affected configuration, tests, documentation, and operational guidance updated.
When a migration is incomplete, name what remains and its exit condition.
Prevent recurrence where a proportionate change addresses its cause, without
adding machinery whose upkeep exceeds the benefit.

Explain what became easier to understand, maintain, or operate and the evidence
for that claim. Distinguish demonstrated gains from expectations and report
material costs and uncertainty. Make no change when a suitable alternative
offers no worthwhile benefit; do not broaden applicability speculatively.
