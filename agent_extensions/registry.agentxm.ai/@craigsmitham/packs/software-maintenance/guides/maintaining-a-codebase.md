# Maintaining a codebase

Use this guide when choosing and sequencing maintenance in an existing codebase,
or establishing a recurring maintenance practice. The aim is a worthwhile,
supported improvement in dependability, supportability, understandability, or
cost of change. Adapt the guidance to the task's consequence and scope.

## Establish the decision

Start with the scope, intended purpose, affected consumers, applicable
requirements, and the desired outcome. Establish access to the evidence needed
for that decision: source and history, build and test results, dependency and
support information, operational observations, or maintainer experience.
State gaps that limit the conclusion; missing telemetry is not proof of disuse.

An opportunity question requests assessment and recommendations. An
implementation request authorizes the requested bounded change and its necessary
verification. If you use the [maintenance pack](../README.md), choose
`assess` for the read-only assessment. Publishing, deployment, consumer
retirement, and other external actions follow the authority of the actual task.

Required behavior constrains maintenance. Existing behavior may contain defects,
and requirements may be explicitly superseded. Identify that distinction rather
than silently preserving a defect or weakening an obligation to fit the code.

## Choose worthwhile work

Consider relevant behavior and data integrity, security, verification and
delivery, lifecycle and compatibility, structure, unnecessary burden, operations,
and knowledge or ownership. Scope the investigation to the decision; do not
infer whole-system health from a narrow scan.

Combine observed failures, history, expected changes, and maintainer friction
with automated signals. A frequently changed subsystem with recurring failures
can warrant attention before an equally complex but stable area. Static smells,
age, or code size are investigation cues, not sufficient reasons to intervene.

A supported finding connects a concrete location and evidence to a consequence,
an obligation to preserve, and a plausible response. Compare the response with
retention, including transition effort, operational effects, coupling, consumer
work, and continuing ownership. Keep defects, vulnerabilities, technical debt,
and enhancement opportunities distinguishable even when their causes overlap.

Prioritize consequence, recurrence, expected future change, net benefit, risk,
and confidence. Urgent failures and support deadlines can override ordinary
cost-benefit ordering. Prefer a small actionable selection to an unranked smell
inventory; preserve the requested breadth and identify unassessed areas.

For recurring operational work, ask the operator which manual steps they
repeat as the service grows and what lasting improvement would remove that
work.[^toil]

Separate supported findings from hypotheses needing investigation. Retaining
the current arrangement is a valid decision when benefit is insufficient or
uncertainty prevents a responsible intervention.

For example, suppose a maintainer asks whether they can retire an old importer.
The scheduled job now calls its replacement, but a support runbook still tells
operators to use the old command to replay failed imports. Check a recent
replay with the people who handle failures. If they still need it, identify
what the replacement must do before they can switch. If you were asked only
for an assessment, return that dependency and the evidence for it here.

## Sequence by prerequisites

| Situation | Useful ordering | Reason to reconsider |
| --- | --- | --- |
| Active failure or material exposure | Stabilize or apply the necessary refresh first. | Immediate mitigation may leave diagnosis and durable correction open. |
| Relevant checks are unreliable | Establish sufficient trustworthy feedback before substantial restructuring. | A small preparatory change may be needed to make the behavior testable. |
| A subsystem can be retired | Resolve obligations and consumers, then prune before investing in improvement. | Retained consumers may require a limited migration or boundary change first. |
| A supported dependency supplies a replacement capability | Refresh, then simplify the integration and remove superseded machinery. | Adoption and support costs may outweigh the substitution. |
| An unnecessary integration drives an upgrade | Prune or simplify first, then reconsider the remaining refresh. | External consumers may still need the integration. |
| Entangled responsibilities prevent safe change | Make the smallest useful modularization, then perform the selected intervention. | Added interfaces may cost more than the isolation they provide. |
| Old and new paths coexist | Complete consumer migration, verify compatibility, then remove the old path. | Persistent state or support commitments may require a longer transition. |

Establish a relevant baseline and enough evidence for the proposed change.
Whole-repository perfection is not a prerequisite. Small, independently
verifiable increments make causes and effects easier to distinguish. Keep
intentional behavior changes recognizable alongside restructuring.

Where persistent state changes, assess recovery or forward repair as well as
source rollback. Where information or authority is insufficient, name the exact
missing decision or evidence and continue independent work that remains valid.
Reassess after meaningful changes: earlier findings may no longer apply.

## Complete an intervention

Completion concerns the affected system, including its supporting artifacts.
Update configuration, tests, examples, documentation, and operational guidance
where obligations changed. Remove dependencies, adapters, flags, compatibility
paths, and delivery machinery whose sole purpose ended.
Where a procedure changed, check that the operator can find and follow the
current directions.[^docs]

If a transition remains open, identify remaining consumers, an owner or the
unresolved ownership decision, and a concrete exit condition. Do not describe
an installed replacement as a completed migration while its predecessor still
requires support.

For the importer, try replaying a failed row for customer `007` in a test
environment. Suppose the replacement reports success but stores the ID as
`7`. An operator following the runbook still cannot recover the record for
`007`. Keep the old path available until the replacement preserves the ID
and the operator can recover the expected record using the revised runbook.

Report the starting point, actual change, evidence, material costs and tradeoffs,
and remaining uncertainty. A passing build does not establish external
compatibility; passing regression tests do not establish better design; local
checks do not establish production recovery. Claims should stay within the
evidence's scope.

Prevent recurrence where justified by a focused regression check, a clearer
owner or contract, or removal of the generating mechanism. A new checker,
generator, or automation must justify its own maintenance burden.

## Maintain over time

Combine small maintenance during ordinary development with a regularly budgeted
review of worthwhile findings and periodic lifecycle reviews. Choose cadence
from repository activity, consequence, and support deadlines. There is no
universal interval or allocation percentage imposed by this pack.

Maintainers own priorities and support commitments. The person or agent doing
the work owns accurate evidence and completion reporting within the assignment.
Consumer owners participate where contracts or migrations affect them. Keep
unresolved authority explicit instead of inventing an owner or commitment.

Use existing issue tracking or project notes when persistent tracking is
authorized. Record the problem, consequence, evidence, owner, proposed response,
and a reconsideration trigger. Include accepted or deferred debt and its reason;
revisit it when assumptions change. Assessment alone does not create tickets.

Measure outcomes related to the selected problem: recurring failures, flaky-test
rate, feedback delay, unsupported components, unfinished migrations, recurring
manual effort, or effort required for representative changes. Size and complexity
measures can support investigation but do not form a universal health score.
If the intended gain is developer productivity, pair activity counts with
evidence of what maintainers can now accomplish.[^space]

Revisit the intervention after enough relevant use to judge its effect.
Distinguish a demonstrated gain from an expected one and record material
regressions. Repeated maintenance under unchanged evidence should settle;
alternating between abstraction and inlining without new evidence is churn.
Stop when the selected outcome is supported or further intervention is unjustified.

## Foundations and limits

The [pack's source discussion](../README.md#sources-and-rationale) explains
the engineering foundations. This guide combines those practices. Refine
local choices from observed use and report what the evidence establishes.

[^toil]: Vivek Rau, [Eliminating Toil](https://sre.google/sre-book/eliminating-toil/).
[^docs]: DORA, [Documentation quality](https://dora.dev/capabilities/documentation-quality/).
[^space]: Nicole Forsgren and colleagues, [The SPACE of Developer Productivity](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/).
