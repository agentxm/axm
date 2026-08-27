# Software work items

Tool-neutral concepts and authoring guides for exactly four first-class roles:
Operational Incident Record, Defect Report, Change Specification, and Bugfix
Specification. Use the chooser below to select one role, then combine
its type-specific guide with only the common guides that the requested action
needs. A tracker such as Linear, GitHub, Jira, or Azure Boards supplies storage
and workflow mechanics; it does not redefine the semantic artifact.

For the standing model of work that can coordinate several items and item
types, see [Process](../processes/process.md) and [Defining a
Process](../processes/defining-a-process.md). A work item preserves one case; it does not
become the Process merely because a tracker supplies states or automation.

## Choose the work item

| Situation | Use | Do not infer |
| --- | --- | --- |
| Current or imminent service impact meets the local coordinated-response threshold | [Operational Incident Record](operational-incident-records.md) · [recording guide](recording-operational-incidents.md) | Root cause, permanent correction, or closure |
| An observation, concern, or static finding may violate an accepted expectation | [Defect Report](failures-defects-and-defect-reports.md) · [recording guide](recording-defect-reports.md) | Confirmed Defect, Bug, priority, or fix |
| Investigation identified a Bug and correction is authorized | [Bugfix Specification](bugs-and-bugfix-specifications.md) · [writing guide](writing-bugfix-specifications.md) | That its Defect Reports can be replaced or closed |
| A proposed or authorized System or Architecture change has a recognizable boundary | [Change Specification](change-specifications.md) · [writing guide](writing-change-specifications.md) | Acceptance of its Requirements, Architecture, Design, priority, or implementation |

Keep an unbounded request as a Signal or source record. Use [Investigating
possible defects](investigating-possible-defects.md) when only uncertainty
reduction is authorized or a possible Defect needs discriminating evidence;
investigation is an activity, not another role or prescribed artifact. Tasks,
stories, epics, and similar records are host-native planning mechanics outside
the Gen Stack taxonomy. A Change Specification or Bugfix Specification may
coordinate them when implementation tracking is needed.

## Compare completion by role

Completion is purpose-relative, not a universal `Done` state. Use this routing
summary, then apply the linked role guide and the shared [identity,
relationships, lifecycle, and completion
model](maintaining-work-item-identity-relationships-and-lifecycle.md).

| Role | Complete for the next authorized action | Complete for verified closure | Does not universally require |
| --- | --- | --- | --- |
| [Operational Incident Record](recording-operational-incidents.md#completion-criteria) | Current impact, control, command, next action, and handoff are recoverable | The local exit boundary is evidenced, closure is authorized, and residual recovery or follow-up is owned | Root cause or permanent correction |
| [Defect Report](recording-defect-reports.md#completion-criteria) | The discrepancy, evidence boundary, uncertainty, and next route are actionable | An authorized disposition is evidenced; any claimed correction is verified for its stated conditions | Reproduction, diagnosis, a Bug, or a fix |
| [Change Specification](writing-change-specifications.md#completion-criteria) | The bounded change, authority, impacts, response, and evidence plan support the named decision or action | The change is authoritatively declined, deferred, or superseded, or delivered and verified within stated limits | Implementation when the authorized disposition ends the proposal |
| [Bugfix Specification](writing-bugfix-specifications.md#completion-criteria) | The Bug, corrective authority, corrected behavior, response, and verification plan support delivery | The identified revision satisfies the correction and regression conditions, with residual state recorded | Exhaustive root cause or closure of source Defect Reports |

## Apply the common concerns

These guides are additive. Select them from the action being performed, not
from the host's item type or labels.

- [Preserving evidence and authority in software work items](preserving-work-item-evidence-and-authority.md) - Use when creating or substantively revising a software work item; preserve source occurrences, claim maturity, unavailable evidence, safe provenance, and decision authority without inventing or strengthening what the sources establish.
- [Maintaining work-item identity, relationships, and lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md) - Use when creating, relating, merging, splitting, resolving, verifying, reopening, closing, superseding, or defining completion for software work items; preserve one case identity, explicit relationships, independent state dimensions, and evidence-backed completion boundaries.
- [Managing work-item metadata and labels](managing-work-item-metadata-and-labels.md) - Use when mapping semantic work-item state into tracker fields or labels, or when assigning, prioritizing, batching, and externally mutating items; keep host metadata a faithful projection of established meaning and verify persisted changes.
- [Titling and summarizing work items](titling-and-summarizing-work-items.md) - Use when a work item must be recognizable in lists and search or its meaning has changed; write or re-derive its title and short summary without changing anything else.
- [Preserving technical context in software work items](preserving-technical-context.md) - Use when supplied technical context must survive transfer into a software work item; retain findings, constraints, decisions, sketches, implementation plans, testing strategies, tradeoffs, and open questions without inventing or approving missing work.
- [Analyzing Requirement impact](../control-loop/analyzing-requirement-impact.md) - Use when a work-item Signal may imply a change to desired state; Orient it against current authority before it becomes an unsupported Requirement or Implementation commitment.
- [Specifying Requirement changes in software work items](specifying-requirement-changes.md) - Use when Requirement-impact analysis identifies a candidate addition, revision, retirement, or replacement; specify the desired-state delta, identity and lineage, authority, blockers, and downstream consequences without making the work item normative.

## Titles and summaries

Applies to every type below when the brief is created or re-derived. A
brief-only revision does not require the body, lifecycle, or metadata guides
unless the request also changes those concerns.

- [Work item titles and summaries](work-item-titles-and-summaries.md) - Why a work item's title and summary form a derived brief that serves the reading surfaces where items are scanned rather than opened, and why restating that brief changes nothing else about the item.
- [Titling and summarizing work items](titling-and-summarizing-work-items.md) - Use when a work item must be recognizable in lists and search or its meaning has changed; write or re-derive its title and short summary without changing anything else.

## Existing technical context

Applies when source material already contains technical investigation, design,
planning, or testing detail.

- [Preserving technical context in software work items](preserving-technical-context.md) - Use when supplied technical context must survive transfer into a software work item; retain findings, constraints, decisions, sketches, implementation plans, testing strategies, tradeoffs, and open questions without inventing or approving missing work.

When the technical response still needs to be developed rather than merely
preserved, use [Developing a Change
Design](../design/developing-a-change-design.md). The conversation may lead
directly to implementation or to a proportional work-item section; it does not
require a standalone Design document.

A work item may act as a Change Specification or, for an authorized correction
of an identified Bug, a Bugfix Specification when it composes the
representations needed for that bounded change. A Defect report never becomes
the Bugfix by retitling or maturation. The
[Specification vocabulary](../glossary.md#specifications) defines this as a
composition role: Requirements, Architecture, Change Design, verification
context, and delivery state retain their distinct meanings and authorities.

Every material item also receives a proportional
[Requirement-impact analysis](../control-loop/analyzing-requirement-impact.md). That
cross-cutting guide owns the desired-state, Architecture, and Evaluation
classifications rather than repeating them in each work-item type.

When that analysis identifies an actual candidate addition, revision,
retirement, replacement, split, or merge, apply [Specifying Requirement
changes in software work items](specifying-requirement-changes.md). Incident
Records and Defect Reports normally stop at impact analysis; Change
Specifications and the exceptional desired-state-changing Bugfix continue into
the delta guide.

## Requirement changes

- [Specifying Requirement changes in software work items](specifying-requirement-changes.md) - Use when Requirement-impact analysis identifies a candidate addition, revision, retirement, or replacement; specify the desired-state delta, identity and lineage, authority, blockers, and downstream consequences without making the work item normative.

## Operational incidents

- [Operational incident records](operational-incident-records.md) - How operational impact, service state, response state, and understanding evolve independently; how one incident identity coordinates several response surfaces; and why impact end, restoration, recovery, closure, and follow-up remain distinct.
- [Recording operational incidents](recording-operational-incidents.md) - Use when a live operational disruption needs coordinated, attributable recording; maintain impact evidence, command roles, objectives, actions, communication, chronology, handoffs, exit criteria, closure validation, and independently owned follow-up.

## Software defects and bugfixes

- [Failures, defects, and defect reports](failures-defects-and-defect-reports.md) - How observations and anomalies become classified defect reports; how failures, defects, incidents, corrections, verification, and closure differ; and why tracker labels do not prove diagnosis.
- [Recording defect reports](recording-defect-reports.md) - Use when an observation may violate an accepted expectation and needs a safe, traceable record; preserve the discrepancy and evidence at intake, then maintain decisions and verification without inventing diagnosis or priority.
- [Triaging defect reports](triaging-defect-reports.md) - Use when one or more Defect Reports need an evidence-backed disposition and next route; assess current applicability, relate cases, and route material uncertainty to investigation without inventing diagnosis, priority, or corrective authority.
- [Investigating possible defects](investigating-possible-defects.md) - Use when a possible Defect leaves a material question that available evidence cannot answer; gather the smallest safe discriminating evidence, including selective reproduction, and return a bounded conclusion without deciding Defect Report lifecycle or corrective authority.
- [Bugs and bugfix specifications](bugs-and-bugfix-specifications.md) - How investigation can identify a concrete Bug from one or more Defect reports, why the reports remain separate provenance, and how a Bugfix Specification drives an authorized corrective change.
- [Writing bugfix specifications](writing-bugfix-specifications.md) - Use when investigation has identified a Bug and an authorized corrective change needs a separate implementation-coordinating Specification; link its Defect reports, bound the correction, develop the Change Design, and define verification without losing Provenance.

## System and Architecture changes

- [Change specifications](change-specifications.md) - How bounded Change Specifications compose source context, authority, Requirements, Architecture, Change Design, verification, and implementation coordination without taking over their meanings or lifecycles.
- [Writing change specifications](writing-change-specifications.md) - Use when a proposed or authorized system or Architecture change is bounded enough to coordinate; preserve its sources and authority, analyze Requirements and Architecture impact, develop proportional Change Design, and define verification and delivery without inventing acceptance.
