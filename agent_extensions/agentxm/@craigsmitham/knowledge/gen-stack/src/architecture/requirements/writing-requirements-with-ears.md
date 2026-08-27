---
type: Guide
title: Writing requirements with EARS
description: Use when an accepted subject-centered obligation needs an EARS statement; select, order, compose, and review its clauses without changing the obligation's authority.
tags: [requirements-engineering, ears, structured-natural-language, syntax, authoring]
status: draft
sources:
  - id: ears-syntax
    resource: easy-approach-to-requirements-syntax.md
    title: Easy Approach to Requirements Syntax (EARS)
  - id: ears-official
    resource: https://alistairmavin.com/ears/
    title: Alistair Mavin — EARS
  - id: ears-2009
    resource: https://doi.org/10.1109/RE.2009.9
    title: Mavin et al. — Easy Approach to Requirements Syntax (EARS)
  - id: ears-templates-part-1
    resource: https://2367473.fs1.hubspotusercontent-na1.net/hubfs/2367473/EARS%20Configuration%20PDF.pdf
    title: QRA Corp — EARS Templates Series, part 1
  - id: ears-definitive-guide
    resource: https://f.hubspotusercontent20.net/hubfs/2367473/LeadGen%20Content/EARS%20-%20The%20Easy%20Approach%20to%20Requirements%20Syntax%20Guide.pdf
    title: "QRA Corp — The Easy Approach to Requirements Syntax: The Definitive Guide"
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Writing requirements with EARS

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use EARS only when its structured natural-language clauses fit the dominant
semantic difficulty. Gen Stack does not prefer it universally or restrict
Requirements to documented methods; start with [Selecting a requirement
specification method](selecting-a-requirement-specification-method.md).

Use this guide to express one already accepted, subject-centered obligation in
EARS. The result is one correctly ordered statement for the Requirement's
`## Requirement` section. All examples are synthetic.

This procedure begins after the source, acceptance, subject, level, and
`requirement_type` have been established. Use [Documenting
requirements](documenting-requirements.md) for that wider workflow and [Easy
Approach to Requirements Syntax
(EARS)](easy-approach-to-requirements-syntax.md) for the syntax model.

## Representation

Use EARS as the syntax of the canonical expression inside the native
Requirement `## Requirement` section; do not add EARS-specific frontmatter or
a parallel statement. Order clauses by temporal meaning—optional feature,
continuing state, trigger or unwanted condition, obligated subject, response—
and omit clauses that do not apply. Keep rationale, identifiers, lifecycle,
subject, sources, and evaluation links in their profile or artifact-owned
locations.

## 1. State the subject and one response

Begin with the smallest EARS form:

> The `<subject>` shall `<required response>`.

Name the eligible Architecture subject exactly enough that the sentence
remains clear outside its file. Make the response observable or assessable and
include only bounds that are part of the obligation.

If the draft contains several responses, ask whether each can be accepted,
changed, satisfied, or evaluated independently. Split those responses into
separate Requirements even though EARS syntax permits more than one response.

Synthetic starting point:

> The package registry shall retain each published package version for its
> declared support period.

Keep this ubiquitous form when no optional feature, continuing state, or
trigger limits the obligation.

## 2. Identify each condition by meaning

Classify conditions before selecting keywords:

| Question | Clause |
| --- | --- |
| Does the obligation apply only when an optional feature is included in the system variant? | `Where <optional feature>` |
| Must a condition remain true while the response applies? | `While <state or precondition>` |
| Does a desired discrete event activate the response? | `When <trigger>` |
| Does an unwanted event or condition require mitigation, rejection, preservation, or recovery? | `If <unwanted trigger>, then` |

Do not choose a keyword merely because the source sentence already contains
the same English word. Identify whether the condition is a feature, a
continuing state, a desired occurrence, or an unwanted occurrence.

## 3. Choose the simplest complete pattern

Add only the clauses needed to communicate applicability:

| Conditions present | Pattern |
| --- | --- |
| None | The `<subject>` shall `<response>`. |
| Continuing state only | While `<state>`, the `<subject>` shall `<response>`. |
| Desired trigger only | When `<trigger>`, the `<subject>` shall `<response>`. |
| Optional feature only | Where `<feature is included>`, the `<subject>` shall `<response>`. |
| Unwanted trigger only | If `<unwanted trigger>`, then the `<subject>` shall `<response>`. |
| More than one condition kind | Compose a complex requirement in the fixed order from the next step. |

A missing condition makes the statement broader than intended. An unnecessary
condition hides the core obligation and can create a different requirement.

## 4. Compose complex clauses in temporal order

Arrange every present clause as:

```text
Where → While → When / If…then → subject → shall → response
```

Desired event:

> Where staged deployment is included, while a release is in canary state,
> when an operator approves expansion, the deployment controller shall begin
> the next rollout stage.

Unwanted event:

> Where rollback is included, while a deployment is active, if a health signal
> becomes unavailable, then the deployment controller shall pause further
> rollout.

Each `Where` and `While` condition is already applicable when the trigger
occurs. Use at most one `When` or `If…then` trigger in one Requirement.

When several preconditions are material, keep them before the single trigger:

> While the target environment is in maintenance mode, while deployment
> approval remains valid, when an operator begins rollout, the deployment
> controller shall deploy the approved release.

Do not turn independent events into additional preconditions merely to fit one
sentence. Split independently triggered obligations.

## 5. Distinguish similar-looking clauses

### State versus event

Use `While` for a condition that continues and `When` for a discrete change or
occurrence.

State-driven:

> While the network connection is unavailable, the synchronization command
> shall display the queued-operation count.

Event-driven:

> When the network connection becomes unavailable, the synchronization
> command shall record the interrupted operation.

The first response applies throughout a state. The second happens when the
boundary into that state is crossed.

### Optional feature versus operating state

Use `Where` for product or system variation and `While` for current operation.

Optional feature:

> Where audit export is included, the administration console shall expose an
> audit-export control.

Operating state:

> While an audit export is running, the administration console shall display
> its completion percentage.

Installation or configuration of a feature is durable variation; an export in
progress is a temporary state.

### Desired versus unwanted trigger

Use `When` for an expected event and `If…then` to cue an unwanted condition
and its required response.

Desired event:

> When an operator selects publish, the release command shall display the
> planned package version.

Unwanted event:

> If the registry rejects a package checksum, then the release command shall
> leave the local release state unchanged.

Both are triggers. The EARS keyword distinguishes normal progression from
mitigation of an undesired occurrence.

## 6. Repair common syntax errors

| Draft problem | Repair |
| --- | --- |
| `Where the service is in maintenance mode…` | Use `While`; maintenance mode is a state, not an optional feature. |
| `If an operator selects export, then…` | Use `When` when selection is an expected event rather than unwanted behaviour. |
| `When a release is in canary state…` | Use `While` when the response applies throughout the state; use `When` only for entry into the state or another discrete event. |
| `When approval arrives, while the release is staged…` | Reorder as `While the release is staged, when approval arrives…`. |
| `When it is approved, it shall continue…` | Name the trigger and obligated subject explicitly. |
| Two independent events joined with `or` | Create separate Requirements unless they are one defined trigger. EARS permits at most one trigger per statement. |

Repair syntax only after confirming the repair preserves the accepted meaning.
Changing `Where` to `While`, or `While` to `When`, changes applicability rather
than merely improving style.

## 7. Split independent responses

This EARS statement is syntactically possible but contains two independently
changeable outcomes:

> If package verification fails, then the installer shall preserve the
> workspace and report the failed package.

Split it while preserving the shared trigger:

> If package verification fails, then the installer shall leave the workspace
> unchanged.

> If package verification fails, then the installer shall identify the failed
> package in the result.

The two Requirements may share a source and rationale, but each now has one
response whose satisfaction and evolution can be considered independently.

## 8. Check the final statement

Before placing the statement under `## Requirement`, confirm that:

- `Where`, if present, describes optional feature inclusion;
- every `While` clause describes a continuing state or precondition;
- at most one trigger is present;
- `When` identifies a desired trigger, or `If…then` identifies an unwanted
  trigger;
- clauses follow `Where → While → trigger → subject → shall → response`;
- the explicitly named subject agrees with the Requirement's `subject` link;
- `shall` is the binding imperative;
- independently changeable responses have been split; and
- definitions, rationale, examples, and evaluation procedures remain outside
  the binding statement.

EARS conformance proves only that the sentence follows the syntax. Complete
the requirement verification and validation steps in [Documenting
requirements](documenting-requirements.md) before admitting it to the corpus.

## Related

- [Easy Approach to Requirements Syntax (EARS)](easy-approach-to-requirements-syntax.md)
- [Documenting requirements](documenting-requirements.md)
- [Classifying requirements in software architecture](requirement-classification.md)
- [Reviewing a requirement set](reviewing-requirement-sets.md)
