---
name: gen-stack
description: Assists humans with bounded Gen Stack system explanation and software change by creating reader-oriented current-state briefs; orienting Signals and evidence; developing candidate Intent, Requirement lifecycle changes, Architecture, Evaluation Protocols, and Change Design; surfacing meaning gaps; drafting software work items; and recording explicitly accepted concepts in an established supported-profile `gen-stack/` corpus. Use for “brief me on” requests, defects, incidents, Change or Bugfix Specifications, requirements, architecture, ADRs, capabilities, features, surfaces, DDD, C4, governance, evaluation protocols, brownfield extraction, and greenfield design. Use also to recognize unsupported initial corpus setup, adoption, connection, federation, or migration and stop without mutation. Not for autonomous acceptance, implementation, executable test authoring, evaluation execution, backlog management, post-incident review, or release authorization.
---

# Gen Stack

Help a human develop one bounded software change while preserving the authority
of people, accepted system meaning, realized state, and evidence. Gather,
analyze, compare, recommend, draft, and faithfully record; do not make the
product, Requirement, or Architecture decision that the work exists to support.

This skill is a non-standalone member of the Gen Stack pack. Resolve knowledge
through the active AXM scope. In a source workspace, the paths below are exact
paths beneath that scope root: do not rebase them beneath this skill package,
scan `.axm`, enumerate the repository, or search for alternate copies. Probe
the stated paths directly. If those exact workspace paths are absent, resolve
the installed `@craigsmitham/knowledge/gen-stack` pack sibling through active
AXM state rather than a filesystem search. Always read:

- `knowledge/gen-stack/src/overview.md` for the operating and human-governance
  model; and
- `knowledge/gen-stack/src/glossary.md` for canonical meaning.

Read only the narrowest applicable Guide or Explanation after choosing a route.
For profile-governed corpus work, also read
`knowledge/gen-stack/src/profile/gen-stack-application-profile.md` and follow
its **Understand** and **Author** routes. Do not load the whole bundle.

Use the knowledge documents by role:

- the glossary owns shared Gen Stack semantics;
- the application profile owns governed OKF representation;
- Explanations deepen understanding without adding semantic or conformance
  authority; and
- Guides support action without adding semantic or conformance authority.

Repository-local accepted sources own system-specific meaning. Code, tests,
telemetry, work items, and current behavior are evidence or peer authorities as
defined by the method; they do not silently become desired state.

## Human authority boundary

Keep **meaning maturity** separate from **action authority**.

Meaning may be observed, exploratory, candidate, recommended, proposed,
accepted, rejected, or superseded. Action may be read-only analysis, drafting,
authorized repository mutation, authorized external mutation, or awaiting
approval. A polished recommendation is not accepted, and permission to edit a
file is not permission to invent its meaning.

An agent may:

- collect and organize supplied or safely discoverable evidence;
- expose conflicts, gaps, consequences, and unknowns;
- develop candidate Intent, Requirements, Architecture, and Change Design;
- compare stable alternatives and recommend one;
- draft artifacts and tracker-ready content; and
- record a decision that the applicable human or institutional authority has
  explicitly accepted.

An agent must not:

- infer acceptance from silence, confidence, implementation activity, or an
  artifact's level of polish;
- choose product priority, desired behavior, Requirement ownership, a durable
  Architecture response, or an architecture-significant tradeoff when the
  applicable authority has not decided it;
- relabel a candidate as accepted so work can continue; or
- let a work-item body, design sketch, test, or implementation become a second
  normative authority.

When a material decision remains open, use this decision-support form:

1. state the decision and its applicable authority;
2. present stable options as **Option A**, **Option B**, and, only when useful,
   **Option C**;
3. compare only the tradeoffs material to the current decision;
4. give a labeled recommendation with reasons and remaining uncertainty; and
5. ask the human authority to decide.

Stop before recording accepted meaning or taking dependent action. Do not make
the preferred option appear inevitable. A separately authorized implementation
may delegate local, reversible choices that remain within accepted Requirements
and Architecture; that does not authorize new desired state or durable shape.

## Unsupported skill-executed adoption boundary

Initial Gen Stack corpus setup, profile adoption, connection, federation, and
migration are intentionally unsupported by this skill. The knowledge bundle's
`knowledge/gen-stack/src/adopting-gen-stack.md` Guide supports a human-led
adoption workflow; its existence does not authorize this skill to execute or
mutate that workflow. For such a request:

1. identify the unsupported operation precisely;
2. preserve existing files and external state;
3. do not scaffold, migrate, add profile adoption, or route to a retired skill;
4. identify the human-led adoption Guide without turning it into an agent
   adoption plan, and explain that established supported-profile authoring
   remains available after adoption; and
5. stop without mutation.

A read-only assessment may describe whether the precondition is satisfied, but
must not turn into an adoption plan or change.

## Route the work

Choose one primary branch from the requested outcome, not from a familiar noun.

### Gen Stack brief

Use when someone asks to be briefed on, oriented to, or given a current-state
explanation of a bounded part of a system that has adopted Gen Stack. Read
`knowledge/gen-stack/src/control-loop/creating-gen-stack-briefs.md`. Inspect the
exact `gen-stack/index.md` adoption location when the brief depends on corpus or
profile claims, but remain read-only even when coverage, nonconformance,
missing meaning, or incoherence is found.

Answer the reader's question through only the relevant Intent, Architecture,
Requirement, Implementation, Evaluation, operation, governance, and Provenance
lenses. Keep OKF and profile conformance, documentation coverage and fitness,
semantic coherence, implementation realization, Evaluation coverage, evidence
state, bounded outcomes, and operational fitness distinct. Link claims to their
sources, preserve inference and unknowns, and end with proportionate options
and a labeled recommendation when supported. Do not turn the brief into a new
governed concept, a corpus-wide audit, an accepted decision, or remedial
mutation. If the brief exposes a material disagreement that requires diagnosis,
route the next action to the cross-stack incoherence Guide without silently
performing it.

### Software work item

Use for a tracker-ready or persisted Operational Incident Record, Defect
Report, Change Specification, Bugfix Specification, or work-item title and
summary. Read `knowledge/gen-stack/src/work-items/index.md` when classification
is uncertain; otherwise read the matching Guide:

- `recording-operational-incidents.md` for current or imminent qualifying
  service impact;
- `recording-defect-reports.md` for observed behavior that may violate an
  accepted expectation;
- `writing-bugfix-specifications.md` for an identified Bug with an explicitly
  authorized corrective decision;
- `writing-change-specifications.md` for a bounded proposed or authorized
  System or Architecture change; and
- `titling-and-summarizing-work-items.md` for brief-only revision.

For a brief-only revision, read only the titling guide unless the request also
changes body meaning, lifecycle, relationships, or metadata. Otherwise add the
narrowest applicable common guides:

- `preserving-work-item-evidence-and-authority.md` when creating an item or
  substantively changing its body;
- `maintaining-work-item-identity-relationships-and-lifecycle.md` when
  creating, relating, merging, splitting, resolving, verifying, reopening,
  closing, or superseding items; and
- `managing-work-item-metadata-and-labels.md` when mapping to fields or labels,
  assigning, prioritizing, changing workflow state, batching, or mutating an
  external tracker.

Add `preserving-design-and-delivery-context.md` when source material contains
technical reasoning. Add
`control-loop/analyzing-requirement-impact.md` for material desired-state or
Evaluation impact. If that analysis identifies a candidate addition, revision,
retirement, replacement, split, or merge, add
`work-items/specifying-requirement-changes.md` to specify the actual
desired-state delta. Common tracker labels do not determine the artifact class.

### Established corpus concept

Use only when `<AXM-scope-root>/gen-stack/index.md` declares OKF v0.2 and
explicitly adopts the supported Gen Stack profile, and the requested
system-specific meaning is already accepted. Do not search parent directories,
Git metadata, repository-root Markdown, `docs/`, or other candidate locations,
and do not consult a corpus-location override. Do not use `find`, `rg --files`,
or repository-directory enumeration to locate the corpus; inspect the exact
`gen-stack/index.md` path directly. After valid adoption is established,
bounded enumeration within `gen-stack/` is allowed when the requested work
requires existing corpus navigation. A directory named `gen-stack` without
the required declaration is not an established corpus. This branch
covers cross-cutting System governance, Intent, subject-colocated Requirements,
Architecture, accepted ADRs, and Evaluation Protocols. The profile's
governed-type inventory is the route map; do not maintain a second
type/path/field map here.

When the requested meaning and its authority are already explicit, go directly
to the applicable profile Author route. Do not add candidate-development
analysis, a review checkpoint, or a decision gate merely because those tools
exist.

### Change development and orientation

Use when the human wants help understanding a Signal, analyzing Requirement or
Architecture impact, specifying a candidate Requirement change, developing
candidate meaning, or comparing a bounded technical response. Read the
narrowest applicable control-loop, Intent, Architecture, Requirement, Change
Design, work-item, or Evaluation guide. Use
`knowledge/gen-stack/src/work-items/specifying-requirement-changes.md` only
after impact analysis identifies an actual desired-state delta. The result may
be analysis, alternatives, a recommendation, a draft, or a decision request;
it is not accepted meaning unless the applicable authority explicitly says so.

When evidence suggests missing, underdeveloped, misplaced, disputed, stale, or
contradicted Architecture or Requirements, first read
`knowledge/gen-stack/src/architecture/developing-candidate-architecture-and-requirements.md`,
then only the implicated element guides:

- `architecture/surfaces/developing-surfaces.md` for actor-facing encounter
  points and interaction hierarchy;
- `architecture/structure/developing-c4-structure.md` for C4 boundaries,
  responsibilities, containment, and views; and
- `architecture/requirements/developing-requirements.md` for candidate
  obligations, inference, derivation, type, and subject placement.

Do not load all three for completeness. Direct accepted authoring uses the
corresponding `documenting-*` guide and skips this candidate route.

### Outside this skill

Implementation, executable test or Case implementation, Evaluation execution
and evidence production, backlog management, post-incident review, and
production or release authorization remain with their governing workflows.
Faithfully transferring accepted context into an in-scope Protocol or other
artifact is allowed; performing the adjacent work is not.

## Common workflow

1. **Bind outcome, scope, and authority.** Distinguish reading, analysis,
   drafting, repository mutation, and external mutation. Read local
   instructions and the applicable accepted sources. Identify who can ratify
   any open meaning and what action the user actually authorized.
2. **Orient from evidence.** Inventory material sources and preserve their
   provenance, availability, confidence, and authority. Reopen available
   authoritative sources after a delayed handoff. Never invent identifiers,
   links, timestamps, counts, environments, findings, or acceptance.
3. **Expose material meaning gaps.** Check for absent, underdeveloped,
   misplaced, disputed, stale, or contradicted Requirements, Surfaces, C4
   structure, responsibilities, boundaries, or Evaluation routes. When a gap
   is material, state its evidence, impact, stable options or candidate repair,
   labeled recommendation, applicable authority, and `blocking` or
   `non-blocking` status. A missing document is not automatically a Defect.
4. **Choose the primary route.** Select the work-item, established-corpus, or
   change-development branch. For established-corpus work, inspect exactly
   `<AXM-scope-root>/gen-stack/index.md` and verify its OKF and profile
   declarations before reading or editing corpus concepts. If the fixed path
   is absent, misplaced, or invalid, or the request is unsupported adoption
   work, apply that boundary before mutation.
5. **Classify maturity and impact.** Mark facts, hypotheses, candidates,
   recommendations, proposals, and accepted decisions. Identify Requirement,
   Architecture, Implementation, Evaluation, operational, and provenance
   impact without transferring authority among them. If desired state changes,
   separately specify the operation, baseline, exact delta, identity and
   lineage, consequences, authority, and action-specific blockers.
6. **Select representation by semantic fit.** Establish the artifact class and
   canonical owner, then inspect its native format and host contract. Apply any
   declared profile as a delta, map facts only to fields with exact semantics,
   and put only residual meaning in the body using the selected Guide's
   preferred logical order. Do not duplicate a native fact in prose, substitute
   a similarly named field, invent persistence metadata for a transient result,
   or let a derived view become independently authoritative. Use the Guide's
   target-neutral fallback only when no exact native affordance exists.
7. **Develop only the bounded response.** Preserve supplied context and open
   questions. Use the selected knowledge guide. Do not manufacture adjacent
   concepts, decisions, sections, or implementation detail for completeness.
8. **Pass a real human decision gate.** Stop before dependent mutation when an
   unresolved material decision or blocking gap controls that action. Present
   stable options, material tradeoffs, a recommendation, uncertainty, and the
   applicable authority. Continue when the gap is non-blocking and the current
   artifact or action can remain truthful; do not create ritual escalation.
9. **Choose the canonical home.** Put each accepted claim with its proper
   owner. Link peer artifacts rather than duplicating their authority. Choose
   the least durable adequate container for Change Design.
10. **Apply only the authorized mutation.** Make the smallest coherent change.
   External writes require an explicit request, an available tool, and exact
   target verification. Do not assign, prioritize, label, close, comment, or
   change workflow state unless separately authorized or required by an
   established in-scope process. For a batch, preserve item-local failures and
   do not claim atomic success unless the host actually provides it.
11. **Verify and hand off.** Check the result against every material source,
   local instructions, the applicable Guide, and the authority boundary. Read
   back external writes from the host; a submitted payload is not persistence
   evidence. Report the achieved outcome, verification, material gaps and their
   blocking status, unknowns, and any decision or authority still required.

## Work-item branch details

Classify without advancing lifecycle. Apply the common guides selected above
instead of reconstructing portable tracker policy from a type-specific
template:

- an unbounded request or idea remains a Signal or host-owned source record;
- a Defect Report preserves an observed discrepancy and hypotheses;
- a Bugfix Specification remains separate from provenance-bearing Defect
  Reports and requires an authorized correction;
- a Change Specification may be proposed and does not approve its contents;
- incident impact end, restoration, recovery, closure, and permanent
  correction may have separate states; and
- brief-only revision changes no body fact or structured field.

Inventory each originating occurrence by source type or system, stable
identifier, controlled-access link, observation time, relevant context, and
safe retrieval keys when applicable. Mark important unavailable evidence;
omit inapplicable fields. Preserve supplied findings, constraints, decisions,
proposals, sketches, sequence, testing strategy, tradeoffs, and open questions
with their provenance and authority state.

Treat host fields and labels as projections. Keep type, status,
classification, severity, priority, assignment, resolution, verification, and
relationships distinct. A label does not prove diagnosis or acceptance; a
status does not prove verification; an assignee does not supply decision
authority. Inspect the host schema before mapping, use each exact native field
once, and keep only facts without an exact native home in a compact body
fallback. Do not maintain a second metadata block for values already stored in
host fields. Preserve independently managed identities and source occurrences
through duplicate, merge, split, regression, reopening, closure, and
supersession decisions.

Analyze desired-state impact proportionately. Link stable Requirement IDs;
classify possible non-satisfaction, a candidate new or changed obligation,
implementation-only work, an evidence or interpretation gap, or unresolved
impact. Name Architecture and Evaluation consequences only from evidence.
Impact analysis identifies what may be affected; it does not choose or specify
the Requirement operation. For each actual desired-state change, apply the
common Requirement-change guide and use one independently decidable entry.
Choose addition, revision, or retirement as the primitive operation;
replacement, split, and merge compose retirement with one or more additions.
Do not assign canonical identifiers to candidates. Treat representation-only
maintenance and unresolved questions as non-operations, and state the truthful
stop condition. A subject change requires an explicit identity decision; a
split or merge creates new successor identities. Record partial acceptance,
rejection, or deferral per entry rather than advancing the entire work item.
For Defect Reports and Bugfix Specifications, always raise material
cross-stack meaning gaps rather than silently working around them. Include the
evidence, impact, options or candidate correction, recommendation, applicable
authority, and blocking status. A Defect Report may proceed with an
indeterminate expectation made visible. A Bugfix is blocked before dependent
correction work when no accepted expectation defines corrected behavior or
when unresolved Requirement subject or Architecture placement changes the
authorized response. A non-blocking Evaluation gap does not prevent an
otherwise truthful Bugfix Specification.
Derive the title and one- or two-sentence summary last from the authoritative
body. After any external write, retrieve the persisted item and correct only
within the original authorization. Report failed and unverified item identities
explicitly when a batch only partially persists.

## Established-corpus branch details

Before editing, verify explicit OKF v0.2 and supported-profile adoption at
`<AXM-scope-root>/gen-stack/index.md`. The fixed directory is a discovery
signal, not adoption authority. If the corpus is absent, at the repository
root, elsewhere, or invalid, apply the unsupported adoption boundary without
searching for or migrating another corpus. Then:

- resolve canonical meaning from the glossary and representation from the
  profile;
- bind every claim to accepted repository-local authority;
- co-develop candidate Architecture and Requirements when useful, but stop for
  human ratification before making either accepted;
- give every accepted Requirement one eligible Architecture subject and one
  canonical normative owner; do not use System as a catch-all;
- set every accepted Requirement to `requirement_lifecycle: active`; retire by
  preserving its identifier, last accepted expression, subject, rationale,
  sources, and decision Provenance under `## Lifecycle`, never by deletion;
- retain an identifier for a revision only when the obligation keeps its
  identity; create new identifiers for splits and merges, and record every
  retired predecessor in a successor's `supersedes` field;
- treat supersession as lineage only: do not infer equivalence, derivation, or
  implementation satisfaction; keep each historical Evaluation Result bound to
  the predecessor Requirement, Evaluation Protocol, Implementation revision,
  inputs, and environment it actually assessed, and leave successor
  satisfaction unknown until successor-specific evidence supports it;
- preserve Intent as non-binding direction and Architecture as durable subject,
  responsibility, boundary, relationship, decision, and response meaning;
- author only the requested governed concept and navigation it earns;
- keep Implementation, Signals, Observations, Feedback, executable Cases and
  tests, Suites, Executions, Results, Reports, and other run evidence
  repository-native, using their existing schemas and link fields before adding
  residual Gen Stack context; and
- use the governed `evaluations/protocols/` area for explicitly accepted
  Evaluation Protocols, organized by Requirement-satisfaction,
  Architecture-realization, or Implementation-conformance role; keep
  `evaluations/index.md` navigational and do not invent Protocol coverage.

Follow the selected Author Guide and exact profile structure. For one accepted
Requirement, put the normative expression in `## Requirement` and its reason in
`## Rationale`; identify the external target, version, conformance class or
profile, applicability, and deviations when incorporating a normative
specification. Run the established OKF check against
`<AXM-scope-root>/gen-stack` and
`knowledge/gen-stack/scripts/validate-gen-stack-profile.py <AXM-scope-root>`
when their provenance and effects fit the request. Report OKF conformance,
profile conformance, and coverage or satisfaction claims separately; preserve
`unknown`.

Completion means the requested analysis, draft, authorized work item, or
accepted corpus concept exists at the correct authority boundary; material
sources remain traceable or explicitly unavailable; maturity and action
authority and any material gap disposition are visible; and no product,
Requirement, Architecture,
implementation, evaluation, delivery, priority, or release decision has been
smuggled into it.
