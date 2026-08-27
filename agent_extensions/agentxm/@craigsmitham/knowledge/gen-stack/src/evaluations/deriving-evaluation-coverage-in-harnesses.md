---
type: Explanation
title: Deriving evaluation coverage in harnesses
description: How a harness can consume policy-neutral Gen Stack evaluation candidates, apply its own coverage decisions, and preserve Protocol and evidence boundaries without adopting a prescribed runner or policy format.
tags: [evaluations, protocols, coverage, candidates, harnesses, requirements, architecture, interoperability]
status: draft
sources:
  - resource: evaluation-protocols-as-assessment-contracts.md
    title: Evaluation Protocols as assessment contracts
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:58:31Z
---

# Deriving evaluation coverage in harnesses

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) owns canonical Evaluation meaning. The [Gen Stack
> application profile](/profile/gen-stack-application-profile.md) owns governed
> Protocol representation. This Explanation describes a portable consumption
> pattern; it prescribes no coverage policy, binding format, Suite layout,
> runner, adapter, or release rule.

A harness can determine Evaluation Protocol Coverage when it has two different
inputs: a deterministic account of what is eligible for consideration and a
separately authorized decision about what is in scope. Gen Stack supplies the
first. The adopting system supplies the second.

```text
Gen Stack corpus
      ↓
policy-neutral candidate projection
      ↓
adopting coverage or assurance decision
      ↓
applicable Evaluation Protocols
      ↓
repository-native realization and execution
      ↓
Results and role-separated Reports
```

## The recurring integration problem

Requirements and Architecture provide a rich, overlapping graph rather than a
flat test inventory. Requirements are assigned directly to Architecture
subjects; Surface and C4 hierarchies reveal different structure; controlled
relationships connect Features, Capabilities, Surfaces, and C4 elements; and
Protocols target exact authorities. A harness needs that meaning in a stable
computational form, but it should not have to recreate Gen Stack association,
eligibility, lifecycle, or C4 View rules.

At the same time, candidate eligibility does not answer whether coverage is
required. Consequence, confidence, independence, cost, and release policy are
local governance concerns. Embedding those choices in the Gen Stack CLI would
turn inspection into an undeclared assurance policy.

## Separate candidates from coverage

The `evaluation-candidates` inspection operation projects eligible
role-and-target pairs. It does not create governed concepts or mint candidate
identifiers. Within one snapshot, the Protocol role and canonical target
reference form the natural composite key.

The projection derives:

- `requirement-satisfaction` candidates from active Requirements directly
  assigned to subjects in the selected Architecture scope;
- `architecture-realization` candidates from eligible Architecture authorities
  in that scope, including authorities reached through explicit cross-view
  relationships; and
- `implementation-conformance` candidates only from Implementation Units
  already named by active Protocols when inspecting the complete corpus.

Retired Requirements and C4 Views appear as excluded context. Retired Protocols
remain visible as historical matches but do not become active matches.
Requirement inheritance is never inferred. Scoped inspection keeps hierarchy
ancestors as context rather than silently adding them to the candidate set.

Each candidate includes matching Protocols established by the Protocol's
explicit role-specific target field. A match establishes only that the
Protocol names the candidate target. It does not establish that a local policy
selects the candidate, that the Protocol is adequate, or that executable
evidence exists.

## Let the harness supply local decisions

A harness may consume the projection in any repository-native way:

1. bind the result to its corpus snapshot and profile version;
2. select candidates using an identified local assurance, risk, delivery, or
   evaluation policy;
3. match selected candidates to active Protocols;
4. relate each applicable Protocol and its selected Cases, property, sample,
   or procedure to local evaluation machinery;
5. execute or observe through its own adapters; and
6. retain Protocol, Implementation, environment, input, evaluator, and time or
   window provenance in each Execution and Result.

The selecting policy may be code, configuration, a service rule, a human
decision, or another native authority. The Protocol-to-execution relation may
use annotations, manifests, generated registries, conventions, direct APIs, or
human procedures. Gen Stack requires truthful identity and evidence boundaries,
not one transport or storage format.

## Portable harness invariants

Although the mechanism is local, a sound integration preserves these
invariants:

- bind through stable `protocol_id` and exact Protocol revision rather than a
  filename resemblance or Suite directory;
- treat role and target fields as explicit semantics rather than inferring
  them from the test framework;
- keep Cases scoped to their Protocol unless they have been promoted to
  independently governed Protocols;
- distinguish a selected target with no applicable Protocol from a Protocol
  that lacks a local executable realization;
- distinguish missing, stale, skipped, or evaluator-failed evidence from a
  failing judgment about the evaluated subject;
- keep Requirement satisfaction, Architecture realization, and Implementation
  conformance as separate report projections; and
- never treat a passing local check as automatic System Assurance or release
  authorization.

These invariants also apply when the Evaluation method is analysis, review,
sampling, simulation, measurement, or continuous observation rather than an
automated test.

## What candidate projection cannot establish

Candidate projection is deliberately coarse at an Architecture authority. One
Protocol targeting a Component can evaluate one bounded responsibility without
covering every responsibility stated by that Component. Counting target
matches therefore cannot establish semantic completeness.

Prefer bounded Architecture concepts and independently judged Protocol claims.
When an architectural statement genuinely imposes an independently traceable
obligation, express that obligation as a Requirement rather than inventing
hidden clause identities for the harness. Keep semantic adequacy and required
confidence with review and System Assurance.

Corpus-only inspection also cannot discover Implementation Units that no
Protocol or repository-native mapping names. Complete Implementation candidate
inventory remains a local concern.

## Reporting the handoffs

A harness can add native planning and realization states, but it should retain
the canonical distinctions:

| Question | Owner | Gen Stack interpretation |
| --- | --- | --- |
| Is this role-and-target pair eligible to consider? | CLI projection | Candidate only |
| Is it selected for the present purpose? | Adopting policy or authority | Not inferred by Gen Stack |
| Does an applicable active Protocol exist? | Coverage assessment | `defined` or `uncovered` |
| Can local machinery exercise it? | Harness | Repository-native state |
| Is bounded evidence usable? | Execution and Result processing | Evidence state |
| What judgment did it support? | Applied Protocol | `pass`, `fail`, or `unknown` |
| Is confidence sufficient to act? | Assurance or decision authority | Not established by the Report |

## When not to standardize further

Do not add a universal policy schema, Case manifest, binding contract, adapter
API, or Suite hierarchy merely because one harness needs it. Let integrations
use their native forms and observe their friction. Standardize another boundary
only after independent implementations repeatedly need the same semantics and
the invariant can be separated from incidental tooling.

## Related

- [Evaluation Protocols as assessment contracts](evaluation-protocols-as-assessment-contracts.md)
- [Designing Evaluation Protocols](designing-evaluation-protocols.md)
- [Pet Store evaluation protocol example](pet-store-evaluation-protocol-example.md)
- [Evaluation as bounded evidence](evaluation-as-bounded-evidence.md)
