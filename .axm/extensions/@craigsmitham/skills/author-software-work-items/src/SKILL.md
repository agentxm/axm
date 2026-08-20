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
| Suspected software defect | `reporting-software-defects.md` | `software-defects-and-defect-reports.md` |
| Requested new or changed functionality | `writing-feature-requests.md` | `feature-requests-and-delivery-work.md` |

Read `index.md` when selecting among types. Do not load every guide for a known
type.

## Classification boundary

- Use an **operational incident record** for current or imminent service impact
  that meets the local threshold for coordinated response. It is live until
  impact ends; permanent corrective work has a separate lifecycle.
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
record, use its governing workflow rather than stretching these templates.
Classification sets the item's primary meaning and minimum content, not a body
ceiling: a defect or request may preserve supplied design and delivery context
without becoming the artifact that approves or executes it.

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
3. **Establish the evidence.** Use only supplied or discoverable facts. Do not
   invent affected users, demand, expected behavior, reproduction, timestamps,
   severity, priority, ownership, environment, or success measures. Mark an
   important unknown explicitly and say what would establish it.
4. **Preserve before prescribing.** When the source already contains findings,
   constraints, decisions or proposals, architecture or code sketches,
   implementation sequence, testing strategy, tradeoffs, or open questions,
   include or link them with provenance and authority state. Do not trim them
   to fit a shorter type template or invent what is absent; apply
   `preserving-design-and-delivery-context.md`.
5. **Preserve type-specific meaning.** Apply the selected guide and local host
   fields. Keep facts distinct from hypotheses, need distinct from proposed
   solution, severity distinct from priority, and current mitigation distinct
   from permanent correction. Link related artifacts instead of merging their
   lifecycles.
6. **Derive the brief last.** Write a discriminating title and a one- or
   two-sentence summary from the authoritative body and structured fields.
   Nothing material may exist only in the brief, and its length limit never
   limits the body. Re-derive an incident brief at every material state change.
7. **Apply only the authorized external change.** Before filing or updating,
   verify the exact tracker, repository or project, item, fields, and content.
   Do not assign, prioritize, label, close, comment, or change workflow state
   unless requested or required by an established local process in scope.
8. **Verify and hand off.** Compare the final item with all source material.
   Confirm the guide's final check, an accurate brief, attributed evidence,
   visible unknowns and authority states, preserved or linked technical
   context, and distinct verification conditions and testing strategy. Return
   the final content or external item identity and name any material the host
   could not represent.

Completion means the requested draft or external item exists in the right
artifact class, another reader can understand and act on its evidence without
interviewing the author, supplied context has not been lost, and no unaccepted
product, design, delivery, or priority decision has been smuggled into it.
