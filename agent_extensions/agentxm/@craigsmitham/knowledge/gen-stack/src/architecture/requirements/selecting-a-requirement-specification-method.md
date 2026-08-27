---
type: Guide
title: Selecting a requirement specification method
description: Use when an accepted obligation needs a fitting expression or analysis approach; select any method by semantic fit, quality contribution, authority clarity, and proportionate lifecycle cost without treating documented methods as an allowlist.
tags: [requirements-engineering, specification-methods, structured-language, models, formal-methods, authority, quality]
status: draft
sources:
  - id: requirements-engineering
    resource: requirements-engineering.md
    title: Requirements engineering in software architecture
  - id: documenting-requirements
    resource: documenting-requirements.md
    title: Documenting requirements
  - id: one-authority-many-witnesses
    resource: one-authority-many-witnesses.md
    title: One authority, many witnesses
  - id: ears-2009
    resource: https://doi.org/10.1109/RE.2009.9
    title: Mavin et al. — Easy Approach to Requirements Syntax (EARS)
  - id: sei-qaw
    resource: https://resources.sei.cmu.edu/asset_files/TechnicalReport/2003_005_001_14249.pdf
    title: SEI — Quality Attribute Workshops, third edition
  - id: omg-ocl
    resource: https://www.omg.org/spec/OCL/2.4/PDF
    title: OMG Object Constraint Language 2.4
  - id: omg-dmn
    resource: https://www.omg.org/spec/DMN/1.5/PDF
    title: OMG Decision Model and Notation 1.5
  - id: omg-uml
    resource: https://www.omg.org/spec/UML/2.5.1/PDF
    title: OMG Unified Modeling Language 2.5.1
  - id: json-schema
    resource: https://json-schema.org/draft/2020-12/json-schema-core
    title: JSON Schema Core 2020-12
  - id: tla-plus
    resource: https://lamport.azurewebsites.net/tla/book-02-02-28.pdf
    title: Leslie Lamport — Specifying Systems
  - id: alloy
    resource: https://alloytools.org/spec.html
    title: Alloy language reference
  - id: gherkin
    resource: https://cucumber.io/docs/gherkin/reference/
    title: Cucumber Gherkin reference
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:30:00Z
---

# Selecting a requirement specification method

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide after an obligation, its authority, and its eligible
Architecture subject are understood, but its clearest expression or analysis
approach is not yet settled. Select the method that best exposes the meaning
and risks of this obligation while preserving the universal individual and
set quality criteria.

Gen Stack is **method-open and quality-governed**. The methods named here are
illustrative, not a closed set or an approval list. Absence of a method from
this guide does not make it unsuitable or nonconforming.

## Representation

Record a method choice in the native analysis or authoring surface, not as new
profile metadata. Present the dominant semantic difficulty, candidate methods,
fit and tradeoffs, selected role, output authority, and verification or review
needs. When authoring an accepted Requirement, apply the selected syntax,
table, model, or reference inside the profile-required `## Requirement`
section and make the precedence of multiple representations explicit.

## Keep five decisions separate

| Decision | Governing question |
| --- | --- |
| Admission | Is there one accepted obligation that belongs in a Requirement? |
| Classification | What kind of obligation is it? |
| Specification method | Which constructive form or analysis approach best exposes its meaning? |
| Artifact authority | Which output is normative, explanatory, analytical, architectural, or evidentiary? |
| Evaluation | How will a realized subject be assessed, under which conditions and bounds? |

A method cannot accept an obligation, choose its `requirement_type`, prove that
its source is correct, or establish that Implementation satisfies it. Keep
those decisions with their applicable authorities.

## 1. Diagnose the dominant semantic difficulty

Begin with the meaning that is hardest to state or review. Several difficulties
may apply, and several methods may usefully represent or examine the same
Requirement.

| Dominant difficulty | Illustrative methods | What they can make inspectable |
| --- | --- | --- |
| Conditions, continuing states, triggers, and responses | EARS or another structured natural language | Applicability, temporal ordering, explicit subject, and required response[^ears-2009] |
| Quantitative quality | Quality-attribute scenario, context–outcome–measure form, or fit criterion | Source or actor, stimulus, environment, affected subject, response, units, and response measure[^sei-qaw] |
| Preservation or operation boundaries | Invariant, predicate, precondition/postcondition, or contract form | Quantifiers, protected predicate, observation boundary, assumptions, and guarantees[^omg-ocl] |
| Combinatorial decisions | Decision table, truth table, or rule model | Input domains, combinations, overlaps, gaps, and rule-selection policy[^omg-dmn] |
| Lifecycle, mode, or protocol behavior | State-transition table or state machine | Legal states, events, guards, transitions, concurrency, and unreachable or omitted behavior[^omg-uml] |
| Interface or data shape | Schema, interface-description language, or incorporated interface standard | Machine-readable structural, lexical, and compatibility constraints[^json-schema] |
| Concurrent, distributed, safety, or liveness behavior | State-based or temporal formal method, such as TLA+ or Alloy | Interleavings, invariants, progress properties, counterexamples, and bounded relational consistency[^tla-plus][^alloy] |
| Domain interpretation and boundary cases | Scenarios, examples, example mapping, or Gherkin | Concrete contexts, events, observable outcomes, and shared stakeholder understanding[^gherkin] |
| Conformance to an external authority | Normative-reference conformance form | Exact target, edition, conformance class, scope, options, extensions, and deviations |

This table does not assign one method to a `requirement_type`. A functional
Requirement may need a state model; a quality Requirement may use structured
language; a constraint may incorporate a schema; and one conformance concern
may produce separate constraint, functional, quality, or process Requirements.

## 2. Assess the method in context

Choose the best-fit method at proportionate lifecycle cost. Simplicity is a
consideration, not an overriding rule. A single high-consequence obligation can
justify a specialized method even when the method is not used elsewhere.

Ask:

- Does the method faithfully represent the accepted obligation?
- Does it expose the dominant semantic difficulty better than reasonable
  alternatives?
- Can the result be reviewed against every applicable individual-quality
  characteristic?
- Does it help reveal relevant set-level gaps, conflicts, or interactions?
- Can subject, scope, conditions, bounds, quantifiers, versions, units, and
  assumptions be made explicit?
- Can affected readers review it with sufficient confidence, using an
  explanation or projection when the normative form needs specialist skill?
- Are tooling, training, portability, versioning, licensing, and maintenance
  costs proportionate to consequence, novelty, and uncertainty?
- Can any automated conclusion be reported within the model, inputs, bounds,
  environment, and properties actually examined?
- Can the method coexist with other representations without creating a second
  independently changeable authority for the obligation?

Do not choose a familiar method when it distorts the meaning, and do not add
formalism merely to make an unsupported obligation appear rigorous.

## 3. Classify every output by authority

A notation or executable format does not determine authority. Before admitting
an output, state which role it serves:

| Role | What the artifact owns |
| --- | --- |
| Normative Requirement expression | The local accepted obligation within its Requirement authority |
| Incorporated normative reference | Referenced definitions, provisions, profiles, or conformance semantics; not the local decision to adopt them |
| Explanatory representation | Reader-oriented interpretation that must not independently change the obligation |
| Supporting analysis model | A table, scenario, state space, predicate, projection, or formal abstraction used to expose meaning or defects |
| Architecture | The subject's responsibilities, boundaries, relationships, decisions, and response |
| Evaluation Protocol | The assessment method, oracle, cases, thresholds, sampling, and conditions |
| Evaluation Result or Observation | What one bounded execution or operating context established |

A Requirement may use more than one notation inside one canonical concept when
their precedence and roles are unambiguous. When a model or external document
is incorporated normatively, identify its stable version and applicable scope.
When a second representation only explains or analyzes the obligation, label
it accordingly and keep it subordinate to the normative expression.

## 4. Construct and verify the Requirement

Apply the selected method's own construction rules, then perform the universal
individual review in [Documenting requirements](documenting-requirements.md).
Method conformance is only one part of the `conforming` characteristic. It does
not establish necessity, appropriateness, feasibility, correctness, or set
completeness.

Use method-specific checks to reveal defects:

- EARS clause order and trigger cardinality;
- missing units, workloads, populations, windows, or tolerances;
- incomplete or contradictory decision-table rows;
- unreachable states, missing transitions, or overlapping guards;
- counterexamples or unsatisfied formal properties;
- schema vocabulary and processing assumptions; and
- uncovered examples and boundary cases.

Repair the owned meaning, not merely the notation. A precise model can still
formalize the wrong obligation.

## 5. Add set analysis independently

An individual expression method does not make a declared set complete or
consistent. Select complementary analysis in [Reviewing a requirement
set](reviewing-requirement-sets.md), such as scenario walks, source-disposition
maps, decision-table analysis, state coverage, interface compatibility,
simulation, trade studies, or model checking.

Several methods may legitimately witness the same Requirement because they
have different blind spots. Keep the Requirement's stable identity and the
authority of each witness explicit.

## When no focused guide exists

Use an unlisted method whenever it is the best fit. Document enough of its
semantics, version, interpretation rules, authority role, and limitations for
the intended reviewers to judge the Requirement. A dedicated Gen Stack guide
is helpful but never a prerequisite.

Add focused guidance later when use reveals recurring difficulty, an authority
boundary is repeatedly misunderstood, or misuse carries material consequence.
If the best method cannot be represented faithfully by the current profile,
preserve that representation gap for profile governance rather than forcing
the obligation into a documented method.

## Related

- [Documenting requirements](documenting-requirements.md)
- [Writing requirements with EARS](writing-requirements-with-ears.md)
- [Expressing invariants](expressing-invariants.md)
- [Specifying external-conformance requirements](specifying-external-conformance-requirements.md)
- [Reviewing a requirement set](reviewing-requirement-sets.md)
- [One authority, many witnesses](one-authority-many-witnesses.md)

[^ears-2009]: The EARS paper defines structured natural-language patterns for
    ubiquitous, event-driven, unwanted-behaviour, state-driven, and optional
    feature requirements and reports the limits of its case evidence.
[^sei-qaw]: The SEI quality-attribute scenario model distinguishes source,
    stimulus, environment, affected artifact, response, and response measure.
[^omg-ocl]: OCL defines invariants, preconditions, and postconditions over a
    declared model context.
[^omg-dmn]: DMN defines decision-table inputs, outputs, rules, completeness,
    and hit policies.
[^omg-uml]: UML state machines define states, events, guards, transitions,
    regions, and protocol behavior.
[^json-schema]: JSON Schema distinguishes vocabularies and assertions used to
    assess instance data; assertions not present in a schema cannot fail.
[^tla-plus]: TLA+ represents initial states, next-state relations, safety,
    liveness, and fairness for state-based systems.
[^alloy]: Alloy uses relational models and bounded analysis; absence of a
    counterexample within one scope is not an unbounded proof.
[^gherkin]: Gherkin organizes concrete examples around initial context, an
    event, and an observable outcome; executable examples remain finite
    witnesses unless a governing authority explicitly gives them another role.
