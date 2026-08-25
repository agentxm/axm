---
type: Explanation
title: Invariants, preservation, and enforcement
description: What makes a property invariant, how state and observation boundaries qualify its preservation, and how invariants relate to requirements, correctness, and enforcement.
tags: [invariants, safety-properties, preservation, consistency, design-by-contract, domain-modeling, architecture-tests, verification]
status: draft
sources:
  - id: lamport-high-level
    resource: https://lamport.azurewebsites.net/tla/high-level-view.html
    title: Leslie Lamport — A high-level view of TLA+
  - id: lamport-proving-safety
    resource: https://lamport.azurewebsites.net/tla/proving-safety.pdf
    title: Leslie Lamport — Proving Safety Properties
  - id: lamport-safety-liveness
    resource: https://lamport.azurewebsites.net/tla/safety-liveness.pdf
    title: Leslie Lamport — Safety, Liveness, and Fairness
  - id: meyer-contract
    resource: https://se.inf.ethz.ch/~meyer/publications/old/dbc_chapter.pdf
    title: Bertrand Meyer — Design by Contract
  - id: dafny-loop-invariants
    resource: https://dafny.org/dafny/DafnyRef/DafnyRef#sec-loop-invariants
    title: Dafny Reference Manual — Loop invariants
  - id: ocl
    resource: https://www.omg.org/spec/OCL/2.0/
    title: OMG Object Constraint Language 2.0
  - id: evans-ddd-reference
    resource: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    title: Eric Evans — Domain-Driven Design Reference
  - id: postgresql-constraints
    resource: https://www.postgresql.org/docs/current/ddl-constraints.html
    title: PostgreSQL — Constraints
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:19:59Z
---

# Invariants, preservation, and enforcement

An **invariant** is a property that must remain true throughout a defined set
of states or across every permitted transition. It expresses something the
system may change *without ceasing to preserve*.

The property, not necessarily any individual value, is invariant. A loop may
change its counter on every iteration while preserving `0 <= counter <= limit`.
Dafny therefore describes a loop invariant as a Boolean property that holds on
entry and is re-established after every execution of the loop body.[^dafny-loop-invariants]

This preservation claim distinguishes an invariant from an important goal,
preference, or desired future state. “Orders should be fulfilled promptly” is
not an invariant. “At every committed state, allocated quantity does not
exceed ordered quantity” can be one.

For a practical authoring process, see [Expressing
invariants](../guides/expressing-invariants.md).

## Invariance is semantics, not a documentation authority

An invariant describes preservation semantics. Its canonical owner depends on
the role the claim plays:

- an accepted condition that the documented System or an eligible
  architecture subject must preserve is a Requirement;
- a domain definition can be a source that explains valid state without
  becoming a second binding formulation;
- a loop, object, representation, or database invariant normally belongs to
  the executable implementation authority; and
- a stronger inductive or auxiliary invariant belongs to the proof or model
  that uses it.

Architecture identifies the subject, responsibility, state authority,
observation boundary, and structural response. When the invariant is accepted
desired state, the Requirement alone owns its normative predicate and stable
identity. Architecture, enforcement, and evidence link to it rather than
maintaining parallel formulas.

## An invariant is a predicate over named states

An invariant has three indispensable parts:

1. a **subject and scope** — the entities, component, model, or system to which
   it applies;
2. a **predicate** — the condition that can be true or false; and
3. a **state or observation boundary** — the points at which it must hold.

“Customer data remains valid” leaves all three open. A stronger statement is:

> At every committed state, each active subscription has exactly one active
> billing account.

The quantifier (“each”), relevant state (“committed”), subject
(“active subscription”), and predicate (“exactly one active billing account”)
make a preservation obligation visible.

The observation boundary matters because real operations often pass through
temporarily inconsistent internal states. In Design by Contract, Meyer treats
a class invariant as a consistency constraint on observable states: it holds
after creation and after each exported operation, although it need not hold
between those points.[^meyer-contract] A database constraint may similarly be immediate
or deferred until a transaction boundary. Calling either condition “always
true” without naming that boundary overstates the guarantee.

## Establishment and preservation

An invariant creates two proof obligations, whether they are discharged by
formal proof, design reasoning, tests, or an enforcing mechanism:

- **Establishment:** every permitted initial or created state satisfies it.
- **Preservation:** every permitted transition that begins in a satisfying
  state ends at the next relevant observation point in a satisfying state.

Lamport gives the corresponding inductive form for state machines: initial
states imply the invariant, and the invariant together with the next-state
relation implies the invariant in the next state.[^lamport-proving-safety] This way of
thinking remains useful without a formal specification: constructors establish
object invariants, domain operations preserve aggregate invariants, migrations
establish data invariants, and dependency rules preserve architectural
invariants across implementation changes.

The property people want to establish is not always strong enough to support
an inductive argument. A **desired invariant** says what the accepted
Requirement obliges its subject to preserve; an **inductive invariant**
contains enough additional information to show that every transition
preserves it. Proofs and model checkers may therefore need a stronger auxiliary
invariant even when the Requirement should continue to state only the domain
truth it protects.[^lamport-proving-safety]

## Related correctness statements

“Invariant” should not become a synonym for every mandatory statement.

| Statement | Question it answers |
| --- | --- |
| Invariant | What must hold at every relevant state? |
| Precondition | What must be true before this operation may begin? |
| Postcondition | What must this operation make true when it completes? |
| Transition constraint | Which changes from one state to another are permitted? |
| Safety property | What bad occurrence or behavior must never happen? |
| Liveness or progress property | What good occurrence must eventually happen? |
| Target state or outcome | What condition are we trying to reach? |
| Performance requirement or threshold | What measurable level must be achieved? |

An invariant is a state-oriented safety property: it says that no reachable
state violates its predicate.[^lamport-high-level] Safety is broader because a
violation may concern an event or history rather than a single state. History
can sometimes be represented as auxiliary state, but the author should not
force every prohibition into an awkward state predicate.

Liveness is different. An invariant can forbid two processes from occupying a
critical section together, but it cannot by itself require either process ever
to enter. A system that does nothing can preserve its invariants while failing
its purpose. Specifications therefore need both preservation and progress when
the desired behavior includes both.[^lamport-safety-liveness]

## Common scopes

The same core idea appears at several levels:

- **Loop invariant:** holds at the designated point before and after every
  iteration and supports reasoning about the loop's result.
- **Object or representation invariant:** characterizes valid observable
  instances of a type or data structure.
- **Model invariant:** constrains every valid instance of a model; languages
  such as OCL distinguish these from operation preconditions and
  postconditions.[^ocl]
- **Data invariant:** constrains valid stored states, often through type,
  nullability, uniqueness, check, exclusion, or referential-integrity
  constraints.[^postgresql-constraints]
- **Domain invariant:** expresses a business truth that domain operations must
  preserve.
- **Aggregate or transactional invariant:** groups data and behavior that must
  be kept consistent synchronously. Domain-driven design uses such invariants
  to help discover aggregate, transaction, and distribution boundaries.[^evans-ddd-reference]
- **Architectural invariant:** protects a responsibility, authority boundary,
  dependency direction, deployment property, or other structural truth across
  normal implementation change.

These labels identify scope, not different meanings of *invariant*. In every
case the author still owes a predicate, a boundary, and a preservation claim.

## Invariants expose boundaries and authority

Where an invariant must hold strongly affects where authority belongs. If one
operation must preserve a relationship among several values synchronously,
some component or transaction needs authority over all of them. If separate
services own the values independently, a claimed cross-service invariant may
require coordination, a single enforcing authority, or a narrower observation
boundary.

Do not describe eventual convergence as an invariant over all intermediate
states. State the actual guarantee: for example, a local invariant at each
commit plus a progress property that reconciliation eventually restores a
cross-system relationship. This is less rhetorically forceful and more
architecturally informative.

## Enforcement and evidence

An invariant is a semantic claim; a guardrail, test, or proof is evidence about
or enforcement of that claim. The two should be connected without being
confused.

Prevention, proof, counterexample search, and detection are different
relationships to an invariant. Types, constructors, database constraints, and
encapsulated operations may reject invalid changes within their authority. A
sampled test can reveal counterexamples but does not prove a universal claim;
monitoring detects rather than prevents; and a proof establishes only the
modeled property under its assumptions.

Mechanically decidable architectural constraints belong in executable checks
when practical, but enforcement should remain proportionate. Automate when
violations are consequential, plausible, and objectively detectable. Leave
judgment to review when context is essential or the mechanism would be more
complex than the risk it controls. An admitted Requirement should own the
invariant's normative predicate, rationale, and subject; architecture should
explain its boundary and preservation response; executable mechanisms should
own their exact detection or enforcement logic rather than being copied into a
second drifting formula.

An invariant without automatic enforcement can still be valid. Its owner
should nevertheless know what evidence could reveal conformance or violation.
“We follow good architecture” is not an invariant because neither its predicate
nor its observation boundary makes failure decidable even in principle.

For a task-oriented comparison of enforcement and evidence mechanisms, see
[Expressing invariants](../guides/expressing-invariants.md#7-choose-evidence-or-enforcement).

[^dafny-loop-invariants]: Dafny checks that a loop invariant holds on entry and is preserved by
    an arbitrary execution of the loop body.
[^meyer-contract]: Meyer describes class invariants as constraints on observable object
    states and distinguishes those states from intermediate implementation
    states.
[^lamport-proving-safety]: Lamport presents initialization and transition-preservation
    obligations and explains why proofs may require stronger invariants.
[^lamport-high-level]: Lamport defines an invariance property as a state
    predicate that is true in every state of every possible behavior.
[^lamport-safety-liveness]: Lamport distinguishes safety, which rules out bad finite
    behaviors, from liveness, which requires eventual progress.
[^ocl]: OCL provides invariant constraints in a classifier context alongside
    operation preconditions and postconditions.
[^postgresql-constraints]: PostgreSQL documents declarative constraints and the limits of
    what particular constraint mechanisms continuously guarantee.
[^evans-ddd-reference]: Evans assigns aggregate-wide invariants to an aggregate root or
    designated mechanism and aligns aggregate boundaries with synchronous
    consistency, transactions, and distribution.
