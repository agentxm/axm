---
type: Explanation
title: Evaluation Protocols as assessment contracts
description: Why governed Evaluation Protocols derive their shape from Requirements and Architecture while execution and evidence remain repository-native.
tags: [evaluations, protocols, requirements, architecture, implementation, evidence, reporting]
status: draft
sources:
  - resource: evaluation-as-bounded-evidence.md
    title: Evaluation as bounded evidence
  - resource: ../glossary.md#evaluations
    title: Gen Stack vocabulary — Evaluations
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T01:11:07Z
---

# Evaluation Protocols as assessment contracts

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. The [Gen
> Stack application profile](/profile/gen-stack-application-profile.md) owns
> the governed representation. This document adds neither semantic authority
> nor profile-conformance rules.

An Evaluation Protocol turns one durable claim into a reusable assessment
contract. Its shape follows the authority being evaluated: Requirements supply
obligations, Architecture supplies accepted realization meaning, and
Implementation supplies local contracts and invariants. The Protocol adds the
method and judgment needed to assess that meaning without becoming a second
authority for it.

## Why the Protocol is governed

Executable tests are often reorganized, regenerated, replaced with a new tool,
or deleted with the Implementation they exercise. The durable question they
answer usually changes more slowly. Governing the Protocol preserves that
question, its criteria authority, and its evidence limits while allowing Suites,
harnesses, and test code to evolve in repository-native forms.

This makes Protocols part of the human-governed Gen Stack corpus while keeping
Executions, Results, and Reports close to the systems that create and retain
them. It also removes the need for a separate System Evaluation Approach:
coherent role-specific Protocols, their navigation, and derived reporting
already expose how the portfolio works.

## One form, three kinds of claim

Every Protocol answers the same four questions:

1. What bounded claim is being assessed?
2. How will evidence be obtained under material conditions?
3. How will observations become `pass`, `fail`, or `unknown`?
4. What identifies, refreshes, or retires the contract and its evidence?

Its role determines the authority and target:

| Role | Criteria authority | Target | What a pass can support |
| --- | --- | --- | --- |
| Requirement satisfaction | One or more active Requirements | The Requirements, with subjects derived from their canonical `subject` links | The realized subject satisfied those obligations under the Execution conditions |
| Architecture realization | Accepted Architecture meaning | Eligible Architecture realization authorities | The Implementation realized the named responsibilities, boundaries, interfaces, relationships, or decisions under the Execution conditions |
| Implementation conformance | Repository-local contract or invariant | Mechanically resolvable Implementation Units | The evaluated revision conformed to that local contract under the Execution conditions |

Role, type, and instance answer different questions. The Protocol role names
the kind of claim. The profile constrains which target concept types that role
may use. The target field then names the actual Requirement IDs, Architecture
concept paths, or Implementation Unit paths assessed by this Protocol. A Suite
directory or test class supplies none of those semantics by inference.

These roles can use the same tools. A unit-test framework might execute a
Requirement-satisfaction Protocol, an Architecture-realization Protocol, and an
Implementation-conformance Protocol. Tool sameness does not merge their
authority or reporting meaning.

## Requirements drive the primary evaluation shape

Requirement-satisfaction Protocols reference stable Requirement IDs. They do
not independently name an Architecture subject because each Requirement
already has exactly one canonical `subject`. Deriving the subject avoids drift
between the obligation and its evaluation.

Protocol organization can therefore follow the Architecture-and-Requirement
shape without forcing executable Suites to do so. A generated view can present:

```text
Architecture subject
└── Requirement
    └── Evaluation Protocol
        ├── Evaluation Case
        └── current Execution and Result
```

This is a navigation and traceability projection, not a claim that the
Architecture tree is the only useful Suite layout.

The read-only Gen Stack inspection surface can also derive policy-neutral
role-and-target candidates from this structure. Candidate eligibility and an
explicit Protocol target help a harness orient its own coverage work; neither
selects required coverage or establishes Protocol adequacy. See [Deriving
evaluation coverage in harnesses](deriving-evaluation-coverage-in-harnesses.md)
for that integration boundary.

## Architecture realization is an independent claim

Not every accepted architectural property is restated as a Requirement.
Architecture-realization Protocols assess whether the current Implementation
preserves accepted responsibilities, boundaries, interfaces, relationships,
and decisions. Their targets can be Systems, ADRs, Capabilities, Features,
Surfaces, Bounded Contexts, Context Maps, or C4 elements. A C4 View is excluded
because it projects canonical elements instead of owning the structure it
shows.

Architecture evidence must remain separate from Requirement-satisfaction
evidence. A passing endpoint scenario may satisfy a behavioral Requirement
while the implementation violates an accepted component boundary. Conversely,
a dependency rule can confirm the boundary without proving the actor-visible
outcome.

## Implementation conformance uses the same form at a shorter lifetime

Implementation-conformance Protocols apply the same claim, assessment,
judgment, and evidence structure to local contracts such as module invariants,
parser behavior, schema mappings, or algorithm properties. Their targets are
Implementation Units rather than Architecture subjects.

The expected lifetime is often shorter. A local Protocol may retire when the
Unit is regenerated or deleted, while Requirement and Architecture Protocols
survive replacement of the realization. Tiny disposable checks may remain
entirely repository-native when governing them would add no useful continuity.
Promote them when the claim needs stable identity, independent maintenance, or
cross-tool reporting.

## Cases refine a Protocol without multiplying authorities

Cases provide examples, scenarios, properties, samples, or review instances.
They inherit the Protocol's role and criteria authority, so adding a Case does
not create a new coverage claim. A Case should become its own Protocol when it
needs a different claim, lifecycle, outcome, target, or report identity.

This distinction keeps a Protocol coherent without forcing every test vector
to become a governed document.

## Reporting is a three-axis projection

For each role, reporting keeps three questions separate:

| Axis | Values | Question |
| --- | --- | --- |
| Protocol Coverage | `uncovered`, `defined` | Is there an applicable active Protocol for the in-scope authority or Unit? |
| Evidence state | `absent`, `stale`, `current`, `skipped`, `harness-error` | Is usable evidence available for the relevant revision and conditions? |
| Bounded outcome | `pass`, `fail`, `unknown` | What judgment did the bounded Execution support? |

A defined Protocol with absent evidence is not a pass. A harness error is not a
failure of the evaluated subject. A current passing Implementation-conformance
Result is not evidence of Requirement satisfaction unless a distinct Protocol
and Execution establish that claim.

## Protocols do not own assurance

System Assurance decides what confidence is warranted for a purpose and
consequence. Protocols and Results can support that decision, but neither
defines the required confidence nor grants approval. Independence, diversity,
coverage expectations, exceptions, and release policy remain with their proper
governance authorities.

## Related

- [Evaluation as bounded evidence](evaluation-as-bounded-evidence.md)
- [Designing Evaluation Protocols](designing-evaluation-protocols.md)
- [Deriving evaluation coverage in harnesses](deriving-evaluation-coverage-in-harnesses.md)
- [Pet Store evaluation protocol example](pet-store-evaluation-protocol-example.md)
