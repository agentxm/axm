---
type: Reference
title: Gen Stack vocabulary and relationship model
description: The semantic authority for Gen Stack terms, stable identifiers, definitions, distinctions, relationship meaning and cardinality, and prohibited inferences across the complete method.
tags: [glossary, vocabulary, terminology, concept-model, gen-stack, specification, change-specification, bugfix-specification, defect, defect-report, bug, process, process-model, process-enactment, work-items, workflow, ooda, control-loop, pace-layer, trust-gradient, signals, observations, relationships, relationship-semantics, cardinality, traceability, intent, value, requirements, requirement-classification, architecture, change-design, technical-design, evaluations, evaluation-protocol, evaluation-case, evaluation-coverage, evaluation-execution, evaluation-result, implementation, implementation-unit, system-context, architecture-decisions, capabilities, features, surfaces, domain-driven-design, c4]
status: draft
sources:
  - id: boyd-ooda
    resource: https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf
    title: John R. Boyd — The Essence of Winning and Losing
  - id: fowler-evaluations
    resource: https://chadfowler.com/regenerative-software/3mb526js42k26/
    title: Chad Fowler — Evaluations Are the Real Codebase
  - id: iso-25040
    resource: https://www.iso.org/standard/83467.html
    title: ISO/IEC 25040:2024 — Quality evaluation framework
  - id: iso-29119-series
    resource: https://committee.iso.org/sites/jtc1sc7/%68ome/projects/flagship-standards/isoiecieee-29119-series.html
    title: ISO/IEC/IEEE 29119 series — Software testing
  - id: process
    resource: processes/process.md
    title: Process
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T01:11:07Z
---

# Gen Stack vocabulary and relationship model

## Authority and scope

This reference is the semantic authority for the Gen Stack method. It owns the
preferred names, local identifiers, definitions, distinctions, and controlled
relationship semantics used throughout this bundle. Explanations and guides
may apply or elaborate the vocabulary, but they defer to this reference when
they name a term, relationship, cardinality, or prohibited inference. A
semantic disagreement with an Explanation, Guide, or application profile is a
defect in that dependent document, not an alternate meaning.

The [Gen Stack application profile](profile/gen-stack-application-profile.md)
is the separate authority for representing the governed subset as OKF
concepts. It owns governed types, paths, metadata fields, colocation, and
profile validation. A profile field that records a controlled relationship is
an encoding of the relationship defined here, not an independent definition.
Explanations deepen understanding through rationale, examples, comparisons,
consequences, and tradeoffs. Guides support selection, authoring, review, and
maintenance. Neither can add canonical meaning or profile-conformance rules.

The backticked identifier following each preferred term is stable within this
vocabulary. Relationship identifiers are stable in the same way. Identifiers
use lower-kebab-case, are never reassigned to different meanings, and do not
commit the bundle to a public IRI or a particular semantic-web technology.
Changes to a preferred label preserve its identifier when the meaning remains
the same; changes to meaning are recorded in the bundle log.

This human-readable reference is authoritative. The bundle does not currently
publish a normative RDF, OWL, SHACL, or other machine-readable ontology. A
future projection must identify the published bundle version or source
revision it represents and be generated from, or mechanically checked against,
this reference before it can claim equivalence.

## Understanding routes

The glossary remains sufficient to resolve semantic disputes. These existing
Explanation documents provide deeper understanding without replacing its
definitions:

| Area | Primary explanations |
| --- | --- |
| Gen Stack authorities and flow | [How the Gen Stack operates](overview.md) |
| Offerings, audiences, needs, and value propositions | [Offerings and value](intent/offerings-and-value.md) |
| Jobs to Be Done | [Jobs to Be Done](intent/jobs-to-be-done.md) |
| Use cases and goal-oriented behavior | [Goal-oriented behavior and use cases](intent/goal-oriented-behavior.md) |
| Architecture authority | [Software architecture overview](architecture/overview.md) |
| Capabilities, Features, and Surfaces | [Capabilities](architecture/capabilities/capabilities.md) |
| Subdomains, Bounded Contexts, and Context Maps | [Domain-driven design](architecture/domains/domain-driven-design.md) |
| C4 elements and views | [C4 model](architecture/structure/c4-model.md) |
| Requirements and their classifications | [Requirements engineering](architecture/requirements/requirements-engineering.md) and [Requirement classification](architecture/requirements/requirement-classification.md) |
| Evaluation concepts and Protocols | [Evaluation as bounded evidence](evaluations/evaluation-as-bounded-evidence.md) and [Evaluation Protocols as assessment contracts](evaluations/evaluation-protocols-as-assessment-contracts.md) |
| Change Design | [Change Design](design/change-design.md) |
| Processes | [Process](processes/process.md) |
| Adaptive control | [OODA as the Gen Stack control loop](control-loop/ooda-control-loop.md) |

## Signals and observations

**Signal** (`signal`) is an indication that some part of the Gen Stack may require
attention. A request, anomaly, incident, Evaluation Result, environmental
change, or runtime event can be a Signal. It carries no conclusion about what
should change, whether anything has been accepted, or which authority is
responsible.

**Observation** (`observation`) is a contextual record of something perceived in the system or
its environment. It states what was observed, with relevant conditions,
Provenance, and uncertainty; it is evidence about what is or happened, not what
ought to be. A Signal may reference one or more Observations, and an Observation
may exist without triggering action.

## Defects and corrective work

**Defect** (`defect`) is an imperfection or deficiency in the system or in a
work product that describes, governs, realizes, or evaluates it—including
Requirements, Architecture, Change Design, Implementation, Evaluations, tests,
and documentation—relative to an applicable expectation or intended use. A
Defect does not by itself establish observable defective system behavior or
authorize correction.

**Defect Report** (`defect-report`) is a Work item created from an Observation,
received concern, or static finding that may indicate one or more Defects. It
preserves the originating Signal, source, expectation, evidence, investigation,
classification, disposition, and Provenance. It does not itself prove a Defect
or Bug, specify a corrective change, or become a Bugfix Specification.

**Bug** (`bug`) is a Defect expressed as concrete defective behavior or a
defective condition in the realized system and identified through
investigation. A Bug may be evidenced by one or more Defect reports and may
arise from, be sustained by, or expose additional Defects in Requirements,
Architecture, Change Design, Implementation, Evaluations, tests, or other work
products. One Defect may contribute to several Bugs. A suspected Defect
remains a diagnostic hypothesis until it is established relative to an
applicable expectation or intended use. Identifying a Bug does not by itself
authorize correction or require a Bugfix Specification.

## Cross-cutting system context and governance

These concepts appear at the corpus root because they apply across Intent and
Architecture. Root placement expresses scope, not semantic containment.

<a id="term-system"></a>
**System** (`system`) is the root subject being documented. It defines the system's
purpose, boundary, material exclusions, and important environmental
relationships and owns genuinely system-wide Requirements. It is not an
Offering or a C4 Software System.

<a id="term-system-lifecycle"></a>
**System Lifecycle** (`system-lifecycle`) records the accepted lifecycle or support state, material
change horizon, expected evolution, and events that trigger reassessment.

<a id="term-system-ownership"></a>
**System Ownership** (`system-ownership`) records stable maintenance accountability, its stewardship
boundary, and continuity, transfer, or escalation routes without copying a
volatile roster.

<a id="term-architecture-decision-policy"></a>
**Architecture Decision Policy** (`architecture-decision-policy`) defines
which choices require an Architecture Decision Record, who or what accepts and
supersedes them, where records live, their minimum content, and when they must
be reconsidered.

<a id="term-system-assurance"></a>
**System Assurance** (`system-assurance`) defines the confidence required for architecture-
significant change, the evidence authorities used to establish it, required
review or approval, and reassessment triggers.

Lifecycle, Ownership, Decision Policy, and Assurance are governance concepts,
not Requirement subjects. A binding obligation expressed through them becomes
a linked Process Requirement owned by an eligible Architecture subject,
normally System.

## Intent

**Intent** (`intent`) captures human-oriented direction about desired outcomes and why
they matter. It is formed or revised through Orientation in response to
Signals, Observations, and other context, but is not those inputs. It may be
informal, incomplete, conflicting, or not yet accepted.

### Offering

<a id="term-offering"></a>
**Offering** (`offering`) is a coherent unit of value intentionally made available to one or
more audiences. It may combine people, process, and software and is not
necessarily a commercial product or software boundary.

### Audience

<a id="term-audience"></a>
**Audience** (`audience`) is a durable group for whom an offering, need, value claim, or
interaction is consequential. An Audience is not a named person or a research
persona, and roles such as user, operator, sponsor, or beneficiary remain
contextual.

### Need

<a id="term-need"></a>
**Need** (`need`) is a solution-independent problem, constraint, opportunity, or desired
outcome that matters to an audience in particular circumstances. A Need
explains why change may matter without prescribing a response.

### Job to Be Done

<a id="term-job-to-be-done"></a>
**Job to Be Done** (`job-to-be-done`) describes progress that an audience seeks in particular
circumstances without assuming the product, service, process, feature, or
software structure that will enable it.

### Value Proposition

<a id="term-value-proposition"></a>
**Value Proposition** (`value-proposition`) is a scoped promise that an Offering will create a
recognizable benefit for an Audience by addressing a Need or Job to Be Done. It
is not proof that the promised outcome occurred.

### Use Case

<a id="term-use-case"></a>
**Use Case** (`use-case`) is an intent-bearing description of how a primary actor interacts
with a subject to achieve a goal, including the successful outcome and material
alternative or failure paths.

These concepts are complementary views of Intent, not stages in a required
hierarchy. Any may provide source or context for Requirements. None is itself
a normative Requirement or an eligible Requirement subject.

### Domain

<a id="term-subdomain"></a>
**Subdomain** (`subdomain`) is a cohesive part of the problem domain, classified as core,
supporting, or generic according to its strategic role. It describes problem
space and does not prescribe software or organizational structure.

## Architecture

Architecture supplies the durable shape and human-governed contract
that constrains Compilation within the Gen Stack. It defines accepted
subjects, responsibilities, boundaries, relationships, decisions, and
structural responses and supplies eligible subjects for Requirements while
preserving the distinct authority of each. The application profile separately
owns physical colocation.

Intent shapes both Architecture and Requirements. Their development is
co-evolutionary rather than sequential: candidate Architecture provides the
subjects, boundaries, responsibilities, and response hypotheses needed to
discover and place obligations; candidate Requirements test, constrain, and
refine that shape; and scenarios, models, prototypes, and evaluation design
may expose gaps in either. Once accepted, Architecture owns the subject and
response meaning while each Requirement remains the sole local authority for
its obligation. Separate authority does not imply independent development or
that either representation must be completed first.

The preferred term **Architecture** has the stable identifier `architecture`.

### Requirements

<a id="term-requirement"></a>
**Requirement** (`requirement`) is the canonical local record of one obligation
that is active or was accepted and has since been retired, arising from Intent
or another recognized source and assigned to exactly one eligible Architecture
subject. While active, it is the sole local normative authority for what that
subject must do, achieve, preserve, prevent, or constrain. Retirement ends that
normative force without deleting or reusing its identity, expression, subject,
lineage, or Provenance. Requirements remain distinct from the Intent or
authority that motivates them and the Evaluations that assess them.

Requirement development is architecture-informed. The current candidate or
accepted Architecture supplies the subject, abstraction level, boundaries,
interactions, and feasibility context needed to formulate and evaluate the
obligation. A candidate Requirement may in turn expose a missing subject or
force the Architecture to change. This iteration does not transfer normative
authority: Architecture owns the subject and response, and an active
Requirement owns the accepted obligation.

**Requirement expression** (`requirement-expression`) is the content within a
canonical Requirement that conveys its one active or formerly accepted
obligation. It has normative force only while the Requirement is active. It may
use one or more textual, tabular, model-based, formal, or referenced
representations when their roles and precedence are explicit.

**Requirement specification method** (`requirement-specification-method`) is a
constructive approach used to express or analyze a Requirement or requirement
set. A method contributes precision or insight; it does not determine
acceptance, requirement type, authority, or satisfaction, and the documented
portfolio is not an allowlist.

**Normative reference** (`normative-reference`) is an identified external or
separately maintained specification whose stated provisions are incorporated
into a Requirement. The reference owns the incorporated definitions and
conformance semantics; the Requirement owns the local decision and scope of
adoption.

#### Requirement lifecycle and change

**Requirement lifecycle state** (`requirement-lifecycle-state`) identifies
whether a canonical Requirement is `active` or `retired`. `active` means its
accepted obligation currently has normative force. `retired` means an accepted
decision ended that force while preserving the Requirement as a durable
historical record. Lifecycle state is not a candidate's meaning maturity, the
OKF document `status`, Implementation state, Evaluation coverage, or evidence
of satisfaction.

**Requirement change** (`requirement-change`) is an evidence-linked proposed or
accepted transition that adds, revises, or retires one or more Requirements.
A work item may specify the change for decision and coordination, but it does
not become the normative authority for an accepted obligation.

**Requirement addition** (`requirement-addition`) introduces one independently
managed obligation with no predecessor identity. A candidate addition receives
no canonical Requirement identifier until the obligation and its subject are
accepted and admitted.

**Requirement revision** (`requirement-revision`) changes the source, subject,
condition, bound, outcome, applicability, normative reference, or other
material meaning of one Requirement while an authorized identity decision
preserves its identifier. A wording, metadata, link, or placement correction
that demonstrably preserves normative meaning is representation maintenance,
not a Requirement revision.

**Requirement retirement** (`requirement-retirement`) changes an active
Requirement to retired and ends its normative force without deleting its
record or reusing its identifier. A retirement may have no successor.

**Requirement replacement** (`requirement-replacement`) is the coordinated
retirement of one or more predecessor Requirements and addition of one or more
successor Requirements. One-to-many replacement is a **split** and many-to-one
replacement is a **merge**. These patterns create new successor identifiers,
retain every predecessor, and do not imply that predecessor and successor
expressions are equivalent or that evidence transfers between them.

#### Requirement types

The six classifications are mutually exclusive for one Requirement. Choose the
classification from the obligation's primary accepted meaning; representation
values belong to the application profile.

<a id="term-functional-requirement"></a>
**Functional Requirement** (`functional-requirement`) defines required behavior, information, transformation, state
transition, response, preservation, or service.

<a id="term-quality-requirement"></a>
**Quality Requirement** (`quality-requirement`)
defines a required degree or assessable condition of system, product, service,
use, or data quality provided by the obligated subject.

<a id="term-process-requirement"></a>
**Process Requirement** (`process-requirement`)
defines an obligation on an accepted lifecycle, development, operational, or
governance process.

<a id="term-human-factors-requirement"></a>
**Human-Factors Requirement** (`human-factors-requirement`) defines an obligation arising from human capabilities,
limitations, safety, workload, cognition, health, or environment.

<a id="term-usability-requirement"></a>
**Usability Requirement** (`usability-requirement`)
defines an interaction-quality obligation concerned with effective, efficient,
learnable, or satisfying use in a stated context.

<a id="term-constraint-requirement"></a>
**Constraint Requirement** (`constraint-requirement`) defines a binding limitation on the permitted design,
implementation, technology, interface, law, policy, or operating conditions.

Eligible Requirement subjects are System, Capability, Feature, Surface,
Bounded Context, C4 Software System, C4 Container, and C4 Component. Intent
concepts—including Offering, Audience, Need, Job to Be Done, Value Proposition,
Use Case, and Subdomain—may provide source or context but never own
Requirements. Other governed concepts may provide decision or view meaning
without becoming subjects. The application profile owns how this subject
relationship is represented and colocated in an instantiated corpus.

### Decisions

<a id="term-architecture-decision-record"></a>
**Architecture Decision Record** (`architecture-decision-record`) records one
accepted, durable architecture choice together with its context, rationale,
material alternatives, consequences, and supersession or reconsideration
conditions. A proposal or unresolved option is not an Architecture Decision
Record.

### Capabilities and behavior

<a id="term-capability"></a>
**Capability** (`capability`) is an outcome-oriented ability of an identified organization,
system, or subsystem at a declared level, independent of the processes,
people, or technology that realize it.

<a id="term-feature"></a>
**Feature** (`feature`) is independently recognizable behavior with an intended outcome,
actors and conditions, and durable identity across one or more Use Cases or
Surfaces. A Feature is not a delivery epic or test suite.

<a id="term-surface"></a>
**Surface** (`surface`) is an actor-facing encounter point with identified actors, an
interaction boundary, recognizable behavior, and material exclusions.
Surfaces may contain narrower Surfaces when each has independent durable
identity, such as CLI → command → subcommand or web application → page. This
hierarchy models interaction, not C4 containment. A Surface may be realized by
one or more C4 elements, and one C4 element may support multiple Surfaces.

### Domain model boundaries

<a id="term-bounded-context"></a>
**Bounded Context** (`bounded-context`) is the boundary within which a particular domain model and
its ubiquitous language apply consistently and have defined authority. It is
not automatically a service, deployment, repository, team, or database.

<a id="term-context-map"></a>
**Context Map** (`context-map`) is a directional relationship view of Bounded Contexts that
makes their dependencies, translation boundaries, coordination choices, and
consequences explicit. It is more than a diagram of boxes and untyped lines.

### C4

<a id="term-c4-software-system"></a>
**C4 Software System** (`c4-software-system`) is a software boundary that delivers value and has
responsibilities, direct interactors, and consequential relationships.

<a id="term-c4-container"></a>
**C4 Container** (`c4-container`) is an application or data-store runtime boundary contained by
exactly one C4 Software System. Containers do not contain other containers.

<a id="term-c4-component"></a>
**C4 Component** (`c4-component`) is a cohesive responsibility with defined interfaces and
dependencies inside exactly one C4 Container. Components do not recursively
contain other components.

<a id="term-c4-view"></a>
**C4 View** (`c4-view`) is a projection of canonical C4 elements that answers one
architecture question.

The root System remains distinct from a C4 Software System, and C4 Views do not
become canonical structural elements merely by projecting them.

## Change design

**Change Design** (`change-design`) is a bounded technical response formed
while deciding how to realize a software change within applicable Requirements
and Architecture. It makes the material choices, rationale, tradeoffs,
affected responsibilities and interactions, interfaces, state and data
behavior, failure handling, risks, verification approach, and unresolved
questions explicit at the granularity the change requires.

A Change Design is not necessarily a document. It may exist only in a design
conversation, be captured in a Work item, or exceptionally be maintained as a
dedicated repository concept under an established lifecycle. Its container,
detail, or implementation status does not confer authority. Requirements own
accepted obligations; Architecture owns durable response meaning; Architecture
Decision Records own accepted durable choices that need an independent
lifecycle; Work items own delivery state; Implementation owns current realized
state; and Evaluations own assessment and evidence.

The Gen Stack application profile does not govern Change Design as a concept
type or require a `design/` collection in an instantiated system corpus.

Change Design may reveal candidate Requirements or proposed Architecture
changes, but it does not accept them. It guides a bounded Decision and Action
without becoming another required authority layer in the Gen Stack. See
[Change Design](design/change-design.md) for the full boundary and [Developing
a Change Design](design/developing-a-change-design.md) for the proportional
workflow and capture choices.

Designing commonly occurs during Orient, a Decision may select the response,
and Action may realize and test it. This sequence does not make every design
conversation a maintained Orientation, Decision record, Work item, or corpus
concept.

## Specifications

**Specification** (`specification`) is a bounded, named composition of Gen
Stack representations assembled to guide, coordinate, and assess the
realization of a system or change. Depending on its scope, a Specification may
contain or reference source context and Intent, Observations, applicable or
candidate Requirements, Architecture and decisions, Change Design,
verification context, and Work items.

Specification is a composition role, not another semantic authority. Each
constituent retains its canonical meaning, owner, maturity, and lifecycle, and
the Specification's container does not make every included claim normative or
accepted. In ordinary shorthand, Implementation may be said to realize a
Specification. More precisely, Implementation realizes the applicable
Requirements, Architecture, and selected Change Design; Work items coordinate
delivery, while Evaluations assess the realized state.

**Specification constituent** (`specification-constituent`) is a
representation included in or referenced by a Specification for the distinct
role it already owns. Inclusion does not copy or transfer that authority.

**Specification container** (`specification-container`) is the conversation,
work item, document, directory, or linked set through which the composition is
presented and navigated. A container may hold several constituent kinds, but
it is not their common authority or necessarily their canonical home.

The capitalized preferred term **Specification** names this Gen Stack
composition role. A repository or external practice may use the generic word
*specification* for one authoritative contract, a temporary proposal, a
historical design record, or a generator input. Determine that artifact's
local authority and change-flow model rather than importing it from the name.
A repository may make a Specification container historical, maintained, or an
executable source without making every constituent normative or collapsing
their Gen Stack roles.

Gen Stack does not use **functional specification** or **technical
specification** as preferred authority terms. In a locally named functional
specification, accepted behavioral obligations remain Requirements and
problem or outcome context remains Intent. In a technical specification, the
bounded response remains Change Design, durable accepted meaning remains
Architecture, and a mixed container may act as a Specification. Classify the
claims rather than inferring meaning from either document label.

**Change Specification** (`change-specification`) is a Specification scoped to
a bounded proposed or authorized change to the System or its Architecture. It
may compose motivating Signals, Observations, source context and Intent,
applicable or candidate Requirements, affected Architecture and decisions,
Change Design, verification context, and implementation coordination. A candidate change
must have a recognizable affected context, intended outcome, material
exclusions, and current decision state; an unbounded request remains a Signal
or source record rather than becoming a Change Specification. The name does
not accept a proposed Requirement or Architecture change, authorize delivery,
or make the Specification the common authority for its constituents.

**Bugfix Specification** (`bugfix-specification`) is a Change Specification
scoped to an authorized corrective change responding to one or more Bugs. It
may coordinate changes intended to correct or compensate for one or more
related Defects across the work products that describe, govern, realize, or
evaluate the system. The identified Bugs anchor its corrective purpose; the
related Defects describe its potentially cross-stack scope. It links the
Defect reports that preserve originating Signals and Provenance and may
compose a Bug and diagnosis synopsis, established related Defects and
remaining hypotheses, the correction decision and authority, applicable or
candidate Requirements, affected Architecture, unchanged constraints, Change
Design, verification and evaluation context, and implementation coordination. It is a
separate artifact, never a retitled Defect report. The name does not accept a
proposed Requirement or Architecture change or prove that a Bug or related
Defect has been corrected or verified.

Change Specification and Bugfix Specification are work-item composition roles,
not governed concept types, mandatory templates, or required repository
documents. A work item may serve as their Specification container, and a
bounded Specification may exist only in a conversation. Completeness is judged
against the stated scope and next authorized action, not against a universal
inventory of constituent kinds. The Gen Stack application profile does not
require a Specification concept or collection in an instantiated system
corpus.

## Evaluations

<a id="term-evaluation"></a>
**Evaluation** (`evaluation`) is a criterion-referenced assessment of an
identified realized subject under stated conditions that produces evidence
for a bounded purpose.[^iso-25040] It may use automated or human-performed
testing, analysis, inspection, review, simulation, measurement, study, or
continuous operational assessment. An Evaluation that claims satisfaction of
an accepted obligation references the applicable Requirement; no method,
passing result, or observed baseline owns or rewrites that obligation.

<a id="term-evaluation-definition"></a>
**Evaluation Protocol** (`evaluation-definition`) is the durable assessment
contract that owns one bounded claim, its primary role, criteria authority,
assessment method, cases or sampling strategy, oracle or judgment procedure,
thresholds, material conditions, and evidence lifecycle. The stable identifier
is retained from the former preferred label *Evaluation Definition* because
the meaning is continuous. A Protocol may intentionally repeat an authoritative
predicate so that it can be assessed, but it does not become the Requirement,
Architecture, or Implementation authority it evaluates.

<a id="term-evaluation-role"></a>
**Evaluation Protocol Role** (`evaluation-role`) classifies the primary claim
made by an Evaluation Protocol:

- `requirement-satisfaction` asks whether a realized subject satisfies one or
  more identified active Requirements;
- `architecture-realization` asks whether Implementation realizes one or more
  accepted Architecture authorities; and
- `implementation-conformance` asks whether an Implementation Unit conforms to
  one or more repository-local implementation contracts or invariants.

One Protocol has exactly one primary role even when its evidence informs
several views. The roles distinguish the authority of the claim, not the test
technology, suite directory, or execution mechanism.

<a id="term-evaluation-case"></a>
**Evaluation Case** (`evaluation-case`) is one Protocol-scoped example,
scenario, property, sample, or review instance used to exercise the Protocol's
claim and judgment procedure. It inherits the Protocol's role and criteria
authority. A Case that needs an independent claim, lifecycle, outcome, or
reporting identity should instead become its own Evaluation Protocol.

<a id="term-evaluation-protocol-coverage"></a>
**Evaluation Protocol Coverage** (`evaluation-protocol-coverage`) is the
relationship between an in-scope Requirement, Architecture authority, or
Implementation Unit and the existence of an applicable maintained Evaluation
Protocol. Coverage is `defined` or `uncovered` for a declared scope and time;
it says neither that evidence is current nor that the subject passes. Mere
eligibility for evaluation or appearance in a policy-neutral candidate
projection does not establish that the target is in scope, that coverage is
required, or that a matching Protocol is adequate.

<a id="term-evaluation-suite"></a>
**Evaluation Suite** (`evaluation-suite`) is a named repository-native grouping
of Evaluation Protocols or their Cases for execution, maintenance, or
reporting. A Suite does not own their criteria, need not mirror an Architecture
hierarchy, and may span subjects or roles. Its physical organization may mirror
the governed Protocol hierarchy when that improves maintainability.

<a id="term-evaluation-execution"></a>
**Evaluation Execution** (`evaluation-execution`) is one bounded application
of an exact Evaluation Protocol revision. It binds the Protocol and selected
Cases or sample to identified inputs or observations, environment and
configuration, Implementation revision, evaluator or harness, and either an
attempt or a declared observation window.

<a id="term-evaluation-result"></a>
**Evaluation Result** (`evaluation-result`) records the observations,
measurements, ratings, and assertion or judgment outcomes produced by an
Evaluation Execution. It provides evidence no stronger than the bounded
Execution and its criteria establish; it is not a governance decision or a
change to Intent.

<a id="term-evaluation-report"></a>
**Evaluation Report** (`evaluation-report`) is a traceable projection or
aggregation of Evaluation Results for a declared audience, scope, filter, and
time. It preserves links to the underlying Executions and Protocols and keeps
Protocol Coverage (`uncovered` or `defined`), evidence state (`absent`,
`stale`, `current`, `skipped`, or `harness-error`), and bounded outcome
(`pass`, `fail`, or `unknown`) separate. Requirement satisfaction,
Architecture realization, and Implementation conformance are logically
separate report projections even when one physical report renders all three.
It is not itself an Evaluation Result, a Requirement authority, or an assurance
decision.

Testing is an Evaluation method, not a synonym for
Evaluation.[^iso-29119-series] Telemetry can supply Observations, but
collection alone does not make it an Evaluation; an Evaluation Protocol must
supply criteria, method, conditions, and a bounded observation window. See
[Evaluation as bounded
evidence](evaluations/evaluation-as-bounded-evidence.md) for the distinctions
among methods, boundaries, lifetimes, provenance, assurance, and
decisions.[^fowler-evaluations]

## Implementation

**Implementation** (`implementation`) is the current realization of the system in code, schemas,
configuration, prompts, workflow definitions, build and deployment
definitions, and other machine-consumed artifacts. It owns what exists now; it
does not establish what shall exist or why the architecture was chosen.

<a id="term-implementation-unit"></a>
**Implementation Unit** (`implementation-unit`) is a named, mechanically resolvable part of the
Implementation treated as one coherent scope for generation, change,
replacement, deletion, provenance, or implementation-local testing. It may be
a file, module, package, schema, configuration set, service codebase, or
deployable artifact. An Implementation Unit may realize all or part of one or
more architecture concepts or Requirements and need not coincide one-to-one
with a C4 element. It is a current realization boundary, not an architecture
subject, and does not own Requirements.

**Implementation revision** (`implementation-revision`) is one identified
state of the Implementation to which an Evaluation Execution or other evidence
can be bound without generalizing the result to a different state.

## Gen Stack

**Gen Stack** (`gen-stack`) is the software-change method that distinguishes
Signals, Observations, Intent, Architecture, canonical Requirements,
Compilation, Implementation, Evaluations, and operational learning while OODA
governs adaptation across them. Intent shapes co-developed Architecture and
Requirements: Architecture owns durable subjects and responses, while
Requirements own accepted obligations on those subjects. Change Design
supplies proportional technical reasoning for a bounded response, while
Specifications compose the representations relevant to a bounded system or
change. Neither becomes another required authority layer.

**Process** (`process`) is a reusable, bounded description of coordinated human and
automated work that begins in response to one or more events, transforms
information or state through activities, and ends in an intended outcome that
creates or preserves value for identified stakeholders. A Process definition
does not become binding merely because it is documented; its normative
authority must come from identified Requirements, policies, standards, or
other recognized authorities.[^process]

**Process enactment** (`process-enactment`) is one performance of a Process for particular events,
inputs, participants, resources, and conditions. An enactment may involve
several work items, and one work item may participate in several Processes.

**Work item** (`work-item`) is a durable case record that preserves lifecycle
state, evidence, decisions, authority, and relationships. The Gen Stack
software work-item taxonomy contains exactly four first-class roles:
**Operational Incident Record**, **Defect Report**, **Change Specification**,
and **Bugfix Specification**. No other Gen Stack concept is a software
work-item role.

Investigation is uncertainty-reduction activity during Orientation or within
the lifecycle of one of those roles, not a Gen Stack work-item type or
separately prescribed artifact. Delivery is implementation activity and
lifecycle context coordinated by a Change Specification or Bugfix
Specification, not an independent work-item concept. Tasks, stories, epics,
and similar planning records are host-native mechanics outside this taxonomy.
A work-item title and summary are a derived projection of an existing item,
not another role.

A Work item may support or be governed by a Process but is not the Process
itself.

**OODA control loop** (`ooda-control-loop`) is the adaptive process through which the Gen Stack
Observes Signals and Observations, Orients across its authorities and evidence,
Decides on an authorized repair hypothesis, and Acts to test it. OODA governs
learning and change across the stack; its activities are not additional
artifact layers.[^boyd-ooda]

**Observe** (`observe`) receives Signals and records contextual Observations without
turning them into desired state.

**Orient** (`orient`) interprets Observations using Intent, Requirements, Architecture,
Implementation, Evaluations, operational context, prior experience, and
Provenance. Orientation is an activity, not a maintained authority or synonym
for Intent.

**Orientation** (`orientation`) is one bounded, evidence-linked interpretation
formed through Orient. It frames candidate Decisions without authorizing one.

**Decide** (`decide`) selects an authorized hypothesis about what to preserve,
investigate, or change. A Decision is not necessarily an Architecture Decision
Record and does not confer authority on its maker.

**Decision** (`decision`) is the hypothesis selected through Decide within the
applicable human or institutional authority.

**Act** (`act`) applies the bounded Decision as a test, producing further Observations.
An Action may investigate, change an authority, run Compilation, modify
Implementation, execute an Evaluation, deploy, or roll back.

**Action** (`action`) is one bounded application of a Decision through Act. It
tests the Decision and may produce new Observations.

**Compilation** (`compilation`) is the constrained transformation of accepted
Architecture and Requirements into Implementation Units. Intent shapes both
authorities but is not a direct Compilation input. Generated Implementation
Units must conform to the accepted Architecture and Requirements, while the
Implementation is the materialized output.

**Provenance** (`provenance`) preserves the lineage of decisions, constraints, incidents,
rejected alternatives, and generated artifacts.

**Pace layer** (`pace-layer`) is a decision-relative grouping of authorities,
artifacts, or assets whose acceptable rate of change is similar because their
consequences, evidence needs, and recovery costs are similar. It is not a
required physical layer or fixed hierarchy. Requirements, public contracts,
persistent data, and conservation boundaries commonly demand slower change
than bounded Implementation Units. Similar pace does not imply shared
ownership or authority. See [OODA as the Gen Stack control
loop](control-loop/ooda-control-loop.md#run-loops-at-the-pace-of-the-affected-authority).

**Trust gradient** (`trust-gradient`) is the deliberate scaling of the authority
granted to an Action and its blast radius to confidence established by
evidence. Lower confidence, greater consequence, or proximity to a slower Pace
layer calls for stronger constraints, containment, observability,
reversibility, independent evaluation, and review. A Trust gradient does not
assign permanent trust to a person, model, generator, evaluator, tool, or
implementation path, and confidence does not confer decision authority. See
[Bounded regeneration](implementation/bounded-regeneration.md).

**Deletion** (`deletion`) makes it safe to remove or replace Implementation Units without
breaking hidden dependencies.

**Compaction** (`compaction`) keeps regeneration from accumulating complexity.

## Relationship model

A relationship is stated canonically as *subject — relationship → object*.
Its inverse is a derived reading of the same fact, not a second independently
maintained assertion. An applicable profile, guide, or peer authority chooses
the representation and canonical recording location; inverse navigation and
backlinks may be generated from that one assertion. This provides bidirectional
navigability without bidirectional authority.

An applicable profile may materialize both readable endpoint roles in durable
metadata for local discovery. When it does, one designated assertion source
remains authoritative and the reciprocal metadata is a mechanically checked
projection of that assertion. The two endpoint views do not become independent
facts merely because both are stored.

Each relationship row has one stable identifier even when different rows use
the same natural-language verb. The domain and range state which preferred
terms may occupy the subject and object positions; they do not create a class
hierarchy.

Cardinalities describe permitted semantic multiplicity: `1` means exactly
one, `0..1` means optional one, `1..*` means one or more, and `0..*` means
optional many. They do not require optional relationships to be documented
when the relationship is inconsequential. This model does not introduce fields,
paths, or relationship frontmatter; the Gen Stack application profile owns the
encodings it governs.

### Collective ranges

The relationship tables use these controlled collective terms:

- **Intent concept** (`intent-concept`) means an Offering, Audience, Need, Job
  to Be Done, Value Proposition, Use Case, or Subdomain.
- **Requirement source** (`requirement-source`) means a maintained
  non-Requirement concept or external authority that explains an obligation's
  origin. It may be an Intent concept, governance concept, accepted
  Architecture concept or decision, responsibility analysis, policy, standard,
  or other recognized source; it motivates without owning the Requirement. A
  source is not automatically a normative reference; only explicitly
  incorporated provisions contribute normative meaning.
- **Architecture concept** (`architecture-concept`) means a maintained System,
  Architecture Decision Record, Capability, Feature, Surface, Bounded Context,
  Context Map, C4 Software System, C4 Container, C4 Component, or C4 View.
- **Eligible Architecture subject** (`eligible-architecture-subject`) means a
  System, Capability, Feature, Surface, Bounded Context, C4 Software System, C4
  Container, or C4 Component that may own Requirements under the profile.
- <a id="term-architecture-realization-authority"></a>**Architecture realization authority** (`architecture-realization-authority`)
  means a System, Architecture Decision Record, Capability, Feature, Surface,
  Bounded Context, Context Map, C4 Software System, C4 Container, or C4
  Component whose accepted meaning may be evaluated for realization by
  Implementation. A C4 View is excluded because it projects canonical elements
  rather than owning the realized structure it depicts.
- **C4 element** (`c4-element`) means a C4 Software System, C4 Container, or C4
  Component. A C4 View is a projection, not an element.
- **Gen Stack authority or activity** (`gen-stack-authority-or-activity`)
  means any maintained authority or bounded activity in the method that a
  Signal can implicate without diagnosing it.

### Authority, realization, and evidence

| ID | Domain → range | Canonical reading | Derived inverse reading | Cardinality | Meaning and prohibited inference |
| --- | --- | --- | --- | --- | --- |
| <a id="relationship-requirement-source-is-source-of-requirement"></a>`requirement-source-is-source-of-requirement` | Requirement source → Requirement | **is source of** | **originates from** | `0..*` ↔ `0..*` | The source explains why the obligation exists; the Requirement canonically expresses the accepted obligation without transferring normative authority to the source. |
| <a id="relationship-requirement-is-derived-from-requirement"></a>`requirement-is-derived-from-requirement` | Requirement → Requirement | **is derived from** | **is parent of** | `0..*` ↔ `0..*`, acyclic | The child obligation follows from a maintained parent; derivation does not make the statements interchangeable. |
| <a id="relationship-requirement-supersedes-requirement"></a>`requirement-supersedes-requirement` | Requirement → Requirement | **supersedes** | **is superseded by** | `0..*` ↔ `0..*`, acyclic | An accepted successor takes the place of all or part of a retired predecessor's normative role. The relationship preserves replacement, split, and merge lineage; it does not imply equivalence, derivation, current satisfaction, or transfer of Evaluation evidence. |
| <a id="relationship-requirement-has-subject"></a>`requirement-has-subject` | Requirement → eligible Architecture subject | **has subject** | **is subject of** | Requirement → `1`; subject → `0..*` | The Architecture subject is the thing obligated and fixes the obligation's bearer and abstraction level. Selecting it is architectural judgment and may iterate with Requirement development. The relationship implies neither temporal order nor transfer of normative authority: Intent concepts cannot be subjects, Architecture owns the subject and response, and the Requirement owns its active or formerly accepted obligation. |
| <a id="relationship-requirement-incorporates-normative-reference"></a>`requirement-incorporates-normative-reference` | Requirement → Normative reference | **incorporates** | **is incorporated by** | Requirement → `0..*`; reference → `0..*` | The reference owns incorporated definitions and conformance semantics; the Requirement owns local adoption, scope, exceptions, and lifecycle policy. |
| <a id="relationship-adr-responds-to-requirement"></a>`adr-responds-to-requirement` | Architecture Decision Record → Requirement | **responds to** | **is addressed by** | `0..*` ↔ `0..*` | The decision explains an accepted architectural response; it does not replace or redefine the obligation. |
| <a id="relationship-architecture-constrains-compilation"></a>`architecture-constrains-compilation` | Architecture concept → Compilation | **constrains** | **is constrained by** | Compilation → `1..*` Architecture concepts; concept → `0..*` Compilations | Architecture supplies the accepted contract; it is not output produced by Compilation, and raw Intent does not bypass Requirements as a direct input. |
| <a id="relationship-compilation-produces-implementation-unit"></a>`compilation-produces-implementation-unit` | Compilation → Implementation Unit | **produces** | **is produced by** | One bounded Compilation → `1..*` Units; a Unit may be regenerated many times | The produced Units collectively update the Implementation; Compilation does not decide or rewrite its accepted inputs. |
| <a id="relationship-implementation-unit-realizes-authority"></a>`implementation-unit-realizes-authority` | Implementation Unit → Architecture concept or Requirement | **realizes** | **is realized by** | `0..*` ↔ `0..*` | The link states the current realization; implementation does not establish what shall exist. |
| <a id="relationship-evaluation-definition-evaluates-requirement"></a>`evaluation-definition-evaluates-requirement` | Evaluation Protocol → Requirement | **evaluates satisfaction of** | **has satisfaction evaluated by** | Role `requirement-satisfaction`: Protocol → `1..*` active Requirements; Requirement → `0..*` Protocols. Other roles: Protocol → `0` Requirements. | The Protocol derives the realized Architecture subject from each Requirement's canonical `subject`; it does not duplicate or override that subject link or own the obligation. Prefer one Requirement per Protocol when that yields a clearer claim and lifecycle. |
| <a id="relationship-evaluation-definition-evaluates-architecture-realization"></a>`evaluation-definition-evaluates-architecture-realization` | Evaluation Protocol → Architecture realization authority | **evaluates realization of** | **has realization evaluated by** | Role `architecture-realization`: Protocol → `1..*` authorities; authority → `0..*` Protocols. Other roles: Protocol → `0` authorities. | The Protocol assesses whether Implementation realizes accepted Architecture meaning; it does not make the evaluator or current structure authoritative for Architecture. A C4 View is never a target. |
| <a id="relationship-evaluation-protocol-evaluates-implementation-conformance"></a>`evaluation-protocol-evaluates-implementation-conformance` | Evaluation Protocol → Implementation Unit | **evaluates conformance of** | **has conformance evaluated by** | Role `implementation-conformance`: Protocol → `1..*` Units; Unit → `0..*` Protocols. Other roles: Protocol → `0` Units. | The Protocol evaluates a repository-local implementation contract or invariant without promoting that contract into Architecture or a Requirement. |
| <a id="relationship-evaluation-protocol-defines-case"></a>`evaluation-protocol-defines-case` | Evaluation Protocol → Evaluation Case | **defines** | **is defined by** | Protocol → `0..*` Cases; Case → `1` Protocol | A Case inherits its Protocol's role and criteria authority; it does not establish independent coverage or an independently reportable claim. |
| <a id="relationship-evaluation-suite-groups-definition"></a>`evaluation-suite-groups-definition` | Evaluation Suite → Evaluation Protocol | **groups** | **is grouped in** | `0..*` ↔ `0..*` | Grouping supports execution and maintenance; it does not transfer criteria authority or imply Architecture containment. The stable identifier retains the former label while the preferred target term is Protocol. |
| <a id="relationship-evaluation-execution-applies-definition"></a>`evaluation-execution-applies-definition` | Evaluation Execution → Evaluation Protocol | **applies** | **is applied by** | Execution → `1` Protocol revision; Protocol → `0..*` Executions | The Execution uses one exact assessment contract revision; it does not alter that Protocol. The stable identifier retains the former label while the preferred target term is Protocol. |
| <a id="relationship-evaluation-execution-assesses-implementation"></a>`evaluation-execution-assesses-implementation` | Evaluation Execution → Implementation revision | **assesses** | **is assessed in** | Execution → `1` revision; revision → `0..*` Executions | The Execution binds one realized state, inputs or observations, evaluator, environment, and attempt or observation window; its evidence does not automatically generalize to another state. |
| <a id="relationship-evaluation-execution-produces-result"></a>`evaluation-execution-produces-result` | Evaluation Execution → Evaluation Result | **produces** | **is produced by** | `1` ↔ `1` | The Result records that Execution's observations, measurements, ratings, and assertion or judgment outcomes; it is not a governance decision. |
| <a id="relationship-evaluation-result-evidences-requirement"></a>`evaluation-result-evidences-requirement` | Evaluation Result → Requirement | **provides evidence for** | **has evidence from** | `0..*` ↔ `0..*` | The evidence supports only the bounded claim established by the Execution and its criteria; it does not rewrite desired state. |
| <a id="relationship-evaluation-result-evidences-architecture-realization"></a>`evaluation-result-evidences-architecture-realization` | Evaluation Result → Architecture realization authority | **provides realization evidence for** | **has realization evidence from** | `0..*` ↔ `0..*` | Evidence is bounded to the applied Protocol, realized revision, conditions, and observation window; it neither changes Architecture nor proves assurance. |
| <a id="relationship-evaluation-result-evidences-implementation-conformance"></a>`evaluation-result-evidences-implementation-conformance` | Evaluation Result → Implementation Unit | **provides conformance evidence for** | **has conformance evidence from** | `0..*` ↔ `0..*` | Evidence is bounded to the evaluated Unit and revision; a local pass does not establish Requirement satisfaction or Architecture realization. |
| <a id="relationship-evaluation-report-projects-result"></a>`evaluation-report-projects-result` | Evaluation Report → Evaluation Result | **projects** | **appears in** | Report → `0..*` Results; Result → `0..*` Reports | The Report is a navigational or decision-support view; aggregation does not create a stronger Result or an assurance decision. |

### Control and learning

| ID | Domain → range | Canonical reading | Derived inverse reading | Cardinality | Meaning and prohibited inference |
| --- | --- | --- | --- | --- | --- |
| <a id="relationship-signal-draws-attention-to"></a>`signal-draws-attention-to` | Signal → Gen Stack authority or activity | **draws attention to** | **is implicated by** | Signal → `0..*` candidates; candidate → `0..*` Signals | The relationship identifies a bounded area requiring Orientation when one is known; it does not establish the cause, desired state, or required change. |
| <a id="relationship-observation-informs-orientation"></a>`observation-informs-orientation` | Observation → Orientation | **informs** | **considers** | `0..*` ↔ `0..*` | Evidence contributes to interpretation but does not determine the conclusion by itself. |
| <a id="relationship-orientation-frames-decision"></a>`orientation-frames-decision` | Orientation → Decision | **frames** | **is framed by** | Orientation → `0..*` Decisions; Decision → `1` recorded Orientation | Orientation identifies plausible explanations and consequences; it does not supply authority to select one. |
| <a id="relationship-decision-selects-action"></a>`decision-selects-action` | Decision → Action | **selects** | **tests** | Decision → `0..*` Actions; Action → `1` Decision | The Decision is a hypothesis tested through bounded Action; selection must remain within the applicable authority. |
| <a id="relationship-action-produces-observation"></a>`action-produces-observation` | Action → Observation | **produces** | **results from** | Action → `0..*` Observations; Observation → `0..1` initiating Action | The Observation returns to the next Orientation and may support, contradict, or leave the hypothesis unknown; it is not automatic approval. |

### Intent and Architecture views

These relationships connect complementary views; they do not place every
concept in one hierarchy.

| ID | Domain → range | Canonical reading | Derived inverse reading | Cardinality | Meaning and prohibited inference |
| --- | --- | --- | --- | --- | --- |
| <a id="relationship-offering-depends-on-capability"></a>`offering-depends-on-capability` | Offering → Capability | **depends on** | **supports** | `0..*` ↔ `0..*` | The offering requires the bearer's ability; an Offering is not itself a Capability. |
| <a id="relationship-use-case-exercises-capability"></a>`use-case-exercises-capability` | Use Case → Capability | **exercises** | **is exercised by** | `0..*` ↔ `0..*` | The subject invokes an ability while pursuing an actor goal; the Use Case is not the ability. |
| <a id="relationship-feature-enables-use-case"></a>`feature-enables-use-case` | Feature → Use Case | **enables** | **is enabled by** | `0..*` ↔ `0..*` | Recognizable behavior contributes to an actor goal; neither concept contains the other. |
| <a id="relationship-feature-contributes-to-capability"></a>`feature-contributes-to-capability` | Feature → Capability | **contributes to** | **is supported by** | `0..*` ↔ `0..*` | Recognizable behavior helps provide an ability; the Capability may require behavior that is not a Feature. |
| <a id="relationship-feature-is-available-through-surface"></a>`feature-is-available-through-surface` | Feature → Surface | **is available through** | **exposes** | `0..*` ↔ `0..*` | The Surface is an encounter point for behavior, not the Feature's structural container. |
| <a id="relationship-architecture-view-is-realized-by-c4-element"></a>`architecture-view-is-realized-by-c4-element` | Capability, Feature, or Surface → C4 element | **is realized by** | **realizes** | `0..*` ↔ `0..*` | This maps architecture views; it does not make the concepts identical or add a C4 containment level. |
| <a id="relationship-bounded-context-models-subdomain"></a>`bounded-context-models-subdomain` | Bounded Context → Subdomain | **models** | **is modeled by** | `0..*` ↔ `0..*` | Model and problem-space boundaries may cross; folder ancestry does not prove a one-to-one mapping. |
| <a id="relationship-context-map-relates-context"></a>`context-map-relates-context` | Context Map → Bounded Context | **relates** | **participates in** | Map → `1..*` Contexts; Context → `0..*` Maps | The map owns its directional dependencies and translations; participation alone does not assert a dependency. |
| <a id="relationship-surface-contains-surface"></a>`surface-contains-surface` | Surface → Surface | **contains** | **is contained by** | Parent → `0..*`; child → `0..1` parent | This is interaction hierarchy, not C4 containment or implementation ownership. |
| <a id="relationship-c4-system-contains-container"></a>`c4-system-contains-container` | C4 Software System → C4 Container | **contains** | **belongs to** | System → `0..*`; Container → `1` System | This is C4 runtime containment; it does not imply offering, capability, domain, team, or repository containment. |
| <a id="relationship-c4-container-contains-component"></a>`c4-container-contains-component` | C4 Container → C4 Component | **contains** | **belongs to** | Container → `0..*`; Component → `1` Container | This is C4 responsibility containment; a Component is not independently deployable merely because it is named. |
| <a id="relationship-c4-view-projects-element"></a>`c4-view-projects-element` | C4 View → C4 element | **projects** | **appears in** | View → `1..*`; element → `0..*` Views | A projection selects canonical elements to answer a question; it does not create or own those elements. |

The two natural-language uses of **realizes** have different identifiers and
operate at different levels. `architecture-view-is-realized-by-c4-element`
maps complementary Architecture views;
`implementation-unit-realizes-authority` links current machine-consumed state
to accepted meaning. Neither relationship transfers semantic authority to the
realizing element.

[^boyd-ooda]: [John R. Boyd's OODA model](https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf)
    supplies the Observe, Orient, Decide-as-hypothesis, Act-as-test, and feedback
    semantics adapted here.
[^fowler-evaluations]: [Chad Fowler's “Evaluations Are the Real
    Codebase”](https://chadfowler.com/regenerative-software/3mb526js42k26/)
    distinguishes implementation-coupled, boundary-surviving, and live
    evaluations as evidence with different lifetimes and blind spots.
[^iso-25040]: [ISO/IEC 25040:2024](https://www.iso.org/standard/83467.html)
    provides a quality-evaluation framework for target entities while leaving
    specific test methods to other authorities.
[^iso-29119-series]: The official [ISO/IEC/IEEE 29119 series
    overview](https://committee.iso.org/sites/jtc1sc7/%68ome/projects/flagship-standards/isoiecieee-29119-series.html)
    distinguishes testing concepts, processes, documentation, design
    techniques, and static review.
[^process]: [Process](processes/process.md) owns the fuller definition
    and its boundaries from work items, workflows, procedures, practices,
    Capabilities, governing obligations, and OODA.
