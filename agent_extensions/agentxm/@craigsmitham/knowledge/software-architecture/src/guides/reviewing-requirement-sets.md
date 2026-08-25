---
type: Guide
title: Reviewing a requirement set
description: How to declare and review a bounded set of requirements for completeness, consistency, combined feasibility, comprehensibility, and ability to satisfy its source needs without treating an open-world architecture corpus as a complete specification.
tags: [requirements-engineering, requirement-set, review, validation, completeness, consistency]
status: draft
sources:
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
  - id: requirements-engineering
    resource: ../foundations/requirements-engineering.md
    title: Requirements engineering in software architecture
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T00:00:00Z
---

# Reviewing a requirement set

Use this guide to decide whether a declared set of accepted requirements is
fit to guide architecture, realization, or a named agreement. Set review is a
separate job from reviewing each Requirement: individually clear obligations
can still omit a need, conflict, exceed combined constraints, or fail to
produce the intended outcome.[^requirements-engineering]

## Before you start

Name the authority that can accept the set-level conclusion and gather:

- the requirements included in the review;
- their source needs, policies, use cases, risks, and parent requirements;
- the architecture subjects and boundaries they obligate;
- applicable constraints, terminology, units, decisions, and assumptions; and
- participants able to assess stakeholder intent, architecture, feasibility,
  and evidence.

Do not infer completeness from profile conformance or from the absence of
obvious TODOs.

## 1. Declare the set boundary

State what the set covers and why it is being reviewed. Useful boundaries can
include a system, capability, use case, operational scenario, interface,
baseline, release, or other explicitly named scope. Also state material
exclusions and the source authorities against which completeness and
validation will be judged.

This architecture profile is open-world: it may contain only selected,
architecture-significant requirements. If the reviewed collection is a
partial view, call it partial or selected. It can still be reviewed for
consistency, feasibility, and comprehension, but it cannot support a claim
that the system's requirements are complete.

## 2. Assemble a reviewable view

Generate or collect a view that resolves stable `requirement_id` values and
shows each Requirement's subject, type, source, and derivation where present.
Do not create a second semantic authority or add temporary review fields to
the Requirements.

Before set review, resolve or explicitly carry forward failed individual
reviews. A set conclusion should not hide requirements that remain ambiguous,
infeasible, unvalidated, or otherwise unready.[^documenting-requirements]

## 3. Review the five set characteristics

The five characteristics are adapted from ISO/IEC/IEEE 29148:2018.[^iso-29148]

| Characteristic | Questions and useful evidence |
| --- | --- |
| **Complete for the declared boundary** | Does every in-scope source need or obligation have an accepted disposition? Are applicable behavior, quality, interfaces, constraints, states, modes, failure conditions, lifecycle stages, and stakeholder groups covered? Are unresolved placeholders or decisions named rather than silently omitted? |
| **Consistent** | Do requirements avoid conflict, accidental overlap, and duplication? Do the same terms, units, measurement systems, states, and boundaries mean the same thing throughout? Do derived requirements remain compatible with their parents and sibling allocations? |
| **Feasible in combination** | Can the whole set be realized within the combined technical, cost, schedule, legal, operational, and risk constraints? Do individually feasible targets become infeasible when applied together? Have architecture tradeoffs and shared-resource limits been considered? |
| **Comprehensible** | Can affected readers understand what each subject must do or be and how the requirements relate to the system and one another? Are organization, terminology, links, and generated views sufficient without a separate shadow specification? |
| **Able to be validated** | Is it practicable to determine that satisfying the set would achieve the source needs in the intended context? Do representative scenarios, stakeholder reviews, prototypes, models, or simulations exercise success, alternatives, failures, and material boundary cases? |

Use review evidence proportionate to risk. A small, familiar capability may
need a stakeholder walkthrough and architecture review. A critical or novel
system may require formal models, simulations, prototypes, trade studies, or
independent review.

## 4. Exercise cross-requirement scenarios

Walk representative scenarios through the architecture subjects and the
declared set. Include the main success path plus material alternatives,
failures, concurrency, recovery, and lifecycle conditions. Ask:

- Which requirements jointly govern this outcome?
- Is any required behavior or quality outcome missing?
- Can two requirements demand incompatible responses in the same state?
- Do lower-level obligations still satisfy their parents?
- Would satisfying every visible statement produce the stakeholder outcome?

Scenarios reveal interactions that isolated statement review misses. They are
review evidence, not substitutes for maintained requirements.

## 5. Resolve findings through their authorities

Classify each finding before editing:

- missing or incorrect need understanding;
- missing, duplicate, conflicting, or poorly formed requirement;
- infeasible combination or unresolved tradeoff;
- architecture responsibility or boundary problem;
- missing or insufficient evidence; or
- navigation or generated-view problem.

Route the correction to the authority that owns it. Do not resolve a product
tradeoff, change an accepted obligation, or invent a target merely to make the
set appear consistent.

## 6. Record a bounded conclusion

Record:

- the set boundary and exclusions;
- the reviewed Requirement identities and source baseline or retrieval method;
- reviewers or review authority by stable role or mechanism;
- evidence used;
- the result for each set characteristic;
- unresolved findings, accepted risks, and responsible authorities; and
- the event that requires reassessment.

Preserve `unknown` when evidence cannot support a conclusion. A set may be
consistent and comprehensible while completeness or validation remains
unknown. Do not convert those separate results into a single unqualified pass.

Set review does not require `set_status`, reviewer, verification-method, or
evidence backlinks in every Requirement. Keep the review record with the
applicable baseline, assurance, decision, or evaluation authority and resolve
Requirements by stable identifier.

## Common mistakes

- Treating every Requirement's individual review as proof that the set is
  complete or valid.
- Claiming completeness without a declared boundary and source baseline.
- Treating an intentionally selected architecture subset as the complete
  requirements specification.
- Checking vocabulary consistency while ignoring contradictory outcomes or
  combined feasibility.
- Calling every change “requirements creep”; controlled change can be the
  correct response to new evidence or a changed need.
- Copying the set into a review document that becomes a competing authority.

[^documenting-requirements]: Documenting requirements owns the individual
    Requirement authoring, verification, validation, placement, and change
    procedure that precedes set review.
[^iso-29148]: ISO/IEC/IEEE 29148:2018 distinguishes characteristics of a set of
    requirements from characteristics of each individual requirement.
[^requirements-engineering]: Requirements engineering in software architecture
    explains why completeness is bounded and why an open-world architecture
    corpus is not automatically a complete specification.
