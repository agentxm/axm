---
type: Explanation
title: Easy Approach to Requirements Syntax (EARS)
description: How EARS structures textual requirements through ordered optional-feature, state, trigger, subject, imperative, and response clauses.
tags: [requirements-engineering, ears, structured-natural-language, syntax, requirements]
status: draft
sources:
  - id: ears-official
    resource: https://alistairmavin.com/ears/
    title: Alistair Mavin — EARS
  - id: ears-2009
    resource: https://doi.org/10.1109/RE.2009.9
    title: Mavin et al. — Easy Approach to Requirements Syntax (EARS)
  - id: ears-definitive-guide
    resource: https://f.hubspotusercontent20.net/hubfs/2367473/LeadGen%20Content/EARS%20-%20The%20Easy%20Approach%20to%20Requirements%20Syntax%20Guide.pdf
    title: "QRA Corp — The Easy Approach to Requirements Syntax: The Definitive Guide"
  - id: gen-stack-profile
    resource: /profile/gen-stack-application-profile.md#requirements
    title: Gen Stack application profile — Requirements
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Easy Approach to Requirements Syntax (EARS)

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

The Easy Approach to Requirements Syntax (EARS) gently constrains natural
language by arranging a small set of clauses in a consistent temporal order.
The result remains readable prose, but its optional feature, operating state,
trigger, obligated subject, and required response are easier to
distinguish.[^ears-official]

EARS is one optional method in Gen Stack's open specification portfolio. Use
[Selecting a requirement specification
method](selecting-a-requirement-specification-method.md) before choosing it;
an unlisted method is equally admissible when it better serves the quality
criteria and preserves authority.

EARS governs the shape of one textual requirement. It does not establish that
the obligation is necessary, accepted, feasible, correct, or complete in a
set. Those questions remain with [requirements
engineering](requirements-engineering.md) and [Documenting
requirements](documenting-requirements.md). The current Gen Stack profile does
not require every statement to use EARS; use it where its clauses preserve the
accepted meaning rather than forcing an obligation into an inaccurate form.

## One sentence, ordered clauses

The complete desired-behaviour form is:

> Where `<optional feature>`, while `<precondition(s)>`, when `<trigger>`, the
> `<system name>` shall `<system response(s)>`.

For an unwanted event or condition, `if` and `then` replace `when`:

> Where `<optional feature>`, while `<precondition(s)>`, if `<unwanted
> trigger>`, then the `<system name>` shall `<system response(s)>`.

Most requirements omit one or more leading clauses. The remaining clauses
retain the same order:

```text
optional feature → continuing state → discrete trigger → obligated subject → required response
Where               While              When / If…then     system name          shall…
```

This order communicates how the statement becomes applicable before saying
what the subject must do. A `Where` clause selects a configured variant, a
`While` clause establishes a state that continues to hold, and `When` or
`If…then` identifies a discrete trigger. The named subject and response follow
those conditions.

## The five simple patterns

EARS derives five simple patterns from the clauses that are
present.[^ears-2009] The examples below are synthetic.

| Pattern | Form | Meaning | Example |
| --- | --- | --- | --- |
| Ubiquitous | The `<system name>` shall `<response>`. | The obligation is active without a feature, state, or trigger qualifier. | The package registry shall retain each published package version for its declared support period. |
| State-driven | While `<state>`, the `<system name>` shall `<response>`. | The response applies for as long as the stated condition remains true. | While a workspace lock is held, the package manager shall defer concurrent synchronization. |
| Event-driven | When `<trigger>`, the `<system name>` shall `<response>`. | A desired event at the subject boundary triggers the response. | When an installation plan is accepted, the package manager shall begin applying the plan. |
| Optional feature | Where `<feature is included>`, the `<system name>` shall `<response>`. | The obligation applies only to a system or product variant that includes the named feature. | Where offline installation is included, the package manager shall complete installation without a network connection. |
| Unwanted behaviour | If `<unwanted trigger>`, then the `<system name>` shall `<response>`. | An undesired event or condition triggers a required mitigation or recovery response. | If a package checksum does not match, then the package manager shall reject the package. |

The keyword is semantic, not merely stylistic. `While` describes continuing
applicability; `When` describes occurrence. `Where` concerns the presence of
an optional feature, not a temporary system state. `If…then` distinguishes an
unwanted trigger from a desired event.

## Complex requirements compose the same clauses

A complex EARS requirement uses more than one keyword while preserving the
same order. It is not a sixth kind of obligation. For example:

> Where staged deployment is included, while a release is in canary state,
> when an operator approves expansion, the deployment controller shall begin
> the next rollout stage.

An unwanted-behaviour variant changes only the trigger form:

> Where rollback is included, while a deployment is active, if a health signal
> becomes unavailable, then the deployment controller shall pause further
> rollout.

The feature and state already apply when the trigger occurs. Reversing the
clauses—such as placing `When` before `While`—obscures that temporal
relationship and is not the EARS form.

## Cardinality bounds the sentence

The shared EARS elements have explicit cardinality.[^ears-definitive-guide]

| Element | EARS cardinality | Consequence |
| --- | --- | --- |
| Optional feature | Optional; more than one is possible in principle | Each feature clause precedes state and trigger clauses. |
| Preconditions | Zero or more | Every stated precondition must hold before a trigger can activate the response. Without a trigger, the response applies while all preconditions hold. |
| Trigger | Zero or one | A requirement cannot contain several independent triggering events. |
| System name | Exactly one | One explicitly named subject is responsible for the response. |
| System responses | One or more | Every response follows the same feature, preconditions, and trigger. |

Cardinality describes what EARS can express in one sentence; it does not
override other requirement-quality rules. A long chain of preconditions can
still be hard to understand, and responses that can be accepted, changed,
satisfied, or evaluated independently are separate Gen Stack Requirements.

## Mapping EARS into the Gen Stack

EARS and the Gen Stack answer different questions. EARS provides a sentence
form; the Gen Stack establishes the Requirement's authority, subject,
classification, and place in the corpus.

| EARS element | Gen Stack interpretation |
| --- | --- |
| `<system name>` | The explicitly named eligible Architecture concept referenced by the Requirement's `subject` field. It need not be the whole System. |
| `shall` | EARS's binding imperative within an EARS expression; the profile does not require this method or keyword. |
| `<system response>` | The bounded outcome the subject is obligated to provide, preserve, prevent, or constrain. |
| EARS pattern | The clause structure of the statement. It does not determine `requirement_type`. |
| One or more responses | Syntactically valid EARS, subject to the Gen Stack rule that independently changeable or satisfiable obligations are split. |

An event-driven sentence can therefore express a functional, quality,
process, human-factors, usability, or constraint Requirement. Classification
follows the accepted obligation, not whether the sentence begins with
`Where`, `While`, `When`, or `If`.

For the authoring procedure and more contrasting examples, use [Writing
requirements with EARS](writing-requirements-with-ears.md).

## Related

- [Writing requirements with EARS](writing-requirements-with-ears.md)
- [Documenting requirements](documenting-requirements.md)
- [Requirements engineering in software architecture](requirements-engineering.md)
- [Classifying requirements in software architecture](requirement-classification.md)

[^ears-official]: Alistair Mavin's EARS overview defines the ordered clauses,
    keywords, five patterns, and complex composition summarized here.
[^ears-2009]: The original 2009 EARS paper introduced the constrained
    natural-language rules and five-pattern model.
[^ears-definitive-guide]: The supplied definitive guide states the shared
    precondition, trigger, system-name, and response cardinalities and
    discusses optional-feature composition.
