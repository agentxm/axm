---
type: Explanation
title: Capabilities in software architecture
description: How capabilities describe stable abilities independently of the offerings, jobs, features, domain models, interaction surfaces, and software structures that motivate or realize them.
tags: [capabilities, business-capabilities, system-capabilities, offerings, features, jobs-to-be-done, bounded-contexts, c4, surfaces, architecture-views]
status: draft
sources:
  - id: aws-caf
    resource: https://docs.aws.amazon.com/prescriptive-guidance/latest/aws-caf-platform-perspective/overview.html
    title: AWS Cloud Adoption Framework — Platform perspective
  - id: sap-business-capability
    resource: https://help.sap.com/docs/SAP_ENTERPRISE_ARCHITECTURE_FRAMEWORK/60bc20e6e0a24426a817705bcb415220/c5cd3c0510f74bfcb9962dc50ac1ff6a.html
    title: SAP Enterprise Architecture Methodology — Business Capability
  - id: jobs-to-be-done
    resource: /intent/jobs-to-be-done.md
    title: Jobs to Be Done
  - id: goal-oriented-behavior
    resource: /intent/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - id: ddd-reference
    resource: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    title: Domain-Driven Design Reference
  - id: c4-abstractions
    resource: https://c4model.com/abstractions
    title: C4 model — Abstractions
  - id: c4-software-system
    resource: https://c4model.com/abstractions/software-system
    title: C4 model — Software system
  - id: safe-features-capabilities
    resource: https://framework.scaledagile.com/features-and-capabilities
    title: Scaled Agile Framework — Features and Capabilities
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:44:29Z
---

# Capabilities in software architecture

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

A capability view answers a durable architecture question:

> What must an identified organization, system, or subsystem be able to do?

This question connects purpose and desired outcomes to changing product and
technical realizations. It does not replace the views that explain user
motivation, recognizable behavior, domain meaning, interaction points, or
software structure.

## A capability is an ability of a bearer

A **capability** is an outcome-oriented ability of an identified bearer. A
useful capability therefore has four parts:

- a **bearer**, such as an organization, system, or subsystem;
- an **ability**, expressed without prescribing its realization;
- a **purpose or outcome** that makes the ability consequential; and
- a declared **scope or level**, so readers do not confuse an enterprise
  capability with a narrower system capability.

Business-architecture sources commonly describe capabilities as what an
organization must be able to do, independently of the processes, people, or
technology that realize them.[^aws-caf][^sap-business-capability] Software
architecture can apply the same distinction to a documented System. For
example, *capacity allocation* may be a capability of a reservation platform
even though several organizational capabilities, product features, domain
models, and runtime elements participate in providing it.

An ability is not the same as its result. *Detect potentially fraudulent
payments* is a capability; *reduce fraudulent loss* is an intended outcome.
Nor is an ability the same as its assignment or obligation: architecture may
assign responsibility for providing a capability, while a Requirement states
what an eligible subject shall do or be. The capability remains the ability.

A capability may have durable identity even when its realization is
incomplete. Maturity, capacity, current performance, and confidence are
assessments of the capability, not part of its identity. A Requirement may
oblige an eligible subject to provide the ability or constrain how well it is
provided. Quality concerns such as latency, availability, and recoverability
do not become capabilities themselves.

## Complementary architecture questions

Several neighboring concepts can describe the same subject without being
synonyms. This table is a capability-centered projection of their boundaries;
[Offerings and value in software architecture](/intent/offerings-and-value.md) owns the
broader demand-and-value comparison.

| Concept | Question it answers | Relationship to capability |
| --- | --- | --- |
| Goal or outcome | What result is desired? | A capability is an ability that can produce or support results, not the result itself. |
| Offering | What coherent value is intentionally made available? | An offering can depend on several organizational and system capabilities; it is not itself an ability. |
| Job to be done | What progress is an actor seeking in particular circumstances? | A job explains demand; a capability describes an ability of a possible provider. |
| Use case | How does a subject behave so an external actor can achieve a goal? | A use case exercises capabilities; it is not itself an ability of the provider. |
| Feature | What independently recognizable behavior is available across one or more use cases or surfaces? | Features contribute to capabilities, but a capability may also depend on operational behavior no actor recognizes as a feature. |
| Surface | Where does an actor encounter behavior? | A surface exposes behavior through an application, API, command line, protocol, device, or console. |
| DDD subdomain | What area of problem-space knowledge matters? | A subdomain organizes domain knowledge and strategic differentiation rather than abilities. |
| Bounded context | Within what boundary does a model and language apply consistently? | A context governs domain meaning, rules, or state used while providing capabilities. |
| C4 element | What software structure realizes the system? | Software systems, containers, components, and code can realize capabilities; capability is not another C4 level. |
| Process or service | How is an ability exercised or offered? | Processes and services can realize or deliver capabilities and can change while the capability remains stable. |

Jobs to Be Done centers the progress an actor seeks in particular
circumstances, including functional, social, and emotional forces.[^jobs-to-be-done]
This makes a job a demand-side perspective. One job may call for several
capabilities, and one capability may help address several jobs.

[Goal-oriented behavior and use cases](/intent/goal-oriented-behavior.md) distinguishes
the actor goal and scenario from the provider ability and independently
recognizable feature.[^goal-oriented-behavior]

[Domain-driven design](/architecture/domains/domain-driven-design.md) makes domain models and
ubiquitous language explicit within bounded contexts.[^ddd-reference] A
capability can draw on several subdomains and contexts; a context can govern
rules used by several capabilities. Neither view should be forced beneath the
other.

The [C4 model](/architecture/structure/c4-model.md) describes hierarchical software structure using
systems, containers, components, and code.[^c4-abstractions] Its software-system
guidance explicitly distinguishes software systems from business capabilities
and bounded contexts.[^c4-software-system] Capability-to-structure mappings are
therefore generally many-to-many.

## Relate the views instead of nesting them

Typed relationships preserve the distinctions while showing how the views
work together:

| Relationship | Meaning |
| --- | --- |
| offering **depends on** capability | The coherent value requires the identified bearer to possess the ability. |
| system **provides** capability | The system is responsible for making the ability available. |
| capability **enables progress on** job | The ability helps an actor make the progress described by the job. |
| use case **exercises** capability | The subject requires or invokes the bearer's ability while pursuing an actor goal. |
| feature **enables** use case | Independently recognizable behavior contributes to one or more actor goals. |
| feature **contributes to** capability | Recognizable behavior helps provide the ability. |
| feature **is available through** surface | Actors can encounter the behavior at that interaction point. |
| capability or feature **uses domain authority from** bounded context | The context owns relevant language, rules, or state without necessarily owning the whole capability or feature. |
| capability, feature, or surface **is realized by** C4 element | Structural elements implement or operate that view. |
| capability **is constrained by** concern | A functional, quality, trust, or operational concern limits acceptable realization. |

An application illustrates why the distinctions matter. It can be a surface in
an actor-interaction view and a C4 container in a structural view. It may expose
features that contribute to several capabilities, while those capabilities
also depend on other applications or operational behavior. Selecting one label
as the application's universal identity would discard useful information.

## Decompose without turning abilities into implementation

Capabilities can decompose recursively when every child remains an ability of
the declared bearer or a clearly narrower bearer. For example, *reservation
management* might depend on *capacity allocation* and *reservation lifecycle
management*. A child named after the current team, application, workflow, or
vendor has crossed into another view.

Keep scope consistent within a decomposition. An enterprise capability, a
platform capability, and a component responsibility may be related, but they
do not belong in one unqualified tree. State the bearer when a name could be
read at several levels.

A capability map visualizes a capability model; a folder tree does not become
one merely by storing capability documents hierarchically. Use links for
cross-view and many-to-many relationships, and reserve physical nesting for a
decomposition readers actually need to browse.

## Admit durable meaning, not a complete-looking catalog

Capability documentation earns maintenance when it preserves a consequential
ability or distinction that cannot be inferred reliably from current features,
code, or organizational structure. A useful capability document can explain:

- the bearer, scope, ability, and intended outcome;
- exclusions that prevent overlap with neighboring capabilities;
- consequential sub-capabilities or dependencies;
- relationships to jobs, features, surfaces, domain authorities, structural
  realization, and concerns; and
- the evidence that establishes current realization or performance, without
  copying that evidence into prose.

Do not require a comprehensive enterprise map merely to make the architecture
architecture docs look complete. Apply the architecture admission test to each capability,
and let code, tests, schemas, catalogs, and operational systems continue to own
the precise current facts they express better.

## Avoid overloaded uses

Some delivery frameworks use **Capability** as a planning level. SAFe, for
example, defines it as large solution functionality that commonly spans
multiple release trains and decomposes into features.[^safe-features-capabilities]
That is a legitimate framework-specific term, but it is not the meaning
adopted by these architecture docs. Qualify it as a *SAFe Capability* or
*capability work item* when both vocabularies are present.

Other common reductions are equally misleading:

- a feature list describes offered behavior, not every underlying ability;
- an organization chart assigns people but does not define capabilities;
- an application inventory names current realization rather than stable
  abilities;
- a process map shows how work proceeds rather than what must be possible;
- a DDD domain map organizes problem knowledge and model boundaries; and
- a maturity heat map assesses capabilities but does not establish their
  identity.

## Example: a reservation platform

A traveler may have the job *help me secure scarce capacity without worrying
that it will disappear during checkout*. The reservation platform offering
depends on the capability *reservation management*. A *traveler reservation*
use case exercises that capability through a checkout surface, while a *saved
traveler details* feature provides recognizable behavior across reservation
and modification use cases.
Reservation and inventory bounded contexts govern the rules and state, while
several C4 containers and components realize them. Recovery and consistency
concerns constrain the acceptable result.

These elements describe one situation from different perspectives. None is the
parent taxonomy for all the others.

## Relationship to architecture guidance

This foundation establishes the meaning needed to use `capabilities/`,
`features/`, and `surfaces/` as separate architecture views.

The [Gen Stack application profile for OKF
v0.2](/profile/gen-stack-application-profile.md)
defines `Capability`, `Feature`, and `Surface` types, common frontmatter, paths,
and manual validation rules alongside the architecture docs' DDD and C4
concepts. The [Gen Stack vocabulary and relationship model](/glossary.md) owns
the identifiers, direction, reciprocity, and author-facing meanings of their
controlled cross-view relationships. The profile's `relationships` map makes
those consequential edges locally discoverable while preserving one
authoritative assertion and mechanically synchronized reciprocal views.

Use the focused guides for [capabilities](/architecture/capabilities/documenting-capabilities.md),
[features](/architecture/features/documenting-features.md), and
[surfaces](/architecture/surfaces/documenting-surfaces.md) when authoring one artifact.

## Related

- [Offerings and value in software architecture](/intent/offerings-and-value.md)
- [Goal-oriented behavior and use cases](/intent/goal-oriented-behavior.md)
- [Jobs to Be Done](/intent/jobs-to-be-done.md)
- [Domain-driven design](/architecture/domains/domain-driven-design.md)
- [C4 model](/architecture/structure/c4-model.md)
- [Wardley mapping](/intent/wardley-mapping.md)
- [Quality requirements in software architecture](/architecture/requirements/product-quality.md)
- [Gen Stack application profile for OKF v0.2](/profile/gen-stack-application-profile.md)

[^aws-caf]: AWS Cloud Adoption Framework — Platform perspective
[^sap-business-capability]: SAP Enterprise Architecture Methodology — Business Capability
[^jobs-to-be-done]: Jobs to Be Done distinguishes demand-side progress from
    needs, offerings, use cases, capabilities, and solution structure.
[^goal-oriented-behavior]: Goal-oriented behavior and use cases distinguishes
    actor goals and scenarios from provider abilities and independently
    recognizable features.
[^ddd-reference]: Domain-Driven Design Reference
[^c4-abstractions]: C4 model — Abstractions
[^c4-software-system]: C4 model — Software system
[^safe-features-capabilities]: Scaled Agile Framework — Features and Capabilities
