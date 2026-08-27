---
type: Guide
title: Specifying external-conformance requirements
description: Use when an accepted obligation requires a subject or artifact to conform to an external standard, specification, schema, or profile; identify the exact normative target and preserve separate local acceptance, external meaning, and bounded evidence.
tags: [requirements-engineering, conformance, compliance, normative-reference, standards, profiles, schemas, versioning]
status: draft
sources:
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: selecting-method
    resource: selecting-a-requirement-specification-method.md
    title: Selecting a requirement specification method
  - id: constraint-requirements
    resource: documenting-architecture-constraints.md
    title: Documenting constraint requirements
  - id: one-authority-many-witnesses
    resource: one-authority-many-witnesses.md
    title: One authority, many witnesses
  - id: w3c-spec-guidelines
    resource: https://www.w3.org/TR/qaframe-spec/
    title: W3C QA Framework — Specification Guidelines
  - id: w3c-test-methodology
    resource: https://www.w3.org/TR/test-methodology/
    title: W3C — A Method for Writing Testable Conformance Requirements
  - id: iso-directives
    resource: https://www.iso.org/directives-and-policies.html
    title: ISO/IEC Directives and policies
  - id: okf-v0.2
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.2
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:30:00Z
---

# Specifying external-conformance requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when a local subject is obligated to conform to a standard,
specification, schema, protocol, application profile, contract, policy, or
other maintained normative authority. The local Requirement owns the decision
that conformance is required; the external authority continues to own the
referenced definitions and conformance semantics.

Do not copy an external specification into local Requirements. Identify the
exact normative target, preserve its authority and lifecycle, and connect
separately owned assessment evidence.

## Representation

Use the native Requirement fields and profile relationship role
`incorporates-normative-reference`; do not invent parallel target, standard, or
version metadata unless an established repository extension owns it. In the
canonical expression, present obligated subject, exact external identity and
version, incorporated provisions or conformance class, local applicability,
deviations, lifecycle policy, and required outcome. Keep the external
specification authoritative for its definitions and link rather than copy it.

## 1. Establish what is obligated

Identify:

- the eligible local Architecture subject;
- the conforming product or target, such as a bundle, document, interface,
  service, implementation, process, or exchanged artifact;
- the reason and authority for adopting the external specification;
- the consequence of nonconformance; and
- the authority that can accept, replace, tailor, waive, or retire the local
  obligation.

The external specification does not accept itself for the local system. A
policy, contract, decision, Need, or higher-level Requirement supplies that
local authority.

## 2. Identify the normative target exactly

Record enough information that two reviewers select the same applicable
provisions:

| Dimension | Required question |
| --- | --- |
| Publisher and identity | Which authority and canonical specification are meant? |
| Edition | Which version, date, revision, or immutable identifier applies? |
| Conforming product | What kind of artifact or system element may claim conformance? |
| Conformance subdivision | Which profile, level, module, class, feature set, or clause group applies? |
| Scope | Which artifacts, operations, environments, jurisdictions, or lifecycle stages are covered? |
| Optionality | Which specification options have been selected? |
| Extensions | Which extensions are permitted and under what rules? |
| Exclusions | Which provisions are not applicable, and who established that disposition? |
| Deviations | Which waivers or deviations exist, and does the external authority still permit a conformance claim? |

W3C conformance guidance likewise distinguishes conforming product classes,
profiles, modules, levels, discretionary items, and extensions because each
changes what a conformance claim means.[^w3c-spec-guidelines]

### Pin or govern the edition

A dated reference fixes the incorporated meaning to the identified edition. An
undated reference generally follows the latest edition under ISO drafting
conventions.[^iso-directives] Prefer a stable edition when local change control
must decide whether revised external provisions remain correct and feasible.

Use an update-following reference only when the external authority is
intentionally allowed to change the applicable meaning and the local lifecycle
defines monitoring, impact analysis, acceptance, and transition. “Latest” is
not a substitute for that governance.

## 3. Classify the local obligation

External conformance does not determine `requirement_type`:

| Local obligation | Likely primary type |
| --- | --- |
| An artifact or realization must stay within a mandated standard, schema, protocol, or profile | `constraint` |
| A processor must accept or produce every artifact conforming to an identified specification | `functional` |
| Independent implementations must achieve an assessable interoperability outcome | `quality` |
| A release or lifecycle process must obtain an identified conformance assessment or certification | `process` |

Create separate Requirements when these outcomes can be accepted, changed, or
evaluated independently. Do not multiply one vague “standards compliant” claim
into several Requirements without distinct accepted obligations.

## 4. Express the conformance obligation

Use a bounded normative-reference form such as:

> Within **[conforming target and scope]**, **[subject]** shall conform to
> **[publisher, specification, stable identity, and edition]**, under
> **[profile, level, module, or conformance class]**, for **[the whole
> specification or exact applicable provisions]**, using only **[selected
> options and permitted extensions]**.

This is an illustrative form, not required syntax. Another method is suitable
when it expresses the same dimensions more clearly.

State a whole conformance class as one Requirement when the class is adopted,
changed, and assessed as one obligation. When selected provisions have
independent local acceptance, allocation, or lifecycle, express those local
obligations separately. Do not claim whole-specification conformance for a
subset unless the external specification explicitly defines that claim.

Do not say only “conform to the standard,” “be standards compliant,” or “use
OKF.” Those formulations leave the conforming product, edition, class, scope,
and permitted variability unresolved.

## 5. Preserve the authority chain

| Authority | What it owns |
| --- | --- |
| Local Requirement | The accepted local obligation, subject, scope, and stable identity |
| External normative reference | Its definitions, provisions, and conformance semantics |
| Local application profile, when applicable | Additional permitted restrictions and conformance rules |
| Applicability or disposition mapping | The interpretation of which external provisions apply locally; not a copied normative specification |
| Evaluation Protocol | Validator, inspection, test, sampling, oracle, criteria, and conditions |
| Evaluation Result | The observations and outcomes for one identified target revision and attempt |

Name the external authority in the Requirement's normative expression and link
it where accessible. Use `requirement_sources` when the external authority also
explains why the obligation exists. A source link alone does not incorporate
the source's provisions; the Requirement must make that normative role clear.

An explanatory summary may improve accessibility, but label it informative and
do not let it silently replace the incorporated text. Respect licensing,
access, and confidentiality constraints instead of reproducing restricted
material.

## 6. Map provisions without cloning them

When assessment or assurance needs clause-level resolution, maintain or
generate an applicability and evidence view outside the Requirement:

```text
external provision
    → applicable / not applicable / tailored / unresolved
    → local subject or Requirement
    → Evaluation Protocol
    → bounded Result
```

The view should identify the external edition and local baseline. It may quote
only what licensing and source-use rules permit. It does not become another
normative copy of the standard.

Create a separate local Requirement for an external provision only when the
local obligation has independent acceptance, allocation, derivation, change,
or evaluation value. Do not mechanically mirror every external `MUST`.

## 7. Keep conformance and evidence separate

A validator or test suite may cover only structural or selected normative
rules. Passing it proves no more than its identified criteria, inputs,
environment, and coverage establish. W3C's test methodology similarly
distinguishes specification requirements from test assertions and test
cases.[^w3c-test-methodology]

Evidence claiming conformance should identify:

- the Requirement ID;
- external specification and edition;
- profile, class, level, module, or provision scope;
- assessed artifact or Implementation revision;
- validator or review definition and version;
- environment, options, and extensions;
- unsupported or manually reviewed provisions;
- result, including `unknown` and harness error; and
- observation time or validity window.

For a layered target such as an OKF bundle plus an application profile, report
base-format conformance, profile conformance, and any completeness, coverage,
or fitness conclusion separately. One does not imply the others.

## 8. Review the individual Requirement

Apply every characteristic from [Documenting
requirements](documenting-requirements.md), then ask:

- Can reviewers resolve one exact external authority and edition?
- Is the conforming product distinct from the Architecture subject?
- Are conformance classes, profiles, options, extensions, and exclusions
  complete enough to interpret the obligation?
- Does the referenced authority actually define the claimed conformance?
- Are deviations represented honestly rather than hidden behind the word
  *conform*?
- Is edition change governed rather than accidental?
- Can credible evidence distinguish conformance, nonconformance, and unknown?
- Would copying or summarizing the source create drift, licensing risk, or a
  competing authority?

## Synthetic examples

Ambiguous:

> The knowledge bundle shall be OKF compliant.

Bounded:

> For every maintained concept and reserved document in the published bundle,
> the knowledge bundle shall conform to Open Knowledge Format v0.2.

The actual Requirement must identify its eligible Architecture subject and
adoption authority. A separate Requirement may be warranted when profile
adoption can change independently; whether one or several Requirements own the
local adoption, report base-format and profile conformance separately.

Different obligation:

> When supplied an Open Knowledge Format v0.2 bundle, the bundle reader shall
> accept every bundle that conforms to the base specification.

The first example constrains an artifact; the second requires functional
behavior of a reader. Sharing an external reference does not make them one
Requirement.

## Related

- [Selecting a requirement specification method](selecting-a-requirement-specification-method.md)
- [Documenting constraint requirements](documenting-architecture-constraints.md)
- [One authority, many witnesses](one-authority-many-witnesses.md)
- [Reviewing a requirement set](reviewing-requirement-sets.md)

[^w3c-spec-guidelines]: The W3C QA Framework asks conformance clauses to
    identify what may conform and how, including product classes, profiles,
    modules, levels, discretionary items, and extension behavior.
[^iso-directives]: ISO/IEC drafting rules distinguish dated references, which
    apply the cited edition, from undated references, which apply the latest
    edition including amendments.
[^w3c-test-methodology]: W3C's method distinguishes a conformance requirement
    in a specification from the assertions and cases used to test it.
