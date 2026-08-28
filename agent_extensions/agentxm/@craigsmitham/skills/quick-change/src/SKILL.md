---
name: quick-change
description: Produces the canonical Change Specification and Change Design together for one bounded Change, reconciles their exact revisions, and returns a thin Change coordination handoff. Use when the user explicitly invokes `/quick-change` or asks for a combined specification-and-design response with substantial context or intent. Not for an ordinary quick code edit, an unbounded idea that needs shaping, implementation planning, coding, review, or shipping.
---

# Quick change

Define one context-rich bounded Change in a single focused response while
preserving the separate why-and-what and how artifacts.

This skill belongs to the Gen Stack pack. Resolve knowledge through active AXM
scope; in this source workspace read, in order:

- `knowledge/gen-stack/src/processes/running-change-realization-stages.md`;
- `knowledge/gen-stack/src/work-items/changes.md`;
- `knowledge/gen-stack/src/work-items/writing-change-specifications.md`; and
- `knowledge/gen-stack/src/design/developing-a-change-design.md`.

When evidence establishes a Defect and remediation is an explicit purpose,
also read
`knowledge/gen-stack/src/work-items/addressing-defects-through-changes.md`.
Do not load `spec` or `design` as required subworkflows or delegate to them;
the shared knowledge contracts are the authority that keeps all three skills'
artifacts identical.

## Boundary

Produce three distinct outputs for one Change:

1. the canonical Change Specification for why and what;
2. the canonical Change Design for how; and
3. the thin Change coordination handoff that binds exact artifact revisions,
   classification, coherence, and next action.

Do not blend Design choices into the Change Specification or delivery state
into either artifact. Do not accept human-owned semantic or technical
decisions, plan implementation, mutate code, review a candidate, or ship.

Use this combined route only when the request explicitly invokes it or clearly
asks for both artifacts. A colloquial request to “make a quick change” routes
to implementation or clarification according to its actual outcome, not here.

## Produce the combined response

1. Bind one Change, source records, intended outcome, scope, current
   Implementation, accepted authorities, decision and action authority, and
   the requested artifact form.
2. Determine whether Bugfix classification applies: at least one established
   Defect, an authorized remedial decision, and remediation as an explicit
   purpose. Otherwise do not infer it.
3. Develop the Change Specification according to its shared Guide. Keep all
   technical response choices out of it.
4. Develop the Change Design against that exact specification revision. When a
   design choice exposes changed outcome, obligation, durable Architecture,
   constraint, or semantic Protocol meaning, revise the Change Specification through
   its authority and rebind the Design.
5. Repeat the bounded reconciliation until the artifacts conform or one named
   gap blocks them. Do not make an unresolved human decision merely to finish.
6. Evaluate action-relative readiness. A visible gap may permit a draft; a
   missing required semantic Protocol blocks ratification, coherence, and
   dependent planning. Technical uncertainty may block Design acceptance
   without invalidating a truthful Change Specification draft.
7. Emit both canonical artifacts followed by the thin Change coordination
   handoff. Stop before planning or implementation.

## Output

For the Change Specification and Change Design, use the exact semantic and
representation contracts in their shared Guides. Do not reproduce or modify
their heading inventories here.

- Prefer exact native host fields when they satisfy each contract.
- In a Markdown-only host or conversation, copy both exact canonical
  fallbacks, retain every top-level heading, and use `Not applicable` only when
  justified.
- The outputs must be indistinguishable in structure and semantics from those
  produced independently by `spec` and `design`.
- Bugfix classification adds the conditional remediation content from its
  Guide; it never renames either artifact.

Then use the Change coordination contract from `Changes`, including exact
artifact revision identities, `established` or `blocked` coherence with
evidence, and one eligible next action. Do not claim coherence unless the exact
Change Specification is ratified, the exact Change Design is accepted, their reconciliation
conforms, and every required semantic Protocol is defined.

If human ratification or Design acceptance has not actually occurred, present
the appropriate requests and report coherence as not established or blocked.
The combined response is complete when both truthful artifacts and the
coordination handoff exist; planning and implementation remain separate.
