# Work items

A work item is the durable case record that keeps one concern recoverable while
it travels toward production. This subtree holds the portable craft of
classifying, authoring, relating, maintaining, and verifying Operational
Incident Records, Defect Reports, and Changes, without prescribing a tracker,
delivery method, requirements system, or architecture framework.

Start with the taxonomy when a role or classification is unsettled. Go to a role
section when the role is known, and to the common section for a concern that
applies to every role.

The obligations a Change carries belong to
[Requirements](../../solution/requirements/). Incident response itself belongs
to [How to run it](../../operations/). This subtree supplies the portable record
contract, meaning what a record must show and keep current; the operations
section owns the response regime that record serves, including detection
thresholds, severity reasoning, escalation, command, closure, and post-incident
review.

For broader context, follow
[Continuity and change](../../reading-product-engineering.md#continuity-and-change).
Place the record in the wider reasoning about what should change and how its
effects will be assessed.

## Foundations

- [Software work-item taxonomy](software-work-item-taxonomy.md) — Defines the portable work-item roles, classifications, neighboring activities, and distinctions that every work-item guide and template applies.
- [Common work-item guidance](common/) - Contracts and guides that apply to
  every role: content slots, evidence and provenance, technical context,
  identity and relationships, lifecycle, verification, host mapping,
  repository-specific considerations, and titling.

## Work-item roles

- [Defect Reports](defects/) - Concepts, authoring, triage, corrective-change
  relationships, and a portable template for observations that may indicate a
  Defect.
- [Changes](changes/) - Classification, authoring, and a portable template for
  bounded proposed or authorized software modifications.
- [Operational Incident Records](incidents/) - Live-record guidance and a
  portable template for coordinating current or imminent operational impact.

## Follow related records

- [Northbank receipts: incident, defect, and corrective change](northbank-receipt-incident.md) — A fictional receipt-worker failure shows how operational impact, uncertain diagnosis, corrective work, verification, and closure remain connected without collapsing into one record or status.
