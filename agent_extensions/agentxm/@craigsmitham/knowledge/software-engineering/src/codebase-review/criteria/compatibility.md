---
type: Checklist
title: Compatibility quality criteria
description: Use when assessing whether the product can coexist and exchange meaning with required systems and environments without unacceptable interference.
tags: [codebase-review, software-quality, compatibility, interoperability, coexistence, reporting-review]
status: draft
sources:
- id: iso-25010
  resource: https://www.iso.org/standard/78176.html
  title: ISO/IEC 25010:2023 Systems and software Quality Requirements and Evaluation — Product quality model
- id: iso-25010-preview
  resource: https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf
  title: ISO/IEC 25010:2023 public preview
- id: liskov-wing
  resource: https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf
  title: A Behavioral Notion of Subtyping
- id: semver
  resource: https://semver.org/
  title: Semantic Versioning 2.0.0
- id: aip-180
  resource: https://google.aip.dev/180
  title: Google AIP-180 Backwards compatibility
- id: rfc-9110
  resource: https://www.rfc-editor.org/rfc/rfc9110.html
  title: RFC 9110 HTTP Semantics
- id: protobuf
  resource: https://protobuf.dev/best-practices/dos-donts/
  title: Protocol Buffers best practices
generated: { by: codex/gpt-5.6, at: 2026-09-01T17:48:27Z }
---

# Compatibility quality criteria

Use this list to judge present fit between the product and the systems,
versions, platforms, data, and resources with which it is required to coexist
or interact. Compatibility is a relationship-bound product outcome: a claim
without named counterparts and conditions is incomplete.[^iso-25010]

This is a candidate `reporting-review` checklist, not a mandate for a
particular protocol, versioning scheme, deployment topology, or integration
test plan. Apply the shared assessment states and evidence rules in
[Reviewing a codebase](../reviewing-a-codebase.md). The pillar definition and
neighbor boundaries are in [Software quality
pillars](../software-quality-pillars.md); the typed relationships below use
[Cross-cutting concerns for software quality](../cross-cutting-concerns.md).

## Default cross-cutting relationships

`XC-01` Claim context constrains every criterion through named counterparts,
versions, environments, deployment relationships, and obligations. `XC-08`
Evidence must qualify every judgment. Unless a criterion says otherwise, these
list-level defaults apply:

| Concern | Default relationship to Compatibility |
| --- | --- |
| `XC-02` Specification | `EN·EV` — supplies shared interface, representation, semantic, protocol, and version obligations. |
| `XC-03` Structure | `CTR·TR` — boundaries and dependencies can enable interoperation or create interference and lockstep. |
| `XC-04` Lifecycle integrity | `EN·EV·TH` — versions, configurations, migrations, and provenance condition compatibility evidence. |
| `XC-05` Risk | `TH·CS·TR` — counterpart variation and coordination tradeoffs condition the claim. |
| `XC-06` Assurance | `EN·EV` — conformance, contract, and representative integration evidence can support judgments. |
| `XC-07` Feedback | `(EV)` — observed integrations can reveal disagreement and unanticipated reliance. |

## Criteria

### COM-01 — Platform fit

**Outcome question:** Does the product operate as required in each
declared hardware, operating-system, runtime, browser, device, or deployment
environment?[^iso-25010-preview]

**Why it matters:** behavior that works only in an undeclared environment is
not compatible with the product's actual operating context.

**Applicability:** apply only to named present environments and their
relevant configurations. A platform label without material version,
capability, or constraint detail may leave the claim `Indeterminate`.

**Boundary:** this criterion owns current environmental fit. Evolvability
owns the capacity to adapt to a new environment; Correctness owns behavior
after the environment is accepted as part of the contract.

### COM-02 — Coexistence

**Outcome question:** Can the product share each required environment
and common resource without unacceptable interference with its co-residents?[^iso-25010-preview]

**Why it matters:** independently functioning products can become
incompatible when they contend for names, ports, files, devices, resources,
configuration, or global state.

**Applicability:** apply when products are installed, executed, embedded, or
administered in a shared environment. Name the protected co-resident
behavior and tolerance.

**Boundary:** this criterion owns cross-product interference. Efficiency owns
the product's own resource fitness; Reliability owns service continuity after
accidental resource failure.

### COM-03 — Interface agreement

**Outcome question:** Does each required counterpart find
the supported operations, events, parameters, and response forms promised at
their shared boundary?[^aip-180]

**Why it matters:** interaction fails when either side relies on a surface the
other does not provide, even if both implementations are internally correct.

**Applicability:** apply to public or otherwise independently consumed
boundaries. Internal calls governed by one inseparable implementation may be
better judged under Correctness.

**Boundary:** this criterion owns structural agreement at a shared boundary.
`COM-04` owns representation validity, `COM-05` meaning, and `COM-06`
interaction sequence.

### COM-04 — Representation agreement

**Outcome question:** Can each required counterpart
parse and produce the accepted syntax, encoding, schema, framing, and value
forms at the shared boundary?[^iso-25010-preview][^rfc-9110]

**Why it matters:** equivalent intent cannot interoperate when participants
disagree about how information is represented.

**Applicability:** apply to wire, file, message, database, binary, generated,
and source-level representations that cross an independently governed
boundary. RFC 9110 is an HTTP example, not a universal representation policy.

**Boundary:** this criterion owns shared representation. Correctness owns the
product's internal preservation of meaning; `COM-05` owns whether both sides
attach the same meaning to valid representations.

### COM-05 — Semantic agreement

**Outcome question:** Do all required participants interpret
exchanged operations, values, defaults, absence, units, identity, and errors
with the same accepted meaning?[^iso-25010-preview][^rfc-9110]

**Why it matters:** syntactically valid exchange can silently produce wrong
outcomes when participants disagree about meaning.

**Applicability:** apply where independently governed participants consume
shared information or effects. Identify the semantic authority or record
uncertainty.

**Boundary:** this criterion owns meaning across the relationship.
Correctness owns conformance within one product; Suitability owns whether the
exchanged information is sufficient for the intended goal.

### COM-06 — Protocol agreement

**Outcome question:** Do required participants preserve the
accepted sequencing, state, timing, repetition, cancellation, and completion
rules of their interaction?[^iso-25010-preview][^rfc-9110]

**Why it matters:** individually valid messages can fail to interoperate when
sent in an invalid order or interpreted under different lifecycle rules.

**Applicability:** apply when the boundary has stateful or temporal semantics.
A stateless value exchange may mark it `Not applicable`.

**Boundary:** this criterion owns agreement between participants about the
interaction lifecycle. Correctness owns one product's internal state
transition; Reliability owns recovery after interruption.

### COM-07 — Version interoperability

**Outcome question:** Can every required combination of
independently deployed or consumed versions interact within its declared
compatibility policy?[^semver][^aip-180]

**Why it matters:** coordinated latest-version success does not establish
compatibility where rollout, clients, or dependencies can legitimately
differ in version.

**Applicability:** apply to supported version combinations, upgrade windows,
and deprecation intervals. Do not infer universal backward compatibility
from the use of semantic-version labels.

**Boundary:** this criterion owns live cross-version interaction. `COM-08`
owns continuity of retained data; Evolvability owns the ability to create a
future compatibility change or migration.

### COM-08 — Data continuity

**Outcome question:** Can each required product version preserve
and interpret retained or exchanged data according to the declared evolution
contract?[^iso-25010-preview][^protobuf]

**Why it matters:** an upgrade can appear compatible at its interface while
making existing state unreadable, ambiguous, or unusable by a required peer.

**Applicability:** apply where data outlives a process, deployment, release,
producer, or consumer. Name the permitted read, write, downgrade, and
coexistence relationships.

**Boundary:** this criterion owns cross-version data meaning. Correctness
owns whether one version preserves its own invariants; Evolvability owns the
feasibility of performing the migration.

### COM-09 — Substitutability

**Outcome question:** Can a required substitute replace another
participant without violating the shared behavioral obligations relied upon
by its consumers?[^liskov-wing]

**Why it matters:** matching names or types does not establish compatibility
when preconditions, postconditions, invariants, errors, or history-sensitive
behavior differ.

**Applicability:** apply only where implementations, providers, adapters, or
versions are claimed to be interchangeable for identified consumers.

**Boundary:** this criterion owns present behavioral replacement in a shared
role. Evolvability owns the product's capacity to be changed so a new
replacement becomes possible.

### COM-10 — Capability agreement

**Outcome question:** Do required participants rely only on capabilities
supported within their declared relationship?[^iso-25010-preview][^rfc-9110]

**Why it matters:** matching interfaces can still fail when one participant
assumes an optional extension, feature, profile, or behavior the other does not
support.

**Applicability:** apply where capabilities vary by participant, version,
configuration, negotiation, or extension. A fixed relationship with no
optional capability may mark it `Not applicable`.

**Boundary:** this criterion owns the mutually supported subset actually
relied upon. `COM-03` owns whether the declared interface surface exists;
`COM-07` owns which version combinations must interoperate.

Completion means every applicable criterion has one assessment state and a
claim-bound record under [Reviewing a codebase](../reviewing-a-codebase.md).
Completion is not a claim that all possible counterpart or version
combinations have been exercised. These ten items are conditional review
lenses, not independent factors or additive scores.

[^iso-25010]: ISO, [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html).
[^iso-25010-preview]: ISO/IEC, [ISO/IEC 25010:2023 public preview](https://www.en-standard.eu/publicdoc/iec_previews/3440529.pdf).
[^liskov-wing]: Liskov and Wing, [A Behavioral Notion of Subtyping](https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf).
[^semver]: [Semantic Versioning 2.0.0](https://semver.org/).
[^aip-180]: Google, [AIP-180: Backwards compatibility](https://google.aip.dev/180).
[^rfc-9110]: IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html).
[^protobuf]: Protocol Buffers, [Best practices](https://protobuf.dev/best-practices/dos-donts/).
