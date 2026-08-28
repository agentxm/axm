---
type: Guide
title: Specifying Requirement changes in software work items
description: Use when Requirement-impact analysis identifies a candidate addition, revision, retirement, or replacement; specify the desired-state delta, identity and lineage, authority, blockers, and downstream consequences without making the work item normative.
tags: [requirements, requirement-change, work-items, change, change-specification, bugfix, lifecycle, supersession, authority, blocking]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md
    title: Gen Stack vocabulary and relationship model
  - id: requirement-impact
    resource: ../control-loop/analyzing-requirement-impact.md
    title: Analyzing Requirement impact
  - id: requirements-engineering
    resource: ../architecture/requirements/requirements-engineering.md
    title: Requirements engineering in software architecture
  - id: documenting-requirements
    resource: ../architecture/requirements/documenting-requirements.md
    title: Documenting requirements
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T21:55:00Z
---

# Specifying Requirement changes in software work items

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide after [Requirement-impact
analysis](../control-loop/analyzing-requirement-impact.md) identifies a
candidate new obligation or a proposed change or retirement. Impact analysis
asks whether desired state may be implicated; this guide specifies a bounded
delta for decision and coordination. Neither activity accepts, revises, or
retires a Requirement.

Do not use this guide for possible non-satisfaction of unchanged desired state,
implementation-only work, or representation maintenance that demonstrably
preserves normative meaning. Preserve an unresolved impact classification when
evidence cannot yet support an honest operation.

## Goal

An authorized reader can decide each proposed Requirement change, recover its
predecessors and candidate successors, see what meaning and authority remain
open, and understand the Architecture, derived-Requirement, Implementation, and
Evaluation consequences without treating the work item as canonical desired
state.

## Representation

Keep tracker mechanics in exact native fields. Represent each independently
decidable Requirement-change entry once in the work-item body, in this
preferred order: operation and current baseline, exact proposed delta, identity
and lineage, source and rationale, authority and decision state, action-specific
blockers, Architecture and Evaluation consequences, then reconciliation
outcome. Omit fields that do not apply to the operation. Link canonical
Requirements by stable ID; never copy an accepted expression into a competing
normative block.

## Keep the state dimensions independent

Do not compress these dimensions into one tracker status:

| Dimension | Question | Representative values |
| --- | --- | --- |
| Impact | How does the work relate to desired state? | possible non-satisfaction, candidate new obligation, proposed change or retirement, implementation-only, evidence or interpretation gap, unresolved |
| Operation | What would happen to Requirement authority? | add, revise, retire |
| Composition | How do predecessor and successor identities relate? | none, replace, split, merge |
| Meaning maturity | How mature is the proposed meaning? | candidate, recommended, proposed, accepted, rejected, superseded |
| Readiness | Can the named next action proceed truthfully? | ready, blocked |
| Decision | What has the applicable authority decided? | awaiting decision, accepted, rejected, deferred |
| Canonicalization | Is accepted meaning in its canonical Requirement? | not applicable, pending, complete |
| Realization | Does Implementation realize it? | unknown, planned, implemented |
| Evidence | What does Evaluation establish? | unknown, satisfied within bounds, non-satisfied, inconclusive |

A host state such as `approved`, `in progress`, or `done` does not establish
any omitted dimension.

## Select the primitive operation

Use only these primitive operations:

| Operation | Meaning | Identity treatment |
| --- | --- | --- |
| `add` | Introduce one independently managed obligation with no predecessor identity. | Assign a new `requirement_id` only after acceptance during canonical admission. |
| `revise` | Change one existing obligation while preserving its independently managed identity. | Retain the existing ID only after an explicit identity decision. |
| `retire` | End one active obligation's normative force. | Preserve the record and ID; never delete or reuse it. |

Use these composition patterns when several primitive operations form one
coherent transition:

- `replace` retires one or more predecessors and adds one or more successors;
- `split` replaces one Requirement with several independently changeable or
  satisfiable successors; and
- `merge` replaces several Requirements with one successor.

Replacement, split, and merge preserve many-to-many lineage through the
accepted successors' `supersedes` relationships. They do not imply equivalent
meaning, derivation, current satisfaction, or transfer of evidence.

Classify these separately from Requirement change:

- `representation-only` corrects wording, metadata, links, type encoding, or
  physical placement while demonstrably preserving normative meaning; and
- `unresolved` means available evidence cannot yet establish an operation.

Avoid `remove` and bare `modify`: they hide retirement, identity, and lineage.

## Decide whether identity continues

Apply these defaults, then let the applicable Requirement authority decide a
material exception:

- Retain an ID for ordinary evolution of the same independently managed
  obligation.
- Create successor IDs when the number of independently managed obligations
  changes; split and merge always retire their predecessors.
- Treat a change of obligated Architecture subject as identity-significant and
  default to replacement unless evidence proves that only erroneous
  representation changed.
- Retain the ID for a Requirement-type correction only when normative meaning
  is unchanged; otherwise revise or replace it.
- Reassess identity when conditions, bounds, outcomes, applicability,
  exceptions, or incorporated normative-reference versions change.
- Treat rationale, link, spelling, formatting, and path repairs as
  representation-only only when they preserve normative meaning.
- Never create a canonical ID for a work-item candidate or rewrite history so
  a successor appears to have always been its predecessor.

When the evidence cannot resolve revise versus replace, record both options,
recommend one, name the authority, and block canonicalization rather than
guessing.

## Create one entry per independently decidable delta

Use a work-item-local label such as `RC-1`. It is a stable referent inside the
item, not a Requirement ID.

```text
Requirement change: RC-1
Impact classification:
Operation: add | revise | retire
Composition pattern: none | replace | split | merge
Current Requirement IDs and canonical links:
Candidate successor labels:
Candidate obligation or proposed expression:
Current and proposed subject:
Current and proposed type:
Changed semantic facets:
Source and rationale:
Identity disposition:
Applicability or transition:
Architecture impact:
Derived-Requirement impact:
Implementation impact:
Evaluation impact:
Meaning maturity and decision state:
Applicable authority:
Readiness: ready | blocked
Blocked action:
Blocker and evidence or decision needed:
Resolution:
```

Link the current canonical Requirement rather than copying its expression as a
second authority. A candidate expression may appear in the work item because
it is not yet canonical, but label it `candidate`, `recommended`, or `proposed`.
After acceptance and canonicalization, replace work-item reliance on that
candidate text with a link to the canonical Requirement.

For replace, split, and merge, show an explicit predecessor-to-successor map.
Use work-item-local successor labels until canonical IDs exist.

## 1. Establish the current baseline

Before specifying a delta:

1. preserve the originating Signal, Observations, and unavailable evidence;
2. resolve every current Requirement by stable ID and canonical link;
3. identify applicable Intent, Architecture, normative references, parent and
   derived Requirements, Implementation, and Evaluation Protocols;
4. distinguish accepted authority from source requests, current behavior,
   tests, and interpretations; and
5. reopen the canonical Requirements immediately before mutation so a stale
   work item cannot overwrite an intervening change.

If no accepted Requirement exists, do not infer that addition is correct. The
truthful result may remain a candidate new obligation, an evidence gap, or an
unresolved relationship to desired state.

## 2. Specify the delta

For each independently changeable or satisfiable obligation:

1. choose `add`, `revise`, or `retire`;
2. identify any replace, split, or merge composition;
3. state candidate meaning precisely enough for Requirement verification and
   validation;
4. name the proposed eligible Architecture subject and abstraction level;
5. state the identity disposition and all predecessor-successor mappings; and
6. describe applicability or transition when old and new obligations differ by
   version, environment, date, actor, data class, or operating condition.

Do not use Requirement lifecycle to represent rollout. An accepted active
Requirement can be unsatisfied by current Implementation. Future or conditional
applicability belongs in the obligation; delivery transition belongs with the
work item and Implementation authorities.

## 3. Verify and validate the proposed meaning

For every addition or revision, apply the individual and set-quality checks in
[Requirements engineering](../architecture/requirements/requirements-engineering.md):
necessity, appropriateness, unambiguity, completeness, singularity,
feasibility, verifiability, correctness, conformance, set consistency, and
bounded set completeness.

For retirement, confirm that:

- the obligation is no longer required by its recognized sources;
- no retained parent, derived Requirement, external contract, policy, or
  normative reference silently keeps it in force;
- affected actors and operating contexts are accounted for; and
- successor or no-successor intent is explicit.

A syntactically clean statement, passing test, current implementation, or
requested mechanism does not validate the change.

## 4. Analyze consequences without taking their authority

For each entry, identify material impact on:

- Architecture subjects, responsibilities, boundaries, relationships, and
  decisions;
- parent, derived, overlapping, or conflicting Requirements;
- current Implementation and compatibility or migration;
- Evaluation Protocols, coverage claims, Executions, Results, and reports;
- operations, observability, rollback, and recovery; and
- external normative-reference versions, scopes, exceptions, and lifecycle.

Historical Evaluation Results remain bound to the Requirement, Implementation
revision, definition, inputs, and environment they actually assessed. Never
transfer coverage or satisfaction from a predecessor to a successor. A new or
revised active Requirement begins with satisfaction unknown until evidence
supports a bounded conclusion.

## 5. Make blockers action-specific

Use `blocked` only when missing meaning, evidence, or authority prevents a
truthful or safe next action. Always name that action.

| Condition | Record | Normally blocks |
| --- | --- | --- |
| Intended outcome or necessity is unclear | Intent gap and decision needed | Requirement decision |
| No eligible Architecture subject exists | Candidate subject options and authority | Acceptance and canonicalization |
| Responsibility or boundary is disputed | Architecture options and consequences | Dependent Design and delivery |
| Applicable Requirement authority is missing | Candidate delta and unresolved authority | Acceptance |
| Revise versus replace is unresolved | Both identity options and recommendation | Canonicalization |
| Candidate conflicts with accepted Requirements | Set conflict, options, and authority | Acceptance and dependent delivery |
| Feasibility or verifiability is unknown | Needed analysis, prototype, or negotiation | Acceptance when material |
| Evaluation Protocol is missing | Evaluation work and evidence owner | Verification, usually not Requirement acceptance |
| Required evidence is unavailable | Exact unknown and affected claim | Only the dependent claim or action |
| Canonical baseline changed | New baseline and re-orientation | Mutation |
| External target or version is unclear | Exact conformance target and adoption scope | Acceptance |
| Implementation alone is defective | Possible non-satisfaction of unchanged Requirement | No Requirement change |

A blocker propagates only to dependent entries and actions. It does not stop a
Defect Report from preserving evidence, prevent candidate co-development, or
freeze independent accepted deltas.

## 6. Pass the decision gate

The applicable human or institutional authority decides:

- whether desired state changes;
- which candidate expression and subject are accepted;
- whether identity is retained or replaced;
- whether related Architecture changes are accepted;
- when the obligation applies; and
- whether a conflict, exception, or residual risk is accepted.

Present unresolved alternatives in the Gen Stack decision-support form. A
detailed work item, assignment, tracker approval, implementation start, or
passing evaluation does not accept a Requirement change.

## 7. Canonicalize accepted changes coherently

After explicit acceptance and authorized repository mutation:

- add accepted Requirements with new IDs only during admission;
- revise an existing Requirement in place only when identity was retained;
- set retired predecessors to `requirement_lifecycle: retired` and preserve
  their IDs, expressions, subjects, rationale, and retirement Provenance;
- add `supersedes` on accepted successors for replacement, split, and merge;
- update separately accepted Architecture and decisions;
- synchronize reciprocal relationships; and
- validate OKF and Gen Stack profile conformance separately.

Apply replacement, split, and merge as one coherent corpus change when
practical. Do not leave accidental intervals with no active authority or two
active Requirements owning the same accepted obligation.

`accepted; canonicalization pending` is a truthful transient state. It is not
permission to use work-item prose as Compilation input.

## 8. Reconcile realization and evidence

After canonicalization:

- let implementation work link the active Requirements;
- update or create Evaluation Protocols under their own authority;
- preserve historical Results and predecessor coverage without relabeling;
- record satisfaction, non-satisfaction, or unknown separately from acceptance;
- keep rollout, migration, and recovery with delivery authorities; and
- re-evaluate affected parent, derived, and neighboring Requirements.

## 9. Resolve every entry

At the work item's closing boundary, leave each entry as exactly one of:

- accepted and canonicalized;
- rejected;
- deferred with authority and a reconsideration trigger;
- superseded by another work-item entry;
- representation-only and completed; or
- explicitly unresolved with its blocked action and required evidence or
  decision.

Partial acceptance is allowed. Independent accepted entries may proceed while
blocked, rejected, or deferred entries remain visible. Work-item closure does
not imply Requirement satisfaction.

## Apply by work-item type

- An **Operational Incident Record** and **Defect Report** normally stop at
  Requirement-impact analysis. They may link a separately authorized change
  entry but do not accept it.
- A **Change Specification** applies this guide whenever it proposes an
  addition, revision, retirement, replacement, split, or merge.
- A **Change classified as Bugfix** normally restores satisfaction of unchanged
  desired state. Apply this guide only when the authorized correction also
  proposes changed desired state. Missing accepted corrected behavior remains
  blocking before dependent delivery.
- A host-native implementation task links accepted Requirements and does not
  originate Requirement change or become a Gen Stack work-item role.
- A **brief-only revision** never infers a Requirement change from title or
  summary wording.

## Final check

- Impact analysis and change specification remain distinct.
- Every entry has one primitive operation or remains honestly unresolved.
- Replace, split, and merge preserve explicit predecessor-successor lineage.
- IDs are retained only through an explicit identity decision and are never
  assigned to candidates or reused after retirement.
- The work item does not compete with active Requirement authority.
- Intent and Architecture gaps name their authority and blocked action.
- Requirement, Architecture, Implementation, Evaluation, work-item, and host
  states remain separate.
- Historical evidence is preserved without transfer to successors.
- Accepted changes are canonicalized coherently and every entry has an honest
  resolution.
