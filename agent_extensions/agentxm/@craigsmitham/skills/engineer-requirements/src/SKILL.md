---
name: engineer-requirements
description: Develops, specifies, reviews, changes, and maps evidence-aware requirements. Use when asked to elicit or inventory requirement sources; turn needs, rules, observations, or existing behavior into requirement candidates; draft, revise, classify, split, merge, or review requirements or bounded requirement sets; choose a specification method; analyze requirement impact or lineage; or map requirements into a repository or requirements-management host. Not for product strategy, accepting or prioritizing requirements, architecture or design, implementation, test execution, general work-item management, or legal compliance determinations.
---

# Engineer requirements

Develop and maintain truthful, assessable requirements while adapting their
representation and rigor to the project that owns them.

This skill is a non-standalone member of the Requirements Engineering pack.
Resolve knowledge through the active AXM scope. In a source workspace, the
paths below are exact paths beneath that scope root; do not rebase them beneath
this skill package or scan for alternate copies. If the exact workspace paths
are absent, resolve the installed
`@craigsmitham/knowledge/requirements-engineering` pack sibling through active
AXM state.

Always read:

- `knowledge/requirements-engineering/src/foundations/portable-requirements-engineering.md`;
- `knowledge/requirements-engineering/src/foundations/requirement-authority-and-maturity.md`;
- `knowledge/requirements-engineering/src/authoring/requirement-content-contract.md`; and
- `knowledge/requirements-engineering/src/adaptation/applying-project-specific-requirements-policy.md`.

Then read only the narrowest applicable route below.

## Route the request

### Source elicitation and candidate development

Read `development/eliciting-and-inventorying-requirement-sources.md` when the
request concerns stakeholder, evidence, rule, context, or source discovery.
Add `development/developing-candidate-requirements.md` when turning that
material into proposed obligations, and
`development/resolving-conflicts-and-open-decisions.md` when sources conflict or
material values, quantities, applicability, or decisions remain open.

Inferences from code, tests, current behavior, documents, issues, analytics, or
interviews remain sourced observations or candidates. Do not present them as
normative requirements without applicable acceptance evidence.

### Requirement authoring or revision

Read `authoring/authoring-requirements.md`. Add:

- `development/choosing-requirement-subject-and-level.md` when the obligated
  subject, allocation, or abstraction level is unclear;
- `authoring/classifying-requirements.md` for classification, using a declared
  local taxonomy before the portable fallback lens;
- `authoring/selecting-a-specification-method.md` when choosing between prose,
  structured syntax, examples, tables, models, or formal notation;
- `authoring/authoring-quantitative-and-quality-requirements.md` for measurable
  quality or quantitative obligations;
- `authoring/authoring-constraints-and-external-conformance.md` for solution
  constraints or external rules, standards, contracts, and interfaces;
- `authoring/authoring-invariants-and-stateful-behavior.md` for state,
  transition, concurrency, retry, or failure-path rules; and
- `authoring/requirement-template.md` only when the host lacks an adequate form
  or the user explicitly requests the portable fallback.

Do not invent missing targets, units, standard versions, stakeholder agreement,
priority, feasibility, architecture, or implementation detail. Preserve an
explicit candidate, assumption, or open decision instead.

For an underspecified quantitative or quality candidate, explicitly account for
the subject, scope or population, environment, workload, measure and unit,
aggregation or percentile, observation window, measurement point, target or
tolerance, and assessment method. Mark each material missing dimension as an
open decision; do not omit it merely because no value can yet be supplied.

### Requirement review

Read `review/reviewing-individual-requirements.md` for one or more individually
bounded reviews. Read `review/reviewing-requirement-sets.md` when consistency,
coverage, balance, or set-level completeness is in scope. Declare the reviewed
boundary, revision, sources, exclusions, and unavailable evidence. Do not claim
universal completeness from a bounded review.

Review findings do not themselves accept, reject, prioritize, or revise a
requirement unless the request grants the applicable authority and target.

### Impact, change, identity, and lineage

Read `lifecycle/analyzing-requirement-impact.md` for impact analysis and
`lifecycle/specifying-requirement-changes.md` when defining exact before/after
meaning. Add `lifecycle/maintaining-requirement-identity-and-lineage.md` for
revision, split, merge, supersession, or retirement.

Keep prior evidence bound to the exact requirement identity and revision. A
split, merge, or semantic change does not automatically transfer satisfaction.

### Authority, evidence, and host mapping

Read `foundations/requirements-and-neighboring-artifacts.md` when the boundary
with goals, designs, plans, work items, assessments, or evidence matters. Read
`foundations/verification-and-validation.md` when either evidence question is in
scope. Read `foundations/one-authority-many-witnesses.md` for traceability,
duplicates, generated views, or competing copies.

Read `adaptation/mapping-to-requirements-hosts.md` for repository or external
host fields and any mutation. If Work Management is installed and the request
explicitly concerns a coordinating Defect Report, Change, or Operational
Incident Record, read `adaptation/composing-with-work-management.md` and hand
off that record operation to its owning skill. This pack does not require Work
Management.

## Workflow

1. **Bind outcome, boundary, and authority.** Identify whether the requested
   result is discovery, analysis, candidate authoring, normative revision,
   review, impact analysis, host mapping, or an authorized write. Resolve the
   subject, scope, target, and current revision. Skill activation grants no
   acceptance or mutation authority.
2. **Read local policy and host state.** Read applicable repository instructions,
   domain vocabulary, classification, authoritative host, decision policy,
   templates, relationship types, and disclosure constraints. Inspect
   discoverable state instead of asking for it.
3. **Inventory sources before synthesis.** Preserve source identity, version,
   applicability, claims, observations, assumptions, confidence, conflicts,
   and unavailable evidence. Distinguish quoted or observed facts from
   interpretation and proposed obligation.
4. **Choose maturity, subject, and form.** Keep unresolved obligations as
   candidates. Choose a subject and level appropriate to the decision. Select
   the lightest specification form that controls the relevant ambiguity and
   consequence.
5. **Compose or analyze the requirement.** Apply the portable content contract
   plus local obligations. State conditions, outcome, bounds, source, rationale,
   relationships, verification approach, validation basis, and material
   unknowns. Keep requirement, design, work, assessment, and evidence authority
   distinct.
6. **Check quality and relationships.** Test necessity, appropriateness,
   clarity, singularity, feasibility, assessability, consistency, traceability,
   and changeability at the requested scope. Name conflicts and open decisions
   rather than resolving them without authority.
7. **Map through the native host.** Use each exact native field and typed link
   once; put only residual semantics in body content. Generated or copied views
   remain witnesses unless local policy says otherwise.
8. **Apply only authorized mutation.** An explicit write request and verified
   target are required for repository or external host changes. Do not approve,
   prioritize, assign, baseline, supersede, retire, or change status unless the
   request or established in-scope policy authorizes that exact action.
9. **Verify and hand off.** Compare the result with source evidence and local
   instructions. Read back external writes. Report identity, maturity,
   authority, reviewed boundary, material unknowns, evidence limits, and any
   requested action that remains unverified.

## Decision support

When a material choice remains open and the user requested analysis, present
two or three viable options with evidence, consequences, reversibility, and a
recommendation when supportable. Identify the decision authority. Do not hide
a decision inside apparently normative wording.

## Authority and safety boundaries

- Do not infer acceptance, priority, baseline status, satisfaction, or
  retirement from polished wording, location, label, implementation, passing
  tests, or absence of objections.
- Do not perform product strategy, architecture, design, implementation, test
  execution, release, or general work-item operations merely because a
  requirement relates to them.
- Do not make legal, regulatory, certification, safety, or security-conformance
  determinations beyond supplied competent evidence. Preserve unknown
  applicability and seek the appropriate authority.
- Do not put credentials, personal information, private customer content,
  confidential commercial information, or exploitable security details in a
  public requirement. Use safe summaries and governed evidence locations.
- Stop before a dependent mutation when its target, disclosure boundary,
  decision authority, or material content is unresolved. Preserve the truthful
  candidate or review and name the exact missing input or authorization.

Completion means the requested requirement artifact or bounded analysis is
truthful at the authorized target; maturity and authority are explicit; local
policy and the content contract are satisfied; evidence, uncertainty,
relationships, and review bounds are preserved; any write was read back; and no
adjacent decision, design, implementation, assessment, or work-management
authority was inferred.
