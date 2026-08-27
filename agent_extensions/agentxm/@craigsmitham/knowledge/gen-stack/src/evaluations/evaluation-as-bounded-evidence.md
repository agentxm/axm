---
type: Explanation
title: Evaluation as bounded evidence
description: Why Evaluation is broader than testing but narrower than assurance, and how Protocols, Executions, Results, observations, and decisions retain distinct authority.
tags: [evaluations, evidence, testing, verification, validation, assurance, provenance, monitoring, requirements]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md#evaluations
    title: Gen Stack vocabulary — Evaluations
  - id: one-authority-many-witnesses
    resource: ../architecture/requirements/one-authority-many-witnesses.md
    title: One authority, many witnesses
  - id: fowler-evaluations
    resource: https://chadfowler.com/regenerative-software/3mb526js42k26/
    title: Chad Fowler — Evaluations Are the Real Codebase
  - id: iso-25040
    resource: https://www.iso.org/standard/83467.html
    title: ISO/IEC 25040:2024 — Quality evaluation framework
  - id: iso-29119-series
    resource: https://committee.iso.org/sites/jtc1sc7/%68ome/projects/flagship-standards/isoiecieee-29119-series.html
    title: ISO/IEC/IEEE 29119 series — Software testing
  - id: nasa-software-test-plan
    resource: https://swehb.nasa.gov/spaces/SWEHBVB/pages/32604427/STP%2B-%2BSoftware%2BTest%2BPlan
    title: NASA Software Engineering Handbook — Software Test Plan
  - id: w3c-prov
    resource: https://www.w3.org/TR/prov-primer/
    title: W3C PROV Primer
  - id: google-sre-monitoring
    resource: https://sre.google/sre-book/monitoring-distributed-systems/
    title: Google SRE — Monitoring Distributed Systems
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:30:00Z
---

# Evaluation as bounded evidence

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

What does an Evaluation own in Gen Stack, and why is it neither just a test nor
proof that a system is fit?

An **Evaluation** is a criterion-referenced assessment of an identified
realized subject under stated conditions. Its purpose is to produce evidence
for a bounded question. Testing is one important evaluation method, but
analysis, inspection, review, simulation, measurement, human study, and
continuous operational assessment can serve the same role when they apply
explicit criteria and preserve what was assessed.[^iso-25040][^iso-29119-series]

Evaluation is broader than testing because evidence can be obtained through
more than executable test cases. It is narrower than assurance because an
Evaluation does not decide whether the available body of evidence is sufficient
for release, acceptance, exception, rollback, or continued operation. It is
also narrower than observation: observations record what was perceived, while
an Evaluation applies a defined assessment to produce an interpretable result.

## One assessment, several identities

“The evaluation passed” compresses several independently changing identities.
Gen Stack keeps them separate:

| Identity | What it owns | What it does not own |
| --- | --- | --- |
| Requirement | The accepted obligation and its stable identity | The assessment method or current satisfaction state |
| Evaluation Protocol | One bounded claim and role, its criteria authority, method, cases or sampling, oracle or judgment procedure, thresholds, conditions, and evidence lifecycle | The accepted obligation or Architecture meaning, one execution, or its observations |
| Evaluation Case | One Protocol-scoped example, scenario, property, sample, or review instance | An independent claim, role, or criteria authority |
| Evaluation Execution | One bounded application of an exact Protocol revision to selected Cases or a sample, inputs or observations, environment, realized state, and evaluator | The reusable contract or a conclusion beyond that attempt or window |
| Evaluation Result | The observations, measurements, ratings, and assertion or judgment outcomes produced by the Execution | Release approval, general fitness, or a change to Intent |
| Observation | Contextual evidence about what is or happened | An evaluation conclusion unless an Evaluation Protocol was applied |
| Assurance or governance decision | Whether the available evidence is sufficient for the decision in scope | The underlying criteria, execution, or result |

This separation lets a method change without silently changing a Requirement,
lets the same Protocol run against several Implementation revisions, and
lets decision makers reconsider the same Result without rewriting what was
observed.

Suites and Reports organize these identities without replacing them. An
**Evaluation Suite** groups Protocols or Cases where they are practical to execute
and maintain. An **Evaluation Report** projects Results for a reader and
question. A Suite can span several architecture subjects, while several
Reports can project the same Results by subject, Requirement, role, release,
or environment. Neither becomes the authority for the criteria or evidence it
organizes.

## Separate the claim before choosing the method

Every Evaluation Protocol has one primary Evaluation Protocol Role:

| Role | Primary question | Required traceability |
| --- | --- | --- |
| `requirement-satisfaction` | Does the realized subject satisfy the accepted obligation under stated conditions? | One or more stable `requirement_id` values and their subjects |
| `architecture-realization` | Does the Implementation realize the accepted architecture responsibility, boundary, interface, relationship, or decision? | One or more stable Architecture subjects or ADRs |
| `implementation-conformance` | Does an Implementation Unit conform to a repository-local contract or invariant? | One or more mechanically resolvable Implementation Units and the local contract |

This separation prevents a structurally faithful implementation from being
reported as satisfying every Requirement, and prevents passing behavioral
checks from proving that accepted boundaries and responsibilities were
realized. A local conformance pass proves neither. Evidence may inform multiple
questions, but a Protocol and Report
must not blur their primary claim.

## Criteria do not create desired state

An Evaluation Protocol needs explicit criteria, but criteria can have
different authorities. They may come from a Requirement, interface contract,
accepted risk threshold, hypothesis, baseline, operational objective, or
external standard. The Evaluation must identify that authority rather than
acquire it.

When an Evaluation claims Requirement coverage, its Protocol references the
stable `requirement_id`. It may repeat the Requirement predicate in executable
or assessable form because the two representations answer different questions:

- the Requirement says what shall be true; and
- the Evaluation asks whether a realized subject satisfies it under stated
  conditions.

A locally chosen threshold, a historical baseline, or a passing test does not
become an accepted obligation merely because an evaluator uses it. If the
criterion is meant to bind the system, the appropriate authority must first
accept it as a Requirement, policy, contract, or other recognized source.

## Tests are methods, not the Evaluation taxonomy

Test levels such as unit, integration, system, and acceptance describe useful
implementation or delivery scopes. They do not exhaust the ways a system can
be evaluated, and they do not reveal which authority or blind spot a check
addresses.

| Method | Evidence it can contribute | Characteristic limitation |
| --- | --- | --- |
| Example or scenario test | Behavior for selected cases and paths | Unselected cases remain unknown |
| Property-based test | General properties over generated inputs | Generators and properties may omit important meaning |
| Contract or boundary test | Compatibility across a durable interface | Internal failures and end-to-end outcomes may remain hidden |
| Static analysis or formal argument | Structural properties without ordinary execution | The analyzed model and assumptions may diverge from operation |
| Simulation or fault injection | Responses to controlled conditions that are costly or unsafe to create directly | Fidelity and scenario selection bound the result |
| Performance, security, safety, or usability study | Quality under stated populations, loads, threats, tasks, or environments | Context and sampling constrain generalization |
| Human review or judgment | Meaning, ambiguity, appropriateness, and cases without a complete mechanical oracle | Reviewer competence, independence, and rubric quality matter |
| Operational monitoring | Behavior of the live system over time | It sees only exercised conditions and can detect harm after exposure |

The goal is not to collect every method. It is to select evidence whose
strengths and blind spots fit the consequence and uncertainty of the claim.
Several checks derived from the same mistaken interpretation are redundant in
volume, not independent in understanding.

## Boundary and lifetime shape durability

Fowler offers a useful, non-exclusive lens based on what survives change:
implementation-coupled tests support development of the current realization;
durable evaluations assess behavior at boundaries intended to survive
replacement; and live evaluations assess production reality over time.[^fowler-evaluations]

These are not maturity levels and Gen Stack does not require the labels. Each
protects something different:

- **Implementation-local evaluation** can give rapid, precise feedback about
  code structure or a local behavior. It may be intentionally disposable when
  that Implementation Unit is replaced.
- **Boundary evaluation** expresses properties, contracts, invariants, or
  externally visible outcomes against an interface or responsibility intended
  to outlive one realization.
- **Operational evaluation** applies criteria to observations from a running
  system over a declared window, detecting drift, environmental interaction,
  and conditions that fixtures did not anticipate.

A healthy portfolio may use all three without pretending they are
interchangeable. Regeneration confidence depends particularly on evaluations
whose subject and interface survive the Implementation being replaced, but
local tests still contribute economical feedback while that Implementation
exists.

## Monitoring becomes Evaluation only through a Protocol

Telemetry is not automatically an Evaluation Result. A contextual latency
series, error log, user report, or cost measure may be recorded as an
Observation. It participates in an Evaluation when a Protocol identifies the
subject, criteria, measurement or sampling method, relevant conditions,
judgment procedure, and observation window.

For example, response-time telemetry can supply contextual Observations.
Applying a defined percentile calculation to a named service revision during
an identified traffic window, comparing it with an authoritative threshold,
and recording the outcome is an Evaluation Execution and Result. The same
Observations may support several Evaluations or exploratory Orientation without
being copied into new authorities.

This boundary preserves the value of live evidence without turning every
dashboard into a test suite. It also makes alert quality and operational
context visible: monitoring signals can be incomplete, noisy, delayed, or
coupled to the same faulty assumptions as pre-deployment checks.[^google-sre-monitoring]

## Provenance bounds what a Result can say

A Result is interpretable only when a reader can recover the material identity
of the activity that produced it. The exact representation is repository
specific, but useful provenance commonly binds:[^w3c-prov]

- the exact Evaluation Protocol revision and selected Cases or sample;
- the Requirement or other criteria authority when coverage is claimed;
- the evaluated Implementation revision or other realized state;
- material inputs, fixtures, datasets, prompts, or observations;
- environment and configuration conditions;
- evaluator, harness, tool, model, or human role and relevant version;
- the attempt time or observation window; and
- the observations and resulting status.

This is not administrative decoration. A passing result against one revision,
environment, dataset, or evaluator cannot silently generalize to another.
Plans and traceability views may link these identities rather than copy their
volatile details into Requirements or architecture documents.[^nasa-software-test-plan]

## Pass, fail, and unknown are bounded outcomes

A pass means only that the identified Execution met its defined oracle or
judgment procedure. It does not establish that the Requirement is correct,
that the Evaluation Protocol is complete, that all relevant conditions were
sampled, or that a governance authority has approved the system.

A failure identifies a disagreement that must be classified. Possible causes
include non-satisfaction by the Implementation, a faulty or stale evaluator,
an ambiguous Requirement, an unsuitable environment, corrupted inputs, or a
shared mistaken interpretation. The Result alone does not select which
authority should change.

Missing or insufficient evidence remains `unknown`. An evaluator or harness
failure remains distinguishable from a system failure. Converting either to a
pass hides precisely the uncertainty Evaluation exists to expose.

## Verification and validation depend on the object

The words *verification* and *validation* are useful only when their object is
clear:

| Activity | Question |
| --- | --- |
| Requirement verification | Is the Requirement well formed according to its rules? |
| Requirement validation | Does it represent the accepted source need or intended outcome? |
| Realized-system verification | Does the implemented subject satisfy applicable Requirements? |
| Realized-system validation | Does the realized system meet stakeholder needs in its intended context? |

An Evaluation may contribute evidence to the latter two and may reveal a
problem in the former two. A surprising Result does not automatically edit the
Requirement; it returns through Orientation so the disagreement can be located
before an authorized Decision changes anything.

## Assurance composes evidence and judgment

Evaluation and assurance are adjacent but distinct. Evaluations produce
bounded evidence. System Assurance defines the confidence required for
architecture-significant change, the evidence authorities used to establish
it, any required review or approval, and reassessment triggers.

No number of passing Results creates an assurance decision by itself. The
decision may need evidence diversity, independence, recency, operational
history, human review, or an explicit exception process. Conversely, an
assurance policy that names no credible evidence route states an expectation
without showing how confidence can be established.

## Evaluation in the Gen Stack loop

Evaluation connects stable authority to learning without allowing evidence to
rewrite desired state:

```text
Requirement or other criterion authority
                 ↓ informs
       Evaluation Protocol
                 ↓ applied by
       Evaluation Execution ── assesses ──→ identified realized state
                 ↓ produces
         Evaluation Result
                 ↓ contributes evidence
      Observation or Signal → Orient → Decide → Act → new evidence
```

Governed Protocols expose the durable claims, methods, boundaries, lifetimes,
and evidence routes without requiring a separate portfolio authority.
`evaluations/index.md` and repository-native reports project their organization
and known gaps; neither owns the Protocol criteria, Execution Results, or
assurance decisions. The [Gen Stack application
profile](../profile/gen-stack-application-profile.md#evaluation-protocols)
defines their governed representation.

## Common misreadings

- **“Evaluation means automated test.”** Automation is one execution mode;
  criterion-bound human and analytical methods can also produce Evaluation
  Results.
- **“The suite is the Protocol.”** A suite is a repository grouping. It may
  realize several Protocols, and one Protocol may depend on several suites
  or methods.
- **“Monitoring is already live evaluation.”** Monitoring supplies
  observations; explicit criteria and a bounded application make it an
  Evaluation.
- **“Passing proves fitness.”** Passing establishes only the bounded claim
  supported by the Protocol, Execution conditions, and oracle.
- **“A failure tells us what to fix.”** It establishes a disagreement, not its
  owning defect or authorized correction.
- **“Traceability requires backlinks everywhere.”** Stable outward references
  and generated views can preserve navigation without copying volatile
  evidence inventories into Requirements.

## Related

- [Gen Stack vocabulary and relationship model](../glossary.md#evaluations)
- [Evaluation Protocols as assessment contracts](evaluation-protocols-as-assessment-contracts.md)
- [Designing Evaluation Protocols](designing-evaluation-protocols.md)
- [One authority, many witnesses](../architecture/requirements/one-authority-many-witnesses.md)
- [Requirements engineering in software architecture](../architecture/requirements/requirements-engineering.md)
- [Documenting system assurance](../governance/documenting-system-assurance.md)
- [OODA as the Gen Stack control loop](../control-loop/ooda-control-loop.md)

[^fowler-evaluations]: [Chad Fowler's “Evaluations Are the Real
    Codebase”](https://chadfowler.com/regenerative-software/3mb526js42k26/)
    distinguishes implementation-coupled, boundary-surviving, and live
    evaluations as evidence with different lifetimes and blind spots.
[^google-sre-monitoring]: [Google SRE's monitoring guidance](https://sre.google/sre-book/monitoring-distributed-systems/)
    distinguishes observations, externally visible behavior, symptoms,
    causes, and actionable alerting while emphasizing simple, interpretable
    monitoring rules.
[^iso-25040]: [ISO/IEC 25040:2024](https://www.iso.org/standard/83467.html)
    provides a quality-evaluation framework for target entities while leaving
    specific test methods to other authorities.
[^iso-29119-series]: The official [ISO/IEC/IEEE 29119 series
    overview](https://committee.iso.org/sites/jtc1sc7/%68ome/projects/flagship-standards/isoiecieee-29119-series.html)
    distinguishes testing concepts, processes, documentation, design
    techniques, and static review.
[^nasa-software-test-plan]: [NASA's Software Test Plan guidance](https://swehb.nasa.gov/spaces/SWEHBVB/pages/32604427/STP%2B-%2BSoftware%2BTest%2BPlan)
    treats scope, methods, environments, traceability, conditions, results,
    risks, and completion criteria as related but separately identifiable.
[^w3c-prov]: The [W3C PROV Primer](https://www.w3.org/TR/prov-primer/)
    distinguishes entities, activities, agents, plans, usage, generation,
    revision, and time when representing provenance.
