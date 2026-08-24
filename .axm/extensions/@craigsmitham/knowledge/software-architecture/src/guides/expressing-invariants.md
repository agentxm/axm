---
type: Guide
title: Expressing invariants
description: How to distinguish an invariant from neighboring requirements, state its scope and observation boundary precisely, and connect it to preservation obligations and evidence.
tags:
  [
    invariants,
    requirements,
    specification,
    acceptance-criteria,
    domain-rules,
    consistency,
    verification,
    documentation,
  ]
status: draft
sources:
  - id: nasa-requirements
    resource: https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/
    title: NASA — How to Write a Good Requirement
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T23:43:26Z
---

# Expressing invariants

Use this guide when a requirement, domain model, design, or architecture needs
to state a property that must survive every permitted change. For the concept
and its relationship to safety, liveness, contracts, and enforcement, read
[Invariants, preservation, and
enforcement](../foundations/invariants-and-enforcement.md).

## Goal

Produce an invariant whose subject, predicate, scope, observation boundary,
preservation obligations, rationale, and evidence are clear enough to guide
design and reveal a violation.

## Before you begin

Gather:

- the domain rule, requirement, risk, or authority from which the invariant
  comes;
- the system or model states it may govern;
- the operations that can affect it; and
- the existing source of truth for requirements and enforcement.

Do not invent a mandatory invariant merely because a stronger system sounds
desirable. Confirm its authority and consequences with the people or sources
that own the governed domain.

## 1. Confirm that preservation is the intended claim

Ask: **Must this condition hold at every relevant observation point, regardless
of which permitted operation led there?**

If not, choose the narrower statement:

| If the condition…                        | Express it as…                                   |
| ---------------------------------------- | ------------------------------------------------ |
| must hold before one operation           | a precondition                                   |
| must hold after one operation            | a postcondition                                  |
| describes an allowed change              | a transition constraint                          |
| must eventually become true              | a liveness, progress, or convergence requirement |
| is the future condition being pursued    | a target state or outcome                        |
| defines an acceptable measurable level   | a threshold, performance requirement, or SLO     |
| decides whether one scenario is accepted | an acceptance criterion                          |

An invariant can also be a requirement, acceptance criterion, or design
constraint. These terms classify different things: _invariant_ describes the
condition's preservation semantics, while the others describe its role in a
development or governance process.

## 2. Identify the protected truth and its authority

Write one sentence explaining:

- what domain truth, responsibility, boundary, or quality the invariant
  protects;
- what failure becomes possible without it; and
- which source or owner decides whether the statement is valid.

This rationale is not part of the predicate, but it prevents arbitrary rules
from masquerading as invariants and helps reviewers judge whether enforcement
cost is proportionate.

## 3. Bound the subject and state space

Name the smallest scope over which the preservation claim is actually true:

- one value or entity;
- all instances of a type;
- one aggregate or transaction;
- one component or dependency graph;
- one deployed subsystem; or
- the whole system.

Then name the relevant states. Common observation boundaries include:

- after creation and after every public operation;
- before each loop test;
- at transaction commit;
- after every accepted command;
- in every buildable repository revision; or
- in every externally observable system state.

Avoid an unqualified “always.” Name the stable boundary explicitly. When
reconciliation is asynchronous, specify a local invariant plus a separate
convergence requirement. [Invariants expose boundaries and
authority](../foundations/invariants-and-enforcement.md#invariants-expose-boundaries-and-authority)
explains why these distinctions change the architectural claim.

## 4. State one precise predicate

Use this basic form:

> For every **[subject]** within **[scope]**, at every **[relevant state or
> observation point]**, **[predicate]** must hold.

Prefer domain terms and explicit quantifiers such as _every_, _exactly one_,
_at most one_, or _no_. Define tolerances and exceptional states. Keep rationale,
mechanism, and multiple independent predicates out of the normative sentence.
NASA's requirements guidance similarly recommends a clear subject and
predicate, one thought per statement, explicit tolerances, rationale, and a
verifiable formulation.[^nasa-requirements]

Weak:

> Invoice totals must be consistent.

Stronger:

> At every committed state, each posted invoice's total equals the sum of its
> posted line amounts in the invoice currency.

The stronger version gives a reviewer a concrete counterexample to look for.

## 5. Record establishment and preservation obligations

List:

1. how newly created or migrated state first satisfies the invariant;
2. every class of operation that could affect its predicate; and
3. which boundary or authority must restore or reject a violating change.

This step often reveals missing ownership. If preserving the predicate requires
coordinated updates across independently authoritative components, reconsider
the ownership, transaction, or consistency boundary instead of leaving an
unfunded promise in prose.

## 6. Add examples and counterexamples

Give at least one representative satisfying state and one violation. Include a
boundary case when quantifiers, nullability, empty collections, rounding,
concurrency, or failure recovery could change the interpretation.

Counterexamples are especially useful for qualitative architectural
invariants. “Policy code does not depend on adapter implementations” becomes
clearer when the document names a forbidden policy-to-adapter import and an
allowed adapter-to-policy import.

## 7. Choose evidence or enforcement

Select the mechanism that matches the claim's scope and consequence:

| Mechanism                            | What it can contribute                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| Type or constructor                  | Prevent or reject invalid local representations            |
| Database or schema constraint        | Reject invalid stored states within its declared semantics |
| Encapsulated domain operation        | Preserve a rule at an authority boundary                   |
| Static architecture or policy check  | Detect mechanically decidable structural violations        |
| Property, contract, or scenario test | Search for counterexamples over exercised cases            |
| Model checker or proof               | Establish the modeled property within stated assumptions   |
| Monitoring or audit                  | Detect violations in observed operation after they occur   |
| Human review                         | Judge contextual properties that resist sound automation   |

Use [Enforcement and
evidence](../foundations/invariants-and-enforcement.md#enforcement-and-evidence)
to distinguish prevention, proof, counterexample search, and detection. Record
only what the selected mechanism guarantees. Let prose own the invariant's
meaning, boundary, rationale, and source; link to the executable mechanism that
owns detailed enforcement logic rather than maintaining two independently
editable formulas.

## 8. Place, trace, and maintain it

Keep the invariant near the authority it constrains:

- domain invariants with the relevant model or aggregate;
- data invariants with schema and migration authority;
- architectural invariants with the affected boundary or architecture view;
- externally imposed invariants with their requirement and source.

Give it a stable identifier when other requirements, decisions, tests, or
checks must trace to it. Record an owner and review trigger when domain rules,
state boundaries, consistency models, or enforcement mechanisms can change.
Retire or revise an obsolete invariant rather than preserving its guardrail
after the underlying authority has changed.

## Invariant record

Use only the fields the host repository needs, but cover these questions:

| Field                   | Question                                                     |
| ----------------------- | ------------------------------------------------------------ |
| Name or ID              | How will related artifacts refer to it?                      |
| Statement               | What predicate must remain true?                             |
| Scope                   | Which subjects and system boundary does it quantify over?    |
| Observation boundary    | At which states must it hold?                                |
| Rationale               | What truth or risk does it protect?                          |
| Authority               | Who or what makes it normative?                              |
| Establishment           | How do initial and migrated states satisfy it?               |
| Preservation            | Which operations and owners must maintain it?                |
| Examples                | What satisfying and violating cases clarify it?              |
| Evidence or enforcement | How is conformance proved, prevented, detected, or reviewed? |
| Exceptions              | Which explicit cases are outside the claim?                  |
| Lifecycle               | Who reviews it, and what changes trigger review?             |

## Final check

Before accepting the invariant, verify:

- it makes a preservation claim rather than merely naming an aspiration;
- its subject, quantifiers, predicate, scope, and observation boundary are
  explicit;
- initial states establish it and permitted transitions preserve it;
- progress requirements are stated separately;
- synchronous and eventual consistency are not conflated;
- a counterexample would be recognizable;
- evidence or enforcement matches the claim without overstating assurance; and
- the statement is traceable to its authority and maintained near the system
  boundary it governs.

[^nasa-requirements]:
    NASA's checklist asks for atomic, unambiguous requirements with a
    clear subject and predicate, rationale, traceability, tolerances where
    applicable, and a feasible verification method.
