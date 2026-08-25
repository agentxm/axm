---
type: Guide
title: Expressing invariants
description: How to classify an invariant, admit accepted preservation obligations as Requirements, and connect their scope and observation boundary to architecture, enforcement, and evidence.
tags: [invariants, requirements, specification, domain-rules, consistency, verification, documentation]
status: draft
sources:
  - id: software-architecture-profile
    resource: ../architecture-documentation/software-architecture-application-profile.md#requirement
    title: Software architecture docs application profile — Requirement
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: nasa-requirements
    resource: https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/
    title: NASA — How to Write a Good Requirement
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:19:59Z
---

# Expressing invariants

Use this guide when a requirement, domain model, design, proof, or
implementation needs to state a property that must survive every permitted
change. It first routes the invariant to its semantic owner; it does not create
a separate architecture “Invariant record.” For the concept and its
relationship to safety, liveness, contracts, and enforcement, read
[Invariants, preservation, and
enforcement](../foundations/invariants-and-enforcement.md).

## Goal

Place the invariant with the authority that owns its role. For an accepted
obligation, produce one subject-centered Requirement whose predicate and
observation boundary are clear enough to guide architecture and reveal a
violation.

## Before you begin

Gather:

- the domain rule, need, policy, risk, decision, parent Requirement, or other
  authority from which the invariant comes;
- the system or model states it may govern;
- the operations that can affect it;
- the eligible architecture subject, when it is accepted desired state; and
- the existing authorities for architecture, proof, implementation, and
  evidence.

Do not invent a mandatory invariant merely because a stronger system sounds
desirable. Confirm its authority, necessity, feasibility, and consequences.

## 1. Classify the invariant's role

Use the role, not the word *invariant*, to select its canonical owner:

| Role | Canonical owner |
| --- | --- |
| Accepted desired state of the documented System or an eligible architecture subject | Requirement |
| Domain definition that explains valid state | Domain model or source concept |
| Loop, object, representation, or database condition used by the realization | Code, schema, or executable contract |
| Stronger inductive or auxiliary property used to establish another claim | Proof or formal model |
| Scenario condition used to clarify one case | Use Case, example, or test, without claiming universal satisfaction |

*Invariant* describes preservation semantics; it is not a competing profile
concept or requirement type. If the claim is an accepted obligation, continue
with the Requirement route below. Otherwise preserve it with its identified
authority and link any Requirement it helps define, realize, or establish.

## 2. Confirm that preservation is the intended claim

Ask: **Must this condition hold at every relevant observation point, regardless
of which permitted operation led there?**

If not, choose the narrower statement:

| If the condition… | Express it as… |
| --- | --- |
| must hold before one operation | a precondition |
| must hold after one operation | a postcondition |
| describes an allowed change | a transition constraint |
| must eventually become true | a liveness, progress, or convergence Requirement when accepted |
| is a future condition being pursued | a target state or outcome source |
| defines an acceptable measurable level | a quality or performance Requirement when accepted |
| decides whether one scenario is accepted | an acceptance criterion or evidence rule |

Do not force every prohibition or progress property into an invariant. Preserve
the semantics the authority actually requires.

## 3. Identify the protected truth, subject, and boundary

Explain in working notes:

- which domain truth, responsibility, boundary, or quality the invariant
  protects;
- what failure becomes possible without it;
- which source or owner decides whether it is valid;
- the smallest eligible architecture subject that is obligated; and
- the relevant states or observation points.

Common observation boundaries include:

- after creation and after every public operation;
- before each loop test;
- at transaction commit;
- after every accepted command;
- in every buildable repository revision; or
- in every externally observable system state.

Avoid an unqualified “always.” When reconciliation is asynchronous, use a
local invariant Requirement plus a distinct progress or convergence
Requirement rather than claiming consistency over intermediate states.

## 4. Draft one invariant Requirement

Follow [Documenting requirements](documenting-requirements.md) and use this
specialized pattern:

> At every **[relevant state or observation point]**, **[subject]** shall
> preserve **[predicate]** within **[scope or bounds]**.

Prefer domain terms and explicit quantifiers such as *every*, *exactly one*,
*at most one*, or *no*. Define tolerances and exceptional states. Keep
rationale, mechanism, examples, and independently changeable predicates out of
the binding statement. NASA's requirements guidance likewise recommends a
clear subject and predicate, one thought per statement, explicit tolerances,
rationale, and a verifiable formulation.[^nasa-requirements]

Weak Requirement:

> The Billing context shall keep invoice totals consistent.

Stronger Requirement:

> At every committed state, the Billing context shall preserve each posted
> invoice's total as the sum of its posted line amounts in the invoice
> currency.

Choose `functional`, `quality`, `process`, `human-factors`, `usability`, or
`constraint` according to what is required. Do not add an `invariant`
requirement type.

## 5. Analyze establishment and preservation

For architecture and evidence planning, identify:

1. how newly created or migrated state first satisfies the Requirement;
2. every class of operation that could affect its predicate; and
3. which boundary or authority restores or rejects a violating change.

This analysis often reveals missing responsibility, an infeasible subject, or
derived Requirements. If preservation requires coordinated updates across
independently authoritative components, reconsider the ownership, transaction,
or consistency boundary. Keep implementation-specific auxiliary invariants
with their proof or realization authority.

## 6. Add examples and counterexamples

Give at least one representative satisfying state and one violation. Include a
boundary case when quantifiers, nullability, empty collections, rounding,
concurrency, or failure recovery could change interpretation.

Examples clarify the Requirement; they do not become its semantic authority.
Tests and executable examples own the precise cases they exercise.

## 7. Explain the architecture response

Link the Requirement from architecture concepts that identify:

- the subject and state authority;
- the transaction, consistency, or observation boundary;
- coordination across independently authoritative elements;
- dependency direction or encapsulation that supports preservation; and
- accepted decisions that respond to the obligation.

Do not repeat the binding predicate in the architecture concept. Explain why
the structure can preserve it and what consequence the response addresses.

## 8. Choose evidence or enforcement

Select mechanisms that match the claim's scope and consequence:

| Mechanism | What it can contribute |
| --- | --- |
| Type or constructor | Prevent or reject invalid local representations |
| Database or schema constraint | Reject invalid stored states within its declared semantics |
| Encapsulated domain operation | Preserve a rule at an authority boundary |
| Static architecture or policy check | Detect mechanically decidable structural violations |
| Property, contract, or scenario test | Search for counterexamples over exercised cases |
| Model checker or proof | Establish the modeled property within stated assumptions |
| Monitoring or audit | Detect violations in observed operation after they occur |
| Human review | Judge contextual properties that resist sound automation |

Record only what each mechanism establishes. Let the Requirement own the
accepted predicate, subject, conditions, bounds, and rationale; architecture
own the preservation response; and executable mechanisms own detailed
enforcement logic. Evidence that claims satisfaction should reference the
stable `requirement_id`.

## 9. Place, trace, and maintain each role

- Place an accepted invariant Requirement beneath its eligible architecture
  subject with the profile's required identity, type, statement, rationale,
  and proportionate source or derivation links.
- Keep domain definitions with the relevant model and link them as
  `requirement_sources` when they justify the obligation.
- Keep data and implementation invariants with schema, type, code, or
  migration authority.
- Keep inductive and auxiliary invariants with their proof or formal model.
- Let architecture concepts link the Requirement while explaining state
  authority, observation boundary, coordination, transaction, or dependency
  response.

Do not add an `Invariant` concept, custom invariant record, or second stable ID
for the same accepted obligation. Retire or revise an obsolete Requirement and
reconsider its architecture response and guardrails together.

## Final check

Before accepting an invariant Requirement, verify:

- it is an accepted obligation of one eligible subject rather than an
  aspiration, definition, proof aid, or implementation condition;
- it makes a preservation claim;
- its quantifiers, predicate, scope, and observation boundary are explicit;
- initial states establish it and permitted transitions preserve it;
- progress Requirements are stated separately;
- synchronous and eventual consistency are not conflated;
- a counterexample would be recognizable;
- the Requirement is traceable to its source and colocated with its subject;
- architecture links it without duplicating the normative predicate; and
- implementation invariants and evidence remain with their exact authorities.

[^nasa-requirements]: NASA's checklist asks for atomic, unambiguous
    requirements with a clear subject and predicate, rationale, traceability,
    tolerances where applicable, and a feasible verification method.
