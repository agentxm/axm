# DevOps docs proposal template

Use the presentation below for setup and maintain. This file is the durable
presentation contract; the resulting proposal is displayed only in the
conversation. Do not save a plan or change documentation during either task.

## Fill and render

- Keep the section order, field labels, table columns, and final feedback
  invitation. Replace hypothetical facts, paths, and actions with findings from
  the selected scope; never present this example as observed evidence.
- Resolve each `{{type_summary: Type}}` from the profile's
  [type definitions](../references/profile.md#types-and-boundaries). Render one
  concise sentence in that slot and link the type name to its definition using
  a link that works in the user's context. Definitions live in the profile;
  this template does not maintain another set.
- Repeat the type block only for relevant types. Keep its change table even for
  one record. Do not introduce unused types or copy entire record templates.
- Keep Scope, Proposed changes, Verification, and Overall recommendation.
  Include Related changes and Decision only when applicable. For multiple
  decisions, repeat the Decision block with stable titles and Option A/B/etc.
  labels; keep comparisons and feedback in the same conversational surface.
- Under Related changes, include any reassessed local guidance or adoption
  declaration. Explain retained meaning, remaining reader needs, and reference
  repairs; a retirement may have no successor. Keep proposed declarations to
  repository-specific decisions and links to shared guidance.
- State the proposed root and standard type-folder structure. Show migration
  paths for relevant existing content; do not offer alternative layouts or
  initially offer another root. Honor an explicit or declared root override.
- Always report the agent discovery-pointer check under Related changes using
  [its template](agent-instructions.md). Name the canonical target, action,
  exact proposed text for an addition or revision, and reason. Keep adequate
  equivalent guidance. Mark dependent instruction edits outside a narrow scope.
- Under Verification, include the concise Skill freshness result from the
  [shared preflight](../references/skill-freshness.md). Include an applicable
  update recommendation under Related changes; keep it advisory.
- Put the overall recommendation and feedback invitation last. Do not append
  another summary or an implementation log. Scale the number of rows and their
  detail, not the presentation structure.

## Hypothetical presentation

Everything below illustrates one maintenance proposal for Providers and
Runbooks. Setup uses the same shape, with proposed adoption and navigation
under Related changes. Populate type-summary slots from the profile and render
the pointer slot from its template before displaying a real plan.

---

# DevOps docs maintenance proposal

## Scope

Review Provider and Runbook records under `/devops/` so maintainers can find the
current provider account and its applicable operating procedure.

**Structure:** `/devops/` with the standard type folders, root adoption README,
and root/type indexes. Only populated folders are needed.

**Reviewed:** The Nimbus provider record, two supplier notes, the account
inspection runbook, local provider-authoring guide, adoption declaration, root
`AGENTS.md`, and their incoming links.

**Coverage limit:** Documentation and the supplied account-transfer notice;
live account access and procedure execution were not checked.

## Proposed changes

### Providers

{{type_summary: Provider}}

**Proposed change:** Consolidate the Nimbus account information into one
canonical record and make the account transfer explicit, preserving the
existing recovery responsibility and export-retention constraint.

| Record | Proposed action | Reason / evidence |
| --- | --- | --- |
| `/devops/providers/nimbus.md` | Update the production account reference and link the transfer notice. | The supplied notice identifies the replacement account; test-account details remain applicable. |
| `/notes/nimbus.md` and `/notes/cloud.md` → `/devops/providers/nimbus.md` | Consolidate unique facts, update incoming links, and retire duplicate notes. | The notes add recovery responsibility and a seven-day export-retention constraint absent from the canonical record. |

### Runbooks

{{type_summary: Runbook}}

**Proposed change:** Align the account inspection procedure with the current
provider record while keeping its unverified execution status visible.

| Record | Proposed action | Reason / evidence |
| --- | --- | --- |
| `/devops/runbooks/inspect-account.md` | Replace the old production account reference and link the canonical Provider record. | The procedure still names the superseded account. No supplied evidence establishes a successful exercise. |

## Related changes

**Within scope:** Update Provider and Runbook indexes and incoming links after
consolidation. Preserve the old-to-new path mapping for consolidated records.
Retire `/devops/writing-provider-records.md` without a successor: inspection
found only guidance now supplied by the skill, no unique local decisions, and
no separate reader need. Human maintainers can access the versioned guidance
linked from the adoption declaration. Remove its index entry and redirect its
authoring links there. Keep the declaration's local scope, placement, maintainer,
and host-rule decisions; do not copy the retired guide into it.

**Outside scope:** `/devops/environments/production.md` also names the old account.
This is a dependent follow-up discovered through a link, not a review of all
Environment records.

**Agent discovery:** Propose adding the pointer to the canonical root `AGENTS.md`;
inspection found no equivalent route to the existing `/devops/index.md`. This
instruction edit is a dependent change outside the Provider/Runbook record scope.

**Proposed text:**

{{agent_discovery_pointer}}

Render this slot from [Pointer text](agent-instructions.md#pointer-text), with
`{{index_link}}` set to `[devops/index.md](devops/index.md)` for this example.
Omit these rendering instructions from the final proposal.

## Decision: include the Environment follow-up?

**Criteria:** Keep the requested scope bounded while avoiding a misleading
account reference in a directly related record.

| Option | Benefit | Cost / consequence |
| --- | --- | --- |
| Option A — include the identified Environment correction | Reconciles the known account references in one change. | Expands implementation to one additional record and its affected links. |
| Option B — keep implementation to Providers and Runbooks | Preserves the requested type boundary. | Leaves the known Environment correction as a separate follow-up. |

## Verification

**Checked during analysis:** Compared the records with the transfer notice and
traced links from the selected records. Identified the unique facts to preserve.

**Check during implementation:** Confirm those facts survive consolidation,
update affected links and indexes, and check record metadata and relationship
targets. Confirm retirement loses no local meaning or human access to needed
guidance. Keep procedure exercise status unchanged unless new evidence is supplied.
If the instruction edit is included, verify the effective pointer, its index
link, and the absence of duplicate guidance.

## Overall recommendation

Consolidate the two supplier notes into the existing Provider record, update
that record and the account inspection Runbook, retire the redundant authoring
guide without replacement, and repair their discovery links.
I recommend **Option A**: include the one identified Environment correction so
the known account references agree. This makes account and recovery information
easier to find while preserving retention constraints and verification gaps.
Include the proposed discovery pointer so ordinary repository work can find
this engineering and operations documentation.

**Status:** Proposed only; no files have been changed.

Would you like to accept this proposal, adjust its scope, or discuss an open point?
