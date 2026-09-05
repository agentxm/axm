---
name: manage-work-items
description: Creates and maintains tracker-ready software work items with consistent evidence, content, relationships, lifecycle, and verification. Use when asked to classify, draft, revise, triage, relate, merge, split, reopen, close, title, summarize, or map Operational Incident Records, defect or bug reports, and software Changes in GitHub, Jira, Linear, or another tracker. Not for implementing fixes, diagnosing code, prioritizing a backlog, project planning, or authoring product strategy.
---

# Manage work items

Create and maintain truthful, recoverable software work items while adapting
their physical representation to the repository and tracker that owns them.

This skill is a non-standalone member of the Work Management pack. Resolve
knowledge through the active AXM scope. In a source workspace, the paths below
are exact paths beneath that scope root; do not rebase them beneath this skill
package or scan for alternate copies. If the exact workspace paths are absent,
resolve the installed `@craigsmitham/knowledge/work-management` pack sibling
through active AXM state.

Always read:

- `knowledge/work-management/src/software-work-item-taxonomy.md`; and
- `knowledge/work-management/src/common/work-item-content-contract.md`.

Then read only the narrowest applicable route below.

## Route the request

### Defect Report

Read `knowledge/work-management/src/defects/recording-defect-reports.md` when an
observation, concern, failure, or static finding may indicate a Defect and the
requested outcome is a report. Add:

- `defects/triaging-defect-reports.md` for classification, duplicates, batch
  triage, disposition, or next-route decisions;
- `defects/linking-defects-to-corrective-changes.md` when an established Defect
  and authorized remedial purpose connect a separate Change classified as
  Bugfix; and
- `defects/defect-report-template.md` only when the host lacks an adequate body
  form or the user requests the portable template.

Do not turn a reported observation into a confirmed diagnosis or convert the
report itself into the corrective Change.

### Change

Read `knowledge/work-management/src/changes/authoring-changes.md` when the
requested outcome is one bounded proposed or authorized software modification.
Add `changes/classifying-changes.md` when purpose classification is in scope and
`changes/change-template.md` only for a body fallback or explicit template
request.

A Change may preserve supplied specification, design, plan, implementation,
rollout, rollback, migration, and test context, but this skill does not invent
those artifacts, impose a stage lifecycle, or authorize implementation.

When the request supplies only a capability name or similarly thin intent,
keep the Change intentionally incomplete. Restate only the requested outcome,
mark unsupported motivation, baseline behavior, boundaries, constraints, risks,
and completion details as unknown or open decisions, and make clarification the
next action. Observable behavior may describe the requested outcome; do not
select protocol, storage, API, component, sequencing, or rollout mechanics to
make the item appear complete.

### Operational Incident Record

Read `knowledge/work-management/src/incidents/recording-operational-incidents.md`
when current or imminent operational impact meets the local coordinated-
response threshold. Add `incidents/operational-incident-template.md` only for a
body fallback or explicit template request.

Follow local emergency and communication policy. Recording an incident does
not authorize mitigation, production mutation, or public communication.

### Cross-cutting operation

Read only the common guide needed:

- `common/preserving-evidence-and-provenance.md` for every creation or
  substantive body revision;
- `common/preserving-technical-context.md` when supplied technical reasoning
  must survive transfer;
- `common/maintaining-identity-and-relationships.md` for create, duplicate,
  merge, split, supersede, relate, regress, or reopen operations;
- `common/managing-lifecycle-and-completion.md` for disposition, delivery,
  verification, operational, or closure transitions;
- `common/defining-verification.md` when completion conditions, evidence
  strategy, or a verification result are in scope;
- `common/mapping-to-work-item-hosts.md` for fields, labels, assignment,
  priority, batching, or any external tracker mutation;
- `common/applying-project-specific-considerations.md` whenever repository
  instructions apply; and
- `common/titling-and-summarizing-work-items.md` for a brief-only revision.

For a brief-only revision, do not change body facts, classification, fields,
relationships, or lifecycle unless the user separately requests them.

## Workflow

1. **Bind outcome and authority.** Identify the requested read, analysis,
   draft, repository write, or external tracker mutation. Resolve the exact
   existing item or intended new role and target. Skill activation grants no
   additional mutation authority.
2. **Read local policy and host state.** Read applicable repository
   instructions. Inspect the host schema, existing item, fields, relationship
   types, templates, and disclosure boundaries when they affect the result.
   Do not question the user for discoverable facts.
3. **Classify without advancing lifecycle.** Select Operational Incident
   Record, Defect Report, Change, or a host-native planning/intake record from
   semantic fit. Preserve uncertainty instead of forcing a portable role. A
   Bugfix is a Change classification, not another role.
4. **Inventory sources before synthesis.** Preserve material occurrences,
   requests, observations, findings, decisions, technical context, stable
   identities, times, revisions, conditions, availability, uncertainty, and
   safe provenance. Never invent missing facts or strengthen a claim.
5. **Compose the content.** Apply the common contract, role-specific contract,
   and triggered repository considerations. Link peer specifications,
   decisions, designs, tests, and runbooks rather than copying their authority.
   Omit inapplicable sections and retain material unknowns. A requested heading
   does not authorize invented content: label unsupported facts and decisions
   explicitly, and distinguish proposed evidence from completed evidence.
6. **Maintain identity and state.** Keep independently managed roles and cases
   separate. State relationship direction. Preserve evidence, understanding,
   decision, delivery, verification, operational, follow-up, and closure state
   independently where material.
7. **Map through the native host.** Use each exact native field once. Put only
   residual meaning in the body, and do not duplicate structured metadata in a
   second editable block. Derive the title and one- or two-sentence summary
   last.
8. **Apply only authorized mutation.** External writes require an explicit
   request and verified target. Do not assign, prioritize, label, comment,
   relate, close, or change status unless authorized by the request or an
   established in-scope workflow. Bound retries and preserve partial batch
   outcomes.
9. **Verify and hand off.** Compare the result with every material source and
   local instruction. Read back external writes. Report the achieved identity
   and role, current state, next action, material unknowns, item-local failures,
   and any requested action that remains unverified.

## Authority and safety boundaries

- Do not implement a Change, diagnose code, perform technical incident
  response, prioritize a backlog, or plan team capacity merely because the
  work item describes that work.
- Do not infer priority, assignment, approval, root cause, remediation,
  verification, or closure from a label, status, assignee, implementation, or
  absence of objections.
- Do not put credentials, personal information, private customer content,
  confidential commercial information, or exploitable security details in a
  public item. Use safe summaries and governed evidence locations.
- Stop before a dependent mutation when its target, disclosure boundary,
  decision authority, or material content is unresolved. Preserve the truthful
  draft and name the exact missing input or authorization.

Completion means the requested work item or bounded operation exists at the
authorized target; its role, content, evidence, relationships, state, and local
considerations are truthful; any external write was read back; and no adjacent
implementation, prioritization, planning, or response authority was inferred.
