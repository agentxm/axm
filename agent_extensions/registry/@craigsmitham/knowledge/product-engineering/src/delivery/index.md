# How to ship it

How does a change reach production safely and predictably?

The path a change travels from accepted work to released software. This section
owns the movement of change: the record that keeps one concern recoverable while
it travels, and the practices that decide how often and how safely it moves. How
the system behaves once change has arrived belongs to
[How to run it](../operations/). Constructing and verifying the change itself
belongs to [How to build it](../engineering/).

For broader context, follow
[Check project commitments](../reading-product-engineering.md#check-project-commitments).
Connect the work being coordinated to capability, resource, and forecast
judgments, then distinguish completion evidence from product results.

## What this section holds today

| Area | Status |
| --- | --- |
| Work management | Populated: [Work items](work-items/) |
| Flow | Not yet written |
| Build and release | Not yet written |
| Delivery automation | Not yet written |

## Track the work that travels

- [Work items](work-items/) - The portable craft of Operational Incident
  Records, Defect Reports, and Changes as durable case records: a taxonomy, a
  content contract, evidence and provenance, identity and relationships,
  lifecycle and completion, verification, host mapping, and portable templates
  for each role.

Nothing here prescribes a tracker. Host mapping is treated as an adaptation of a
portable contract onto whatever system a team already runs.

## Shared foundations

- [Glen Alleman's performance-based project management: capabilities, credible plans, and evidence of progress](../foundations/alleman-performance-based-project-management.md) — How Glen Alleman's five project-management principles connect needed capabilities, plans, resources, risk, and demonstrated progress, with an interpretation for forecasting and revising product commitments.

- [Shape Up: Ryan Singer's approach to shaping, betting, and building](../foundations/shape-up.md) — How Ryan Singer's Shape Up connects appetite, shaped solution concepts, bounded bets, and team ownership to finishing meaningful work, with explicit distinctions between investment, scope, completion, and outcome evidence.

## What is not yet written

Work items are the only populated subtree. The other three areas have no
local concepts. Shape Up supplies context for bounded commitments and cadence;
Alleman supplies context for project plans, forecasts, and evidence of progress.
The applied guidance below remains unwritten.

Flow would own batch size, branching and integration strategy, review gates as a
queueing decision rather than as a pipeline step, work in progress, and release
cadence.

Build and release would own versioning and artifact identity as a product
decision, environment topology, and rollout strategy, meaning the ways exposure
is staged and withdrawn.

Delivery automation would own the definition and execution of automated
workflows, the recurring arrangements they take such as pipelines, quality
gates, and promoting one identifiable artifact through environments, and the
practices of continuous integration, delivery, and deployment.

## Boundaries

| Concern | Owner |
| --- | --- |
| The record contract for an operational incident | [Work items](work-items/incidents/), in this section |
| Detection, response, command, and post-incident review | [How to run it](../operations/), which claims the scope but holds no concepts yet |
| The obligations a Change carries | [Requirements](../solution/requirements/) |
| Constructing and verifying the change | [How to build it](../engineering/) |
| What a repository task means and who may invoke it | [How to build it](../engineering/), as the repository execution surface |

The first two rows are one split stated twice, because it is easy to get wrong.
This section owns what an incident record must contain and how it stays
recoverable. It does not own thresholds, severities, escalation, response roles,
or the review that follows an incident.

The last row is the other half of the execution-surface split, and it is stated
from both sides for the same reason. How to build it owns what a repository task
means and who may invoke it; this section owns when a workflow runs it and what
happens to the result. A task interface honest about its contract is what makes
a workflow able to call it, so neither side restates the other.
