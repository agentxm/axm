---
type: Pattern
title: Just Enough Architecture Docs
description: A candidate human-first, risk-driven pattern for preserving accepted architecture meaning that authoritative repository and runtime sources cannot reveal reliably, without maintaining a parallel prose specification.
tags: [architecture-documentation, architecture-docs, human-comprehension, risk-driven, semantic-delta, lifecycle, stewardship, progressive-disclosure]
status: draft
sources:
  - id: fairbanks-risk-driven
    resource: https://www.georgefairbanks.com/software-architecture/documentation/
    title: George Fairbanks — Risk-driven architecture documentation
  - id: iso-42010
    resource: https://www.iso.org/standard/74393.html
    title: ISO/IEC/IEEE 42010:2022 — Architecture description
  - id: product-quality
    resource: ../foundations/product-quality.md
    title: Product quality in software architecture
generated:
  by: codex/gpt-5.6
  at: 2026-08-23T01:30:58Z
---

# Just Enough Architecture Docs

**Intent:** Preserve the accepted, durable meaning needed to change a system
safely in a form humans can quickly comprehend, while deferring precise and
current facts to the repository and runtime sources that already own them.

**Maturity:** Candidate. Established architecture practices support its parts,
but this exact synthesis needs evidence from independent use before it should
be treated as a proven pattern.

This pattern explains the philosophy, admission test, authority model, and
maintenance discipline behind the
[software-architecture-docs application
profile](software-architecture-application-profile.md). It is not an
alternative representation. The profile alone defines exact types, paths,
required concepts, containment, and permitted variance.

## Context

Use this pattern for a code-first system whose maintainers want a small
set of architecture docs without making prose the source of truth for detailed
functional specifications.

Code, tests, types, schemas, configuration, and runtime evidence already reveal
much of the system. They are often the most precise and current authority for
what the implementation accepts and does. Yet some accepted meaning remains
hard to infer: why a behavior matters, which business distinctions are
intentional, what quality risk drives a boundary, or which responsibility and
invariant must survive a rewrite.

## Problem

Structure-only architecture documentation can explain components while leaving
out the functional and quality context that makes those components
intelligible. A comprehensive prose specification can restore that context but
creates a parallel account of behavior that is costly to maintain and prone to
drift.

How can a team retain consequential functional, quality, and architectural
meaning without documenting everything the repository already says better?

## Forces

- **Meaning versus precision:** prose can explain intent and rationale; an
  executable source usually owns exact mechanics more reliably.
- **Cohesion versus disambiguation:** related concerns need to be understood
  together without collapsing functional, quality, and structural claims into
  one undifferentiated narrative.
- **Usefulness versus maintenance:** every durable document must repay review,
  discovery, and reconciliation costs.
- **Omission versus accumulation:** missing context makes consequential change
  unsafe, while excess context consumes attention, hides what matters, and
  creates more opportunities for drift.
- **Human comprehension versus machine availability:** a fact being queryable
  does not make its meaning obvious, but convenient prose is not a reason to
  copy a fact that an authoritative source can present reliably.
- **Desired state versus observed state:** accepted obligations must remain
  distinguishable from current implementation and operational evidence.
- **Stable subjects versus arbitrary symmetry:** different systems need
  documents around different offerings, audiences, needs, jobs, use cases,
  product surfaces, features, capabilities, subsystems, or cross-cutting
  concerns.
- **Discovery versus ontology:** one directory tree must make useful questions
  easy to browse without pretending that all architecture relationships form
  one hierarchy.

## Solution

Maintain one cohesive, human-readable set of architecture docs for each system
or bounded authority. Treat it as a **semantic delta over the repository and
its operational authorities**: admit only accepted, durable meaning that is
consequential to the system's value or architecture and cannot be inferred
reliably enough from code, tests, schemas, configuration, repository structure,
generated views, or live evidence.

Optimize first for a maintainer who must understand the system well enough to
make or review a change. Prefer a short explanation, a small table, or a
purposeful diagram when it reduces reading effort. Do not optimize for document
count, taxonomy completeness, or the amount of context available to an agent.
Aim for mutually exclusive ownership and collectively sufficient coverage of
the consequential reader questions in scope. Do not force architecture
concepts themselves into a mutually exclusive hierarchy: use cases,
capabilities, domain contexts, and structural elements legitimately overlap
through explicit relationships.

Represent every corpus that adopts this pattern as an OKF v0.2 bundle that
explicitly adopts and conforms to the [Software architecture docs application
profile](software-architecture-application-profile.md). This pattern supplies
the philosophy, admission test, authority model, and maintenance discipline;
the profile supplies the normative types, metadata, paths, containment,
validation, and permitted representation variance. Unprofiled architecture
material may inform migration, but it is not an alternative conforming form of
Just Enough Architecture Docs.

### Apply the admission test

Keep a claim in the architecture docs when all of these are true:

1. It expresses accepted desired state, not an unaccepted proposal.
2. It matters to functional meaning, a consequential quality, or architecture.
3. It is likely to remain useful through ordinary implementation change.
4. Authoritative repository, generated, and runtime sources do not reveal it
   reliably enough, unambiguously enough, and with reasonable effort.
5. The risk reduced by retaining it outweighs its reading, discovery, review,
   reconciliation, and drift cost.

If a claim fails the test, leave it with the source that naturally owns it.
Temporary design options belong in proposals or work records; exact mechanics
belong in executable artifacts; observed operation belongs in live evidence.

### Balance omission and maintenance risk

Use two questions for every proposed addition, revision, consolidation, or
removal:

1. **What happens if this meaning is absent or misunderstood?** Consider the
   consequence and likelihood of wrong change, rediscovery difficulty,
   irreversibility, safety or compliance exposure, cross-boundary effects,
   onboarding frequency, and how many people or teams depend on it.
2. **What does maintaining it cost?** Consider duplication, rate of change,
   number of owners and representations, review burden, reading and navigation
   cost, evidence quality, and whether drift would be easy to detect.

Document more when omission risk is high and the meaning is otherwise hard to
recover. Document less, link, or generate when the source changes frequently,
already has a clear authority, or the prose would be another inventory. The
smallest safe response may be one sentence, a named concept, a relationship, a
diagram, or an evidence link rather than another document.

This scales by risk rather than organization size. A solo hobby project may
express the required lifecycle, ownership, decision-policy, and assurance
context in only a few sentences each. A large system may warrant more
independently owned concepts and views because its change surface, coordination
cost, constraints, or assurance obligations are greater. Neither scale earns a
complete optional taxonomy by default.

### Assign authority by information kind

Use prose for durable meaning: purpose, stakeholder concerns, business
distinctions, responsibilities, non-responsibilities, rationale, invariants,
accepted product quality requirements, and architectural consequences.

Let the other authorities retain their strengths:

| Authority | What it should own |
| --- | --- |
| Tests and executable examples | Exact supported scenarios and regression evidence |
| Types, schemas, and interface definitions | Exact machine-consumed contracts |
| Code and configuration | Current implementation and wiring |
| Runtime and observability systems | Current deployed and observed state |
| Work tracking and proposals | Delivery state and unaccepted future choices |

Link to those sources when they support a durable claim. Do not transcribe them
into prose merely to make a document look complete.

When a current inventory or structural view is useful for comprehension,
prefer a generated artifact or a stable query/tool route over a manually
maintained list. Explain the durable interpretation, boundary, or consequence
around it; let the authoritative source continue to own its members and exact
shape.

### Choose a subject before choosing views

Organize each substantive document around one cohesive subject that readers
need to reason about. Do not combine several independently addressable
offerings, use cases, capabilities, features, systems, containers, components,
or other peer entities in a plural inventory document. Common subjects include:

- a system foundation or shared policy;
- an offering, audience, need, job, value proposition, or use case;
- a product surface or feature;
- a business or technical capability;
- a subsystem or bounded authority; or
- a system-wide policy or quality requirement such as identity, recovery, or
  trust.

These are alternatives, not a required hierarchy. A capability view may expose
end-to-end outcomes while a product-surface view exposes user-visible rules.
Use whichever subject produces the most coherent ownership and change context.
Do not create matching documents for every feature or capability when only some
contain durable, non-inferable concerns. When a concept is admitted, give it
its stable named file immediately. For example, the first maintained use case
is `use-cases/confirm-reservation.md`, not `use-cases.md`. The collection and
its navigational `index.md` appear with that first concept; no empty collection
is required beforehand and no identity-changing split is required later.

When several views are useful, retain their distinctions: offerings connect
audiences to coherent value; needs and jobs explain demand; value propositions
express scoped promises; use cases express actor goals through a subject;
capabilities express stable abilities or outcomes; features express
recognizable behavior; surfaces express encounter points; domain contexts
express semantic and authority boundaries; and C4 elements express structural
realization. The relationships among them are normally many-to-many and should
not be replaced by one folder hierarchy.

### Organize for discovery, not ontology

Treat the directory tree as a route into the architecture, not as the
architecture model itself. The application profile requires a small root
system-context kernel. Conditional collections for ADRs, constraints, value,
use cases, capabilities, features, surfaces, domains, structure, and quality
appear only when an admitted concept earns them. Omit a conditional collection
when no current claim passes the admission test; add another top-level
collection only when it serves a consequential reader question that none of
the profile routes can represent coherently.

Within `value/`, keep offerings, audiences, needs, jobs, and value propositions
in sibling collections. Keep goal-oriented behavior in the top-level
`use-cases/` collection. These concepts form a relationship network, not an
offering-owned tree. The [Offerings and value in software
architecture](../foundations/offerings-and-value.md) foundation owns their
shared model and distinctions from capabilities, features, domains, and
structure; [Jobs to Be Done](../foundations/jobs-to-be-done.md) owns the deeper
explanation of jobs as evidence-backed progress in circumstances.

Use `quality/` only for named, accepted, architecture-significant Product
Quality Requirements. Classify each beneath one primary ISO/IEC 25010:2023
characteristic and subcharacteristic, create only the paths earned by admitted
requirements, and link secondary classifications rather than duplicate the
concept. Keep `quality/index.md` navigational. Put cross-requirement priorities
and tradeoffs in the accepted decisions and affected concepts that own them;
do not invent a mandatory Product Quality View. The [Product quality in software
architecture](../foundations/product-quality.md) foundation owns the model and
its distinction from quality needs, risks, architecture responses, and
assessment evidence.[^product-quality]

Within `domains/`, classify subdomain knowledge under `generic/`, `core/`, or
`supporting/`. Keep bounded-context documents in the sibling `contexts/`
collection and their relationship views in `context-maps/`. Connect a
subdomain and bounded context with reciprocal, typed links such as *is modeled
by* and *models all or part of*; neither directory ancestry nor a shared name
establishes a one-to-one relationship. This keeps strategic classification
first class while allowing one context to model several subdomains and one
subdomain to be modeled by several contexts.

Let domain indexes provide domain-first routes to related contexts without
physically nesting them. Let each context document own its durable purpose,
model and language scope, authority, exclusions, and consequential
relationships. Link to code, schemas, configuration, and tests as current
realization or conformance evidence rather than relying on implementation
structure as the only declaration of the context.

The [Software architecture docs application
profile](software-architecture-application-profile.md) owns the exact OKF
types, metadata, paths, author-facing relationship meanings, and
profile-conformance rules for these concepts. Any permitted representation
choice or extension must be stated by the profile rather than introduced as a
repository-local waiver.

Give each maintained element one canonical home. A primary grouping may locate
it, but relationships to other views remain explicit, typed links rather than
duplicate documents or implied folder ancestry. Preserve true containment when
the model defines it—for example, C4 components belong beneath their owning
container—without turning every other relationship into structural nesting.

The same profile owns the exact types, metadata, paths, containment, view
distinctions, and profile-conformance rules for C4 structural concepts.

### Keep functional, product quality, architecture, and evidence distinct

Within a subject, include only the information roles that carry material
meaning:

- **Functional:** outcomes, business distinctions, rules, state transitions,
  permissions, failure semantics, and cross-surface interactions that code
  cannot explain reliably by itself.
- **Product quality:** accepted requirements, conditions, assessment routes,
  tradeoffs, and risks that constrain the solution.
- **Architecture:** responsibilities, non-responsibilities, authority,
  boundaries, dependencies, invariants, and the structural response to the
  functional behavior and product quality requirements.
- **Evidence:** links to tests, contracts, schemas, checks, telemetry, or code
  that provide current detail or conformance evidence.

These are distinctions in meaning, not mandatory view types or document
headings. Functional and architectural meaning may be sections in one cohesive
subject document. An admitted Product Quality Requirement receives its own
stable named concept; a requirement owned elsewhere is linked from the
affected architecture concept. Co-locate meaning when it changes and is
reviewed together, and separate it when its authority or lifecycle differs.
Never add an empty heading merely to satisfy a template.

Use a visualization when spatial relationships, ownership, sequence, state
change, or several mappings become materially easier to understand than prose.
Keep it scoped to one question, label relationships meaningfully, and avoid
manually redrawing current code or deployment inventories that can be
generated. A diagram is part of the explanation, not decoration.

### Let system context drive selection

At the system level, make it easy for a reader to learn:

- the system's lifecycle or support state, such as experimental, active,
  maintained, deprecated, or retired, using the repository's accepted terms;
- the stable ownership and maintenance route without a volatile roster;
- how consequential decisions are accepted, recorded, and reconsidered; and
- what confidence, evidence, review, or approval obligations apply.

These are all risk drivers, but Risk Driver is not a separate semantic bucket.
The [application profile](software-architecture-application-profile.md) gives
each concern its required root identity and exact contract. Each may be brief
or may establish a justified absence; none may disappear silently. Containers
and components inherit this context unless a distinct exception is
consequential. OKF `status` continues to describe the document lifecycle and
must not be overloaded for system lifecycle.

### Keep semantic changes under human authority

An agent may identify that a document should be added, reduced, merged,
reclassified, or retired. Unless the user has explicitly authorized that class
of semantic change and its scope, present it as a recommendation rather than
changing the corpus. Ground the recommendation in the evidence, omission risk,
maintenance or drift cost, smallest safe change, and the authority needed to
accept it. Mechanical link or navigation repair is different from deciding
what architecture meaning deserves to exist.

An agent may use the ISO/IEC 25010 model to recommend investigation or expose a
possible omission. It must not generate Product Quality Requirements from the
taxonomy, infer accepted desired state from code or telemetry, invent a target,
create empty quality collections, or turn an unresolved need or risk into
architecture truth without the same semantic authority.

ISO/IEC/IEEE 42010 organizes architecture descriptions around stakeholders,
concerns, viewpoints, and views without prescribing one document format.[^iso-42010]
The information distinctions here serve the same selection purpose while
making functional and product quality context explicit. Product Quality
Requirement is a narrower application-profile concept, not a replacement for
the general stakeholder-concern vocabulary.

### Reconcile disagreement explicitly

Within this pattern, maintained architecture prose records accepted desired
architectural state. It is an architecture description, not the system's
effective architecture itself. Executable and live sources show supported,
implemented, or observed state within their scopes. When they disagree,
determine whether the implementation is wrong, the document is obsolete, the
evidence is insufficient, or the accepted intent has changed. Update the
appropriate authority; do not silently declare whichever artifact is newest to
be correct.

## Consequences

The architecture docs become small enough to review and portable enough to survive
refactoring. Readers can understand not only how the system is divided, but
which functional behavior and product quality requirements justify the
division. The approach avoids
exhaustive requirements duplication and traceability machinery.

The selectivity requires judgment. Some important context will be omitted until
its absence causes friction. Documents can still drift, and teams must resolve
disagreement rather than relying on a universal precedence rule. The pattern
also provides less standalone detail than a regulated or contractually required
specification set; use those required artifacts when the context demands them.

## Use when

- executable sources already provide strong behavioral and contract evidence;
- maintainers need durable context that is expensive to rediscover;
- the system has consequential functional or quality constraints on its
  structure; and
- a comprehensive prose specification would create more maintenance than
  confidence.

## Do not use as a substitute for

- externally mandated requirements, assurance, or traceability records;
- a temporary design proposal or architecture decision under evaluation;
- API, schema, or configuration reference generated from its owning source;
- operational runbooks and live service-state evidence; or
- tests needed to establish exact supported behavior.

## Failure modes

- **Too little context:** “the code is the documentation” becomes an excuse to
  omit non-inferable business meaning and tradeoffs.
- **Catalog thinking:** the architecture docs mirror every feature, capability, component,
  or quality characteristic regardless of architectural significance.
- **Catch-all concepts:** several peer entities begin in one plural document
  and later require a disruptive split into stable identities.
- **Generic quality labels:** words such as *secure* or *scalable* appear
  without stakeholders, conditions, responses, measures, or consequences.
- **Forced symmetry:** every subject gets identical headings and empty views.
- **Folder ontology:** directory ancestry is mistaken for the many-to-many
  relationships among architecture views.
- **Split-view drift:** functional, quality, and architecture documents describe
  the same claim independently instead of linking to one owner.
- **Prose as executable truth:** examples or copied contracts become a second
  implementation specification.
- **Invisible system context:** readers cannot tell the lifecycle, ownership,
  decision policy, or assurance posture that should govern documentation depth
  and architecture change.
- **Agent-authored expansion:** a useful suggestion becomes accepted durable
  meaning without explicit authority to add or remove semantic content.
- **Silent reconciliation:** current code or newer prose is assumed to win
  without checking the accepted intent and the scope of evidence.

## Evidence and provenance

George Fairbanks describes a risk-driven approach in which architecture effort
is proportionate to risk and small projects may need only minimal
documentation.[^fairbanks-risk-driven] ISO/IEC/IEEE 42010 supplies the
stakeholder, concern, viewpoint, and view model used to select relevant
architectural communication.[^iso-42010] These precedents support the pattern's
selective foundations. The combined admission test, subject/view separation,
and explicit functional–product-quality–architecture distinction are presented
here as a candidate pending independent known uses.

## Related guidance

- [Software architecture overview](../overview.md)
- [Invariants, preservation, and enforcement](../foundations/invariants-and-enforcement.md)
- [Product quality in software architecture](../foundations/product-quality.md)
- [Reviewing responsibilities with scenarios](../guides/reviewing-responsibilities-with-scenarios.md)
- [Organizing an architecture docs corpus](../guides/organizing-an-architecture-docs-corpus.md)
- [Software architecture docs application profile for OKF v0.2](software-architecture-application-profile.md)
- [Offerings and value in software architecture](../foundations/offerings-and-value.md)
- [Jobs to Be Done](../foundations/jobs-to-be-done.md)
- [Capabilities in software architecture](../foundations/capabilities.md)
- [Domain-driven design](../foundations/domain-driven-design.md)
- [C4 model](../foundations/c4-model.md)
- [Wardley mapping](../foundations/wardley-mapping.md)

[^fairbanks-risk-driven]: Fairbanks advocates matching architecture effort to
    risk rather than applying the same documentation burden to every project.
[^iso-42010]: ISO/IEC/IEEE 42010 defines requirements for architecture
    descriptions and relates stakeholder concerns to viewpoints and views.
[^product-quality]: Product quality in software architecture applies the
    ISO/IEC 25010 product quality model selectively to accepted,
    architecture-significant requirements and routes precise measures and
    evidence to their owning authorities.
