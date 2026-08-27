---
type: Explanation
title: Pet Store evaluation protocol example
description: A synthetic worked outline showing how Architecture, Requirements, governed Evaluation Protocols, repository-native Suites, and separate reports relate.
tags: [evaluations, protocols, example, pet-store, surfaces, c4, requirements, reporting]
status: draft
sources:
  - resource: https://petstore.swagger.io/
    title: Swagger Petstore
  - resource: designing-evaluation-protocols.md
    title: Designing Evaluation Protocols
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T23:10:00Z
---

# Pet Store evaluation protocol example

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This synthetic Explanation illustrates those terms without describing the
> deployed service at the referenced site. The [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns governed
> representation.

This example uses a familiar Pet Store domain to show the evaluation model
across several Architecture and Requirement shapes. Names and obligations are
illustrative; they are not claims about the public Swagger Petstore service.

## Architecture and Requirement outline

```text
System: Pet Store
├── Capability: Manage pets
│   ├── Feature: Add a pet
│   │   ├── Surface: Pet HTTP API
│   │   │   ├── Surface: Create pet operation
│   │   │   │   ├── Requirement [functional]
│   │   │   │   ├── Requirement [quality]
│   │   │   │   └── Requirement [constraint]
│   │   │   └── Surface: Update pet operation
│   │   │       ├── Requirement [functional]
│   │   │       └── Requirement [human-factors]
│   │   └── C4 Component: Pet command handler
│   │       ├── Requirement [functional]
│   │       └── Requirement [process]
│   └── Feature: Find pets
│       ├── Surface: Search operations
│       │   ├── Requirement [functional]
│       │   ├── Requirement [usability]
│       │   └── Requirement [quality]
│       └── C4 Component: Pet query service
│           └── Requirement [quality]
├── Capability: Manage orders
│   ├── Feature: Place an order
│   │   └── Surface: Store HTTP API
│   │       └── Surface: Place order operation
│   │           ├── Requirement [functional]
│   │           └── Requirement [constraint]
│   └── Bounded Context: Ordering
│       └── Requirement [process]
├── Capability: Manage users
│   └── Surface: User HTTP API
│       ├── Surface: Create user operation
│       │   └── Requirement [functional]
│       └── Surface: Login operation
│           ├── Requirement [functional]
│           └── Requirement [security quality]
└── C4 Software System: Pet Store service
    ├── C4 Container: API application
    │   ├── C4 Component: Pet command handler
    │   ├── C4 Component: Pet query service
    │   ├── C4 Component: Order service
    │   └── C4 Component: User service
    └── C4 Container: Store database
        ├── Requirement [reliability quality]
        └── Requirement [constraint]
```

The outline deliberately overlaps Surface, Feature, Capability, Bounded
Context, and C4 views. Controlled relationships connect them; no single tree
replaces the canonical authorities.

## Governed Protocol projection

```text
gen-stack/evaluations/
├── index.md
└── protocols/
    ├── index.md
    ├── requirements/
    │   ├── create-pet-accepts-valid-input.md
    │   ├── create-pet-rejects-invalid-input.md
    │   ├── search-pets-meets-response-bound.md
    │   └── login-protects-credentials.md
    ├── architecture/
    │   ├── pet-api-preserves-operation-boundaries.md
    │   ├── ordering-owns-order-policy.md
    │   └── pet-command-handler-preserves-write-boundary.md
    └── implementation/
        ├── pet-mapper-round-trips-supported-fields.md
        └── order-repository-preserves-local-invariants.md
```

Each Requirement Protocol references its stable Requirement ID and derives the
Surface, Component, Container, or System subject. Each Architecture Protocol
references the accepted authority directly. Each Implementation Protocol names
repository-relative Units and states a local contract that can retire with
those Units.

For example:

```yaml
---
type: Evaluation Protocol
title: Create pet rejects invalid input
description: Assesses the accepted invalid-input obligation for the create-pet operation.
status: stable
protocol_id: PET-EVAL-REQ-002
protocol_lifecycle: active
evaluation_role: requirement-satisfaction
requirements:
  - PET-REQ-API-002
---
```

```yaml
---
type: Evaluation Protocol
title: Pet command handler preserves the write boundary
description: Assesses realization of the accepted command-component responsibility.
status: stable
protocol_id: PET-EVAL-ARCH-003
protocol_lifecycle: active
evaluation_role: architecture-realization
architecture_authorities:
  - /architecture/structure/containers/api/components/pet-command-handler.md
---
```

```yaml
---
type: Evaluation Protocol
title: Pet mapper round-trips supported fields
description: Assesses a local mapping invariant of the current implementation.
status: stable
protocol_id: PET-EVAL-IMPL-001
protocol_lifecycle: active
evaluation_role: implementation-conformance
implementation_units:
  - src/pets/pet-mapper.ts
---
```

Each body then uses `Claim`, `Assessment`, `Judgment`, and `Evidence and
lifecycle`. Cases such as valid species, missing name, duplicate identifier, or
unsupported status remain scoped to their Protocol unless they need an
independent claim and lifecycle.

## Policy-neutral candidate projection

A complete-corpus `evaluation-candidates` projection would present pairs such
as:

```text
requirement-satisfaction    × PET-REQ-API-002
architecture-realization   × /architecture/surfaces/pet-api/create-pet.md
architecture-realization   × /architecture/structure/containers/api/components/pet-command-handler.md
implementation-conformance × src/pets/pet-mapper.ts
```

For each pair, it can show matching active and retired Protocols. It can also
show that a retired Requirement or a C4 View was excluded. The final pair is
visible only because an active Protocol already names that repository-relative
Implementation Unit; Gen Stack cannot inventory otherwise-uncovered Units.

This projection is not yet a Pet Store coverage plan. A local assurance or
delivery policy might select the invalid-input Requirement and command-handler
boundary for a particular change while leaving a broader candidate outside
that decision. Only after selection can the harness classify an applicable
Protocol as `defined` or the selected target as `uncovered`. Protocol adequacy,
Suite bindings, execution, evidence, and outcomes remain later and separately
owned questions.

## Repository-native Suite projection

One implementation could mirror the roles while retaining tool-native files:

```text
tests/evaluations/
├── requirements/
│   ├── pet-api/
│   ├── store-api/
│   └── user-api/
├── architecture/
│   ├── surfaces/
│   ├── domains/
│   └── structure/
└── implementation/
    ├── pets/
    ├── orders/
    └── users/
```

That symmetry is useful but optional. The Protocol metadata, not the Suite
folder, establishes role and target. A fast unit-test Suite can execute Cases
from all three roles, and an operational Suite can execute one Protocol across
several environments.

## Reporting projection

```text
Pet Store evaluation report
├── Requirement satisfaction
│   └── Architecture subject → Requirement → Protocol → evidence state → outcome
├── Architecture realization
│   └── Architecture authority → Protocol → evidence state → outcome
└── Implementation conformance
    └── Implementation Unit → Protocol → evidence state → outcome
```

Each branch exposes `uncovered` versus `defined` Protocol Coverage separately
from evidence state and outcome. An absent Result for the login Protocol stays
`absent` and `unknown`; a broken test environment stays `harness-error`; a
passing mapper check does not roll up as satisfaction of a Pet API Requirement.

This gives architectural conformance the durable emphasis it needs while
letting implementation-local checks follow the same form and remain easy to
replace with the code they serve.

## Related

- [Evaluation Protocols as assessment contracts](evaluation-protocols-as-assessment-contracts.md)
- [Deriving evaluation coverage in harnesses](deriving-evaluation-coverage-in-harnesses.md)
- [Designing Evaluation Protocols](designing-evaluation-protocols.md)
- [Designing evaluations for Surfaces](designing-evaluations-for-surfaces.md)
- [Designing evaluations for C4 structure](designing-evaluations-for-c4-structure.md)
