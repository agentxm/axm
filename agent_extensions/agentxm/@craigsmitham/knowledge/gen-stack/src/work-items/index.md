# Software work items

Tool-neutral concepts and authoring guides for three first-class roles:
Operational Incident Record, Defect Report, and Change. A tracker supplies
storage and workflow mechanics; it does not redefine the semantic artifact.

## Choose the work item

| Situation | Use | Do not infer |
| --- | --- | --- |
| Current or imminent service impact meets the local coordinated-response threshold | [Operational Incident Record](operational-incident-records.md) · [recording guide](recording-operational-incidents.md) | Root cause, permanent correction, or closure |
| An observation, concern, or static finding may violate an applicable expectation | [Defect Report](failures-defects-and-defect-reports.md) · [recording guide](recording-defect-reports.md) | Established Defect, priority, or remediation |
| A proposed or authorized software change has a recognizable outcome and boundary | [Change](changes.md) · [specification guide](writing-change-specifications.md) | Ratification, accepted Design, priority, implementation, or verification |

Keep an unbounded request as a Signal or source record. Use [Investigating
possible defects](investigating-possible-defects.md) when uncertainty needs
discriminating evidence. Tasks, stories, epics, and similar records remain
host-native planning mechanics outside this taxonomy.

When a Change explicitly remediates an established Defect, classify it as a
Bugfix and apply [Addressing defects through
Changes](addressing-defects-through-changes.md). It still uses the ordinary
Change Specification and Change Design contracts.

## Compare completion by role

| Role | Complete for the next authorized action | Complete for closure | Does not universally require |
| --- | --- | --- | --- |
| Operational Incident Record | Current impact, control, command, next action, and handoff are recoverable | The local exit boundary is evidenced, closure is authorized, and residual recovery or follow-up is owned | Root cause or permanent correction |
| Defect Report | The discrepancy, evidence boundary, uncertainty, and next route are actionable | An authorized disposition is evidenced; any claimed remediation is verified for stated conditions | Reproduction, diagnosis, or a Change |
| Change | The exact artifact revisions and readiness for the named next action are explicit | The proposal is declined, deferred, or superseded, or delivery and verification are bounded and evidenced | Implementation when disposition ends the proposal; closure of source records |

Use [Maintaining work-item identity, relationships, and
lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md) for
the full completion model. Change Specification ratification, Change Design
acceptance, Change coherence, implementation, final action, evidence, and
source-record disposition remain independent states.

## Change artifacts

- [Changes](changes.md) - How one Change coordinates a bounded proposed or authorized software change while its Change Specification, Change Design, delivery state, and evidence retain distinct responsibilities and authority.
- [Writing Change Specifications](writing-change-specifications.md) - Use when one bounded Change needs a human-ratifiable account of why and what must change; specify exact Intent, Requirement, Architecture, constraint, and semantic Evaluation Protocol changes without selecting the technical response or coordinating delivery.
- [Addressing defects through Changes](addressing-defects-through-changes.md) - Use when a bounded Change has the explicit remedial purpose of correcting or acceptably compensating for established Defects; classify it as a Bugfix, preserve Defect provenance, and apply the ordinary Change Specification and Change Design contracts.
- [Developing a Change Design](../design/developing-a-change-design.md) - Use when one bounded Change needs a proportional technical response; compare material alternatives, realize accepted Architecture and required Evaluation Protocols, and reconcile the exact Change Specification without taking over specification or delivery coordination.
- [Synchronizing change artifacts with work-item hosts](synchronizing-change-artifacts.md) - Use when an exact Pitch, Change coordination record, Change Specification, Change Design, or implementation plan must be created or updated in a work-item host without re-authoring it, or when an exact plan must be deliberately projected into host-native implementation records.

## Defects and incidents

- [Operational incident records](operational-incident-records.md) - How operational impact, service state, response state, and understanding evolve independently; how one incident identity coordinates several response surfaces; and why impact end, restoration, recovery, closure, and follow-up remain distinct.
- [Recording operational incidents](recording-operational-incidents.md) - Use when a live operational disruption needs coordinated, attributable recording; maintain impact evidence, command roles, objectives, actions, communication, chronology, handoffs, exit criteria, closure validation, and independently owned follow-up.
- [Failures, defects, and defect reports](failures-defects-and-defect-reports.md) - How observations and anomalies become classified defect reports; how failures, defects, incidents, corrections, verification, and closure differ; and why tracker labels do not prove diagnosis.
- [Recording defect reports](recording-defect-reports.md) - Use when an observation may violate an accepted expectation and needs a safe, traceable record; preserve the discrepancy and evidence at intake, then maintain decisions and verification without inventing diagnosis or priority.
- [Triaging defect reports](triaging-defect-reports.md) - Use when one or more Defect Reports need an evidence-backed disposition and next route; assess current applicability, relate cases, and route material uncertainty to investigation without inventing diagnosis, priority, or corrective authority.
- [Investigating possible defects](investigating-possible-defects.md) - Use when a possible Defect leaves a material question that available evidence cannot answer; gather the smallest safe discriminating evidence, including selective reproduction, and return a bounded conclusion without deciding Defect Report lifecycle or corrective authority.

## Common concerns

Apply only the guides the action needs:

- [Preserving evidence and authority in software work items](preserving-work-item-evidence-and-authority.md) - Use when creating or substantively revising a software work item; preserve source occurrences, claim maturity, unavailable evidence, safe provenance, and decision authority without inventing or strengthening what the sources establish.
- [Maintaining work-item identity, relationships, and lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md) - Use when creating, relating, merging, splitting, resolving, verifying, reopening, closing, superseding, or defining completion for software work items; preserve one case identity, explicit relationships, independent state dimensions, and evidence-backed completion boundaries.
- [Managing work-item metadata and labels](managing-work-item-metadata-and-labels.md) - Use when mapping semantic work-item state into tracker fields or labels, or when assigning, prioritizing, batching, and externally mutating items; keep host metadata a faithful projection of established meaning and verify persisted changes.
- [Work item titles and summaries](work-item-titles-and-summaries.md) - Why a work item's title and summary form a derived brief that serves the reading surfaces where items are scanned rather than opened, and why restating that brief changes nothing else about the item.
- [Titling and summarizing work items](titling-and-summarizing-work-items.md) - Use when a work item must be recognizable in lists and search or its meaning has changed; write or re-derive its title and short summary without changing anything else.
- [Preserving technical context in software work items](preserving-technical-context.md) - Use when supplied technical context must survive transfer into a software work item; retain findings, constraints, decisions, sketches, implementation plans, testing strategies, tradeoffs, and open questions without inventing or approving missing work.
- [Analyzing Requirement impact](../control-loop/analyzing-requirement-impact.md) - Use when a work-item Signal may imply a change to desired state; Orient it against current authority before it becomes an unsupported Requirement or Implementation commitment.
- [Specifying Requirement changes in software work items](specifying-requirement-changes.md) - Use when Requirement-impact analysis identifies a candidate addition, revision, retirement, or replacement; specify the desired-state delta, identity and lineage, authority, blockers, and downstream consequences without making the work item normative.

A Work item preserves one case; it does not become the [Process](../processes/process.md)
that coordinates several items or enactments.
