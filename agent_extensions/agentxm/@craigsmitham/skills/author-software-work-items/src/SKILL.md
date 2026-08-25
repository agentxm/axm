---
name: author-software-work-items
description: Creates and revises software work items and tracker-ready issue content for feature requests, bug or defect reports, operational incidents, and work-item titles and summaries, including faithful capture of supplied technical design and delivery context. Use when asked to write, file, draft, rewrite, or improve a software issue, ticket, bug report, feature or enhancement request, incident record, issue title, or issue summary. Not for independently designing or approving requirements, architecture, or implementation plans; faithfully transferring existing context is in scope. Not for backlog management, post-incident reviews, or implementation.
---

# Author software work items

Create or revise the work item that truthfully represents the current lifecycle
stage, preserves its evidence, and remains legible in both an opened item and a
tracker list.

This skill is coupled to the software-engineering pack. From the active AXM
scope root, use the guides under
`.axm/extensions/@craigsmitham/knowledge/software-engineering/src/work-items/`:

| Job | Read | Add when the artifact boundary is uncertain |
| --- | --- | --- |
| Any title or summary | `titling-and-summarizing-work-items.md` | `work-item-titles-and-summaries.md` |
| Existing technical design or delivery context | `preserving-design-and-delivery-context.md` | — |
| Operational incident | `recording-operational-incidents.md` | `operational-incident-records.md` |
| Suspected software defect | `recording-defect-reports.md` | `failures-defects-and-defect-reports.md` |
| Requested new or changed functionality | `recording-feature-requests.md` | `feature-requests-requirements-and-delivery-work.md` |

Read `index.md` when selecting among types. Do not load every guide for a known
type.

## Classification boundary

- Use an **operational incident record** for current or imminent service impact
  that meets the local threshold for coordinated response. It remains live
  until the local closure criteria are met; impact end, service restoration or
  recovery, closure, and permanent corrective work can have separate states
  and lifecycles.
- Use a **defect report** when observed behavior may violate an accepted
  expectation. Root-cause proof is not a prerequisite.
- Use a **feature request** when someone seeks new or changed functionality. A
  request preserves demand; it does not approve a requirement, solution, or
  delivery commitment.
- Use **brief-only revision** when the body and structured fields already own the
  facts and the caller only wants a clearer title and one- or two-sentence
  summary. Restating the brief must not change scope, priority, ownership,
  acceptance criteria, or status.

If the artifact is an implementation task, accepted delivery item,
investigation, post-incident review, architecture decision, or general project
record, its governing workflow owns lifecycle, classification, placement, and
host fields. Faithfully authoring or revising that artifact from supplied
accepted context remains in scope; independently designing, approving, or
decomposing the work does not. Classification sets the item's primary meaning
and minimum content, not a body ceiling.

## Workflow

1. **Resolve the requested action and authority.** Distinguish drafting or
   review from creating or updating an external tracker item. Read local
   instructions, templates, field definitions, taxonomy, and the existing item
   or linked authority. External mutation requires an explicit request and an
   available tool; authoring alone returns tracker-ready content.
2. **Select the artifact without advancing its lifecycle.** Classify from the
   accepted expectation, desired change, and operational impact—not from the
   caller's preferred label. Preserve ambiguous or disputed classification for
   triage rather than fabricating authority.
3. **Inventory originating evidence before synthesis.** For every initiating
   occurrence or other material source, record the source system or type, its
   stable identifier and controlled-access URL, observation time, relevant
   project or environment, and safe correlation identifiers when they
   materially aid retrieval, applying only fields relevant to that source type.
   Do not add monitoring-specific or tracker-specific fields to an unrelated
   source. Mark important applicable evidence unavailable when it cannot be
   recovered; omit inapplicable source-specific fields instead of adding
   "not applicable" placeholders. Treat an intervening research summary as
   derived context, not as a replacement for the authoritative source pointer.
   When creation or revision
   follows earlier research or a delayed handoff, reopen or re-query each
   available authoritative source and refresh the inventory before writing.
   Mark important applicable unavailable fields or sources explicitly; never
   invent identifiers, timestamps, counts, environments, or links.
4. **Preserve before prescribing.** When the source already contains findings,
   constraints, decisions or proposals, architecture or code sketches,
   implementation sequence, testing strategy, tradeoffs, or open questions,
   include or link them with provenance and authority state. Do not trim them
   to fit a shorter type template or invent what is absent; apply
   `preserving-design-and-delivery-context.md`.
5. **Preserve type-specific meaning.** Apply the selected guide and local host
   fields. Keep facts distinct from hypotheses, need distinct from proposed
   solution, severity distinct from priority, and current mitigation distinct
   from impact end, restoration, recovery, closure, and permanent correction.
   Link related artifacts instead of merging their lifecycles.
6. **Derive the brief last.** Write a discriminating title and a one- or
   two-sentence summary from the authoritative body and structured fields.
   Nothing material may exist only in the brief, and its length limit never
   limits the body. Re-derive an incident brief at every material state change.
7. **Apply only the authorized external change.** Before filing or updating,
   verify the exact tracker, repository or project, item, fields, and content.
   Carry forward any source-specific handoff requirements discovered while
   building the inventory even when a generic or tracker-specific workflow
   performs the write. Do not assign, prioritize, label, close, comment, or
   change workflow state unless requested or required by an established local
   process in scope.
8. **Read back external writes.** After a create or update, retrieve the
   persisted item through the tracker and treat that readback—not the submitted
   draft or mutation response—as the verification surface. If readback is
   unavailable, say so and do not claim persistence was verified.
9. **Verify and hand off.** Compare the final draft, or the persisted readback
   after an external write, with the source inventory and all other source
   material. Every material source must remain individually traceable by its
   identifier and link or be explicitly marked unavailable. Confirm the
   selected guide's final check, an accurate brief, attributed evidence,
   visible unknowns and authority states, preserved or linked technical
   context, and distinct verification conditions and testing strategy. Correct
   an authorized external item and read it back again when a source identifier
   or link did not persist. When correction is not authorized, name the needed
   authorization, the exact persistence correction, and a fresh readback as
   the remaining sequence. Return the final content or external item identity
   and name any material the host could not represent.

Completion means the requested draft or external item exists in the right
artifact class, another reader can understand and act on its evidence without
interviewing the author, every material originating source remains traceable or
explicitly unavailable, supplied context has not been lost, and no unaccepted
product, design, delivery, or priority decision has been smuggled into it.
