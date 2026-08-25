---
type: Standard
title: Software architecture docs application profile for OKF v0.2
description: The application profile for representing a system, its accepted requirements, context, decisions, value, behavior, boundaries, and selected architecture views in OKF v0.2.
tags: [architecture, okf, application-profile, system, requirements, assurance, decisions, capabilities, surfaces, domain-driven-design, c4-model]
status: draft
sources:
  - id: okf-v0.2
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.2
  - id: dcmi-application-profile
    resource: https://www.dublincore.org/resources/glossary/application_profile/
    title: DCMI definition of an application profile
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO/IEC/IEEE 29148:2018 — Requirements engineering
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 — Product quality model
  - id: requirements-engineering
    resource: ../foundations/requirements-engineering.md
    title: Requirements engineering in software architecture
  - id: requirement-classification
    resource: ../foundations/requirement-classification.md
    title: Classifying requirements in software architecture
  - id: architecture-docs-organization
    resource: ../guides/organizing-an-architecture-docs-corpus.md
    title: Organizing an architecture docs corpus
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:47:49Z
---

# Software architecture docs application profile for OKF v0.2

## Profile identity

| Property | Value |
| --- | --- |
| Profile identity | `software-architecture-docs` |
| Profile version | `0.10.2` |
| Base specification | OKF v0.2 |
| Status | Draft |
| Applies to | The required system kernel and admitted concepts under `decisions/`, `value/`, `use-cases/`, `capabilities/`, `features/`, `surfaces/`, `domains/`, `structure/`, and subject-colocated `requirements/` collections |
| Audience | Architecture authors, requirements authors, maintainers, reviewers, and profile validators |

## Purpose and authority

This profile defines one coherent documentation model:

> architecture identifies the subjects and their shape; requirements state
> accepted obligations of those subjects; implementations realize them; and
> tests, evaluations, and operational evidence establish whether the realized
> system satisfies them.

The architecture corpus is the normative authority for admitted Requirement
concepts. It MUST NOT leave a second independently maintained normative
formulation in architecture prose, generated specifications, or another
Requirement-like artifact. Tests and evaluations MAY intentionally repeat a
Requirement predicate, including nearly identical wording, because they own an
assessment rather than the obligation. They SHOULD express readable scenarios
and MUST reference `requirement_id` when they claim to evaluate a maintained
Requirement. Generated specifications, coverage views, and test reports are
projections or evidence, not semantic authorities.

An accepted claim is a load-bearing obligation when it states what an eligible
subject must do, preserve, prevent, constrain, or achieve and the claim can be
accepted, changed, retired, or evaluated independently. Invariant,
prohibition, guarantee, boundary rule, required failure or recovery outcome,
and binding dependency direction describe obligation semantics; they are not
alternate profile concept types. Their sole normative formulation MUST be a
Requirement when accepted as an obligation in the governed scope. Requirement
admission does not depend on the predicate being difficult to infer from
implementation or evaluations: `implemented`, `passes`, and `observed` do not
establish `shall`. Architecture prose MAY explain
the relevant responsibility, authority, boundary, or structural response and
link the Requirement, but MUST NOT maintain a second binding formulation.

This ownership rule applies to obligations of the documented System and the
eligible architecture subjects below. The profile's own conformance rules and
the required kernel's corpus-governance contracts remain normative for the
documentation process; they are not Requirements of the documented System.
When a kernel concept identifies an independently maintained obligation on
system development, operation, or governance, that obligation MUST instead be
admitted as a `process` Requirement and linked from the kernel concept.

OKF defines the document envelope, path-based identity, provenance, lifecycle,
and ordinary links. This profile defines exact concept types, type-specific
fields, canonical paths, containment, and validation. The human-readable
profile is normative. Supporting foundations and guides explain it; this
profile controls when representation guidance conflicts.

A conforming corpus MUST be an OKF v0.2 bundle. Its root `index.md` MUST state
that it adopts and link the `software-architecture-docs` profile version
`0.10.2`. A link without adoption language is informative only.

This is an open-world profile. Other useful concepts MAY coexist under OKF,
but a local convention MUST NOT redefine a governed type or waive a `MUST` or
`MUST NOT` rule. The profile does not require a complete system inventory or a
requirement for every behavior.

Profile conformance establishes only that the maintained concepts satisfy this
representation and semantic contract. It does not establish conformance to the
complete process or information-item provisions of ISO/IEC/IEEE 29148, prove
that the system's requirement set is complete, or show that the realized
system satisfies its requirements. Those claims require separately bounded
authorities and evidence.

## Conformance

Assess and report two independent results:

1. **OKF conformance** for the OKF v0.2 bundle contract.
2. **Profile conformance** for this software-architecture contract.

Missing or unavailable evidence produces `unknown`, not pass. Complete profile
conformance combines executable structural validation with a named manual
semantic review.

A conforming corpus MUST:

1. use the governed types and paths for applicable concepts;
2. contain the five required root concepts;
3. maintain one normative Requirement authority for every accepted obligation
   while permitting distinct realization and evaluation witnesses;
4. colocate each Requirement with its canonical architecture subject;
5. keep every maintained concept reachable from the root; and
6. pass the applicable structural and semantic checks below.

## Common frontmatter

Every governed concept MUST include:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `type` | Required | Exact concept type defined here |
| `title` | Required | Stable canonical display name |
| `description` | Required | One sentence distinguishing the concept from neighboring concepts |
| `status` | Required | `draft`, `stable`, or `deprecated` |
| `tags` | Recommended | Search terms and meaningful aliases |

Standard OKF `sources`, `generated`, `verified`, `stale_after`, and `resource`
MAY be used truthfully. OKF `status` describes the knowledge document, not the
system lifecycle or requirement acceptance state.

## Required system kernel

The root MUST contain `system.md`, `lifecycle.md`, `ownership.md`,
`decisions.md`, and `assurance.md`. No overview, C4 concept, external authority,
or local convention substitutes for one of these concepts. A body MUST contain
accepted meaning, or a bounded absence conclusion with rationale,
consequences, and reassessment triggers; placeholders do not conform.

### System

```yaml
---
type: System
title: Reservation platform
description: The documented system that owns reservation state within a synthetic capacity boundary.
status: stable
tags: [system, reservations]
---
```

System MUST identify the documented subject, its purpose, boundary, material
exclusions, and important relationships to its environment. It is the root
subject for system-wide requirements. It does not replace an Offering, a C4
Software System, or a generated inventory; link those views when maintained.

### System Lifecycle

System Lifecycle MUST identify the accepted lifecycle or support state,
material change horizon or expected evolution, and events that trigger review.
It MUST link rather than duplicate an admitted process Requirement when a
trigger imposes an independently maintained obligation on system work.

### System Ownership

System Ownership MUST identify stable maintenance accountability, the material
stewardship boundary, and continuity, transfer, or escalation routes. It MUST
NOT copy volatile rosters.

### Architecture Decision Policy

Architecture Decision Policy MUST define which choices require an Architecture
Decision Record, who or what accepts and supersedes them, where records live,
their minimum content, and reconsideration triggers. `decisions/` appears only
with the first admitted record. Corpus-governance mechanics MAY remain in the
policy. An independently maintained obligation on system delivery or operation
MUST be a linked process Requirement rather than a second normative policy
statement.

### System Assurance

System Assurance MUST identify the confidence required for
architecture-significant change, the evidence authorities used to establish
it, required review or approval, and reassessment triggers. It MUST link rather
than duplicate requirements, tests, evaluations, compliance records, or live
evidence. An independently maintained review, approval, independence, or
sign-off obligation on system work MUST be a linked process Requirement.

## Requirement

Requirement is the sole profile type for accepted obligations of the
documented System and eligible architecture subjects. Functional, quality,
process, human-factors, usability, and constraint requirements share one
identity and relationship model. Verification technique does not determine
requirement type: one Requirement may be evaluated through end-to-end
examples, focused tests, property tests, analysis, observation, or several of
these.

```yaml
---
type: Requirement
title: Failed installation preserves the workspace
description: A failed installation leaves no partial workspace changes.
status: stable
tags: [installation, workspace, recovery]
requirement_id: AXM-REQ-0061
requirement_type: functional
subject: /surfaces/cli/install.md
requirement_sources:
  - /use-cases/install-an-extension.md
derived_from:
  - AXM-REQ-0014
---
```

Every Requirement MUST include:

| Field | Contract |
| --- | --- |
| `requirement_id` | A stable, bundle-unique identifier that evidence can reference; it MUST NOT be reused after retirement |
| `requirement_type` | Exactly one of `functional`, `quality`, `process`, `human-factors`, `usability`, or `constraint` |
| `subject` | Exactly one bundle-relative link to the canonical architecture concept whose accepted obligation is stated |

`subject` is required even though the path also expresses ownership. This
controlled redundancy makes the relationship explicit and mechanically
checkable. It is not resource allocation. This profile does not define
`allocated_to`.

A Requirement MUST contain:

```markdown
# Failed installation preserves the workspace

## Requirement

When installation cannot complete, the CLI install command shall leave the
workspace in its pre-installation state.

## Rationale

Partial installation state makes subsequent recovery ambiguous.
```

The statement MUST:

- identify the same subject as `subject` without ambiguity;
- use `shall` for the obligation;
- state one necessary outcome, with relevant conditions and bounds;
- avoid design or implementation detail unless that detail is itself a
  constraint; and
- be verifiable without prescribing a verification method.

Within governed corpus concepts, author-authored binding `shall` statements
MUST appear only in the `## Requirement` section of a Requirement. Source
concepts may describe needs, scenarios, risks, policies, or desired outcomes in
their own language, but they MUST NOT present themselves as the normative owner
of an admitted obligation.

The rationale MUST explain why the requirement exists or what consequence it
prevents. Manual review SHOULD assess necessity, appropriateness,
unambiguity, completeness, singularity, feasibility, verifiability,
correctness, and conformance with the local requirement style.

Requirement verification reviews whether the statement is well formed;
requirement validation reviews whether it correctly transforms its source need
or authority. Both are distinct from evidence that the realized subject
satisfies the accepted Requirement. Use [Documenting
requirements](../guides/documenting-requirements.md) for the individual
engineering and review procedure.

The profile does not treat all admitted Requirements as one complete system
specification. When an authority claims completeness or fitness of a declared
set, it MUST state the set boundary and source baseline and manually assess
set-level completeness, consistency, combined feasibility, comprehensibility,
and ability to be validated. Use [Reviewing a requirement
set](../guides/reviewing-requirement-sets.md) for that procedure.

### Requirement types

| `requirement_type` | Use for |
| --- | --- |
| `functional` | Required behavior, transformation, state transition, response, or service |
| `quality` | A required degree or condition of system, product, service, use, or data quality provided by the obligated subject |
| `process` | An obligation on an accepted lifecycle, development, operational, or governance process |
| `human-factors` | An obligation arising from human capabilities, limitations, safety, workload, cognition, or environment |
| `usability` | An interaction-quality obligation concerned with effective, efficient, learnable, or satisfying use |
| `constraint` | A binding limitation on design, implementation, technology, interfaces, law, policy, or operating conditions |

`usability` intentionally remains a useful specialization of quality and human
factors for product-surface discovery and navigation. Authors MUST choose the
primary type that best communicates the obligation; type folders are not a
claim that ISO classifications are mutually exclusive in every conceptual
model.

The type MUST be selected from the obligation's primary accepted meaning, not
from its source-document heading, structured clause form, concern name, or
verification technique. Interface behavior is normally `functional`; an
interface quality outcome is `quality` or `usability`; and a mandated protocol,
format, or interface technology is `constraint`. Assessable performance is
normally `quality`. An invariant is a preservation semantic and MUST be
classified by what its predicate obligates rather than represented as another
type. Use [Classifying requirements in software
architecture](../foundations/requirement-classification.md) and the focused
type guides for the non-normative decision procedure.

### Requirement relationships

Two optional attributes are defined:

| Field | Contract |
| --- | --- |
| `requirement_sources` | A list of bundle-relative concept links or external URIs identifying non-requirement authorities from which the requirement originates, such as a Need, Use Case, policy, regulation, operational scenario, decision, or trade study |
| `derived_from` | A list of parent `requirement_id` values from which this Requirement is derived |

`requirement_sources` MUST NOT overload OKF `sources`: OKF `sources` records
document provenance, while `requirement_sources` expresses requirements
traceability. `derived_from` MUST reference maintained Requirement concepts and
MUST NOT contain self-references or cycles.

Do not add generic `classifications`, `requirement_status`, `owner`, `priority`,
`risk`, `difficulty`, `allocated_to`, `verification_methods`, `verified_by`, or
`implemented_by` fields to satisfy this profile. Add a future field only when a
current authoritative consumer and migration contract justify it.

### Quality requirement metadata

A quality Requirement MUST additionally include:

```yaml
quality_model: ISO/IEC 25010:2023
quality_characteristic: reliability
quality_subcharacteristic: recoverability
```

`quality_model` pins the applied model. When it is `ISO/IEC 25010:2023`,
`quality_characteristic` MUST be one of `functional-suitability`,
`performance-efficiency`, `compatibility`, `interaction-capability`,
`reliability`, `security`, `maintainability`, `flexibility`, or `safety`, and
`quality_subcharacteristic` MUST use the corresponding kebab-case English name
from that standard. Authors and validators MUST have lawful access to the
standard's exact taxonomy. These fields classify the Requirement; they do not
determine its physical path.

## Other governed concepts

The requirements model does not collapse the other architecture views. The
following semantic contracts remain normative; focused guides explain their
authoring without changing these minimums.

| Type | Minimum semantic contract |
| --- | --- |
| Offering | Explain the coherent value made available, audiences and circumstances in scope, boundary, exclusions, and relevant authority. |
| Audience | Explain the durable group and circumstances, contextual roles, exclusions, and evidence for consequential segmentation; do not identify private people or customers in a public corpus. |
| Need | Explain the solution-independent problem, constraint, opportunity, or desired outcome, affected audiences and circumstances, exclusions, and supporting evidence. |
| Job to Be Done | Explain the audience, progress sought, circumstances and relevant forces, exclusions, and supporting evidence without turning the job into a solution. |
| Value Proposition | Explain the offering, audience, need or job, promised benefit, recognizable value, scope, limitations, and evidence; do not present it as proof of an achieved outcome. |
| Use Case | Identify the subject boundary, primary actor role, actor goal, and successful outcome; include a concise technology-neutral scenario and material extensions when they carry durable meaning. |
| Capability | Explain the bearer and level, outcome-oriented ability, value, exclusions, and consequential decomposition or evidence. |
| Feature | Explain independently recognizable behavior, intended outcome, actors and conditions, durable cross-view identity, exclusions, and failure context; link accepted behavioral or failure Requirements rather than restating them. |
| Surface | Explain the actor-facing encounter point, actors, interaction boundary, recognizable behavior, exclusions, and consequential accessibility, trust, or operational concerns; link accepted obligations rather than restating them. |
| Subdomain | Explain the problem-space responsibility, important distinctions, exclusions, and the rationale for its required `classification`. |
| Bounded Context | Explain the coherent model and language scope, authority, purpose, exclusions, and realization evidence without treating it as a Subdomain or code folder. |
| Context Map | Explain the bounded contexts in scope, directional dependency and translation boundaries, consistency and failure concerns, linked Requirements, and architectural consequences. |
| C4 Software System | Explain the software boundary, value, responsibility, exclusions, direct interactors, and consequential relationships. |
| C4 Container | Identify exactly one containing C4 Software System and explain the application or data-store responsibility, runtime boundary, consequential technology, interactions, and exclusions; containers do not contain containers. |
| C4 Component | Identify exactly one owning C4 Container and explain a cohesive responsibility, defined interface, dependencies, and exclusions; components do not recursively contain components. |
| C4 View | State its scope and primary question; identify canonical elements consistently and label interactions, technology, notation, and view-specific context meaningfully. |

### Architecture Decision Record

An Architecture Decision Record MUST represent one accepted durable choice and
identify context, the accepted choice, rationale, material alternatives when
useful, consequences, and supersession or reconsideration conditions. Proposed
choices remain in their proposal lifecycle. A decision SHOULD link the
Requirement concepts to which it responds. When the accepted choice becomes
the source of an independently binding limitation on an eligible subject, the
Architecture Decision Record SHOULD be a `requirement_sources` authority for a
constraint Requirement; the record continues to own the choice and rationale.

### Demand and value

Offering, Audience, Need, Job to Be Done, and Value Proposition remain sibling
concepts under `value/`. They MUST NOT be forced into a single product
hierarchy. Needs, use cases, policies, regulations, and similar authorities may
be Requirement sources; they are not Requirement subjects merely because they
motivate an obligation.

### Use Case

A Use Case MUST identify its subject boundary, primary actor role, actor goal,
and successful outcome. It SHOULD state a concise technology-neutral success
scenario and material extensions. A use case is a source of requirements and a
bridge to capabilities, surfaces, domain authority, structure, and evidence;
it is not itself a Requirement or exhaustive test inventory. When a scenario
exposes an admitted obligation, the Use Case SHOULD link its Requirement and
MUST NOT restate the obligation as a binding `shall` statement.

### Capability and Feature

A Capability describes an outcome-oriented ability of a declared bearer and
level. A Feature describes independently recognizable behavior with durable
identity across one or more use cases or surfaces. Either MAY be a Requirement
subject. Neither is a delivery epic or test suite.

### Surface

A Surface describes an actor-facing encounter point, its actors, interaction
boundary, recognizable behavior, and material exclusions. Surfaces MAY form a
recursive navigation tree when narrower surfaces have independent durable
identity, for example CLI → command → subcommand. This hierarchy is an
interaction model, not a test-suite hierarchy or C4 containment model.

### Domain-driven design

Subdomain, Bounded Context, and Context Map retain their established DDD
meanings. Only Bounded Context is an eligible Requirement subject: it owns a
model and language boundary against which obligations can be stated.
Subdomains classify problem space, and Context Maps own inter-context views.

### C4

C4 Software System, C4 Container, C4 Component, and C4 View retain their C4
meanings and containment rules. Software systems, containers, and components
MAY be Requirement subjects. Views are projections and MUST NOT be Requirement
subjects. The required root System concept identifies the documented subject;
it does not replace canonical C4 model elements.

## Eligible Requirement subjects

`subject` MUST resolve to exactly one maintained concept of one of these types:

- System;
- Offering;
- Capability;
- Feature;
- Surface;
- Bounded Context;
- C4 Software System;
- C4 Container; or
- C4 Component.

Audience, Need, Job to Be Done, Value Proposition, Use Case, Subdomain, Context
Map, C4 View, Architecture Decision Record, Requirement, and navigational index
documents MUST NOT be Requirement subjects. They may serve as sources,
context, decisions, or projections.

## Paths and colocation

The five singleton concepts use these root paths:

```text
system.md
lifecycle.md
ownership.md
decisions.md
assurance.md
```

Other governed concepts retain these canonical collections:

```text
decisions/<architecture-decision>.md
value/offerings/<offering>.md
value/audiences/<audience>.md
value/needs/<need>.md
value/jobs/<job-to-be-done>.md
value/value-propositions/<value-proposition>.md
use-cases/<use-case>.md
capabilities/<capability>.md
features/<feature>.md
surfaces/<surface>.md
surfaces/<surface>/<narrower-surface>.md
domains/{core|supporting|generic}/<subdomain>.md
domains/contexts/<bounded-context>.md
domains/context-maps/<context-map>.md
structure/systems/<software-system>.md
structure/containers/<container>.md
structure/containers/<container>/components/<component>.md
structure/views/...
```

`Subdomain.classification` is required and MUST be `core`, `supporting`, or
`generic`, matching its directory. Bounded Context and Context Map MUST NOT use
that field. `C4 View.view_type` is required and MUST be `system-landscape`,
`system-context`, `container`, `component`, `code`, `dynamic`, or `deployment`.
Canonical view paths are:

```text
structure/views/system-landscape.md
structure/views/system-context.md
structure/views/containers.md
structure/views/components/<container>.md
structure/views/dynamics/<interaction>.md
structure/views/deployments/<environment>.md
structure/views/code/<component>.md
```

A dynamic view MUST identify one named feature, use case, or behavior and one
scenario, initiator, intended outcome, and explicit order or coordination. A
deployment view MUST name its environment. Current realization and code views
SHOULD be generated when practical.

Requirements MUST be placed in a same-named directory adjacent to their
subject:

```text
<subject>.md
<subject>/
└── requirements/
    ├── index.md
    └── <requirement_type>/
        ├── index.md
        └── <requirement>.md
```

For example:

```text
surfaces/
├── index.md
├── cli.md
└── cli/
    ├── index.md
    ├── install.md
    └── install/
        ├── index.md
        └── requirements/
            ├── index.md
            ├── functional/
            │   ├── index.md
            │   └── failed-installation-preserves-workspace.md
            └── usability/
                ├── index.md
                └── failure-identifies-recovery-action.md
```

The `requirement_type` MUST match its type-directory name, `subject` MUST match
the adjacent canonical concept, and the statement MUST name the same subject.
Do not create empty subject directories, `requirements/` collections, or type
folders. Every present directory containing concepts MUST have a navigational
`index.md`. Physical colocation expresses primary ownership, not exclusivity:
links and generated views may show a Requirement from other perspectives.

Top-level `constraints/` and `quality/` collections, `Architecture Constraint`,
and `Product Quality Requirement` are superseded in this version. A corpus MUST
NOT retain them as compatibility aliases or duplicate authorities.

## Relationship semantics

When consequential and maintained, authors SHOULD state these relationships
in prose around ordinary links:

| Relationship | Meaning |
| --- | --- |
| Requirement **has subject** architecture concept | The concept is the thing obligated by the statement and owns the colocated requirement collection. |
| non-requirement authority **is source of** Requirement | The authority explains why the requirement exists. |
| Requirement **is derived from** Requirement | The child obligation follows from a maintained parent obligation. |
| Architecture Decision Record **responds to** Requirement | The accepted choice explains how architecture accommodates the obligation. |
| implementation **realizes** architecture concept or Requirement | Code, configuration, and runtime structures carry out the accepted meaning. |
| evaluation definition **evaluates** Requirement | The definition owns method, cases, oracle, conditions, and thresholds; it references `requirement_id` and MAY repeat the predicate. |
| evaluation execution **produces** evaluation result | One bounded attempt binds the evaluator, realization, inputs, and environment to its observations. |
| evaluation result **provides evidence for** Requirement | The result supports no stronger claim than its bounded execution and oracle establish. |
| telemetry or operational observation **observes** realized behavior | The observation may expose satisfaction, non-satisfaction, ambiguity, or changed conditions but does not rewrite desired state. |
| governance decision **relies on** evidence | A release, exception, rollback, or other decision remains distinct from the evidence it considers. |

This version defines machine-readable fields only for `subject`,
`requirement_sources`, and `derived_from`. It intentionally does not define
backlinks from requirements to volatile implementations or evidence. Tools MAY
generate subject specifications, trace matrices, coverage views, and living
documentation by resolving `requirement_id` references.

## Authority and maintenance

Architecture concepts own accepted durable subject, responsibility,
relationship, decision, and response meaning. Requirement concepts alone own
accepted obligations of eligible subjects. Code, schemas, configuration,
generated diagrams, reports, and runtime systems own exact or current facts
when they express those facts better; architecture prose SHOULD link rather
than copy them. Tests and evaluations own assessment definitions and evidence,
so they MAY repeat a Requirement predicate while referencing its stable ID. A
current implementation property, passing test, failing evaluation, or runtime
observation is evidence, not accepted desired state by itself.

Each collection `index.md` MUST state its grouping rule, link immediate
concepts or narrower collections, and remain navigational. Every concept MUST
be reachable from the root. A path move changes OKF identity; update inbound
links, generated consumers, and `log.md` as one migration.

## Migration from 0.9.0

Version `0.10.0` was a breaking profile revision. Version `0.10.1` clarified
how authors select one of its existing six requirement types. Version `0.10.2`
clarifies that the Requirement is the single normative authority while tests
and evaluations may deliberately repeat its predicate as distinct witnesses.
Neither clarification adds a type, field, or path migration. A corpus migrating
from `0.9.0` or earlier MUST:

1. update its root adoption sentence to `0.10.2`;
2. create `system.md` from accepted system purpose, boundary, and exclusions,
   preserving `unknown` rather than inventing missing meaning;
3. identify the canonical subject of every accepted requirement and assign a
   stable bundle-unique `requirement_id`;
4. convert each Product Quality Requirement to `Requirement` with
   `requirement_type: quality`, `subject`, and ISO quality metadata;
5. convert each binding Architecture Constraint to `Requirement` with
   `requirement_type: constraint`, preserving its authority in
   `requirement_sources` or the body;
6. extract other load-bearing accepted requirement statements from
   architecture prose or executable specifications into one Requirement
   authority when they justify maintenance, including admitted invariants,
   guarantees, prohibitions, boundary rules, required failure or recovery
   outcomes, binding dependency directions, and system process obligations;
7. move each Requirement to its subject-colocated type collection, create only
   earned indexes, and update all links and evidence references;
8. remove superseded `quality/`, `constraints/`, Product Quality Requirement,
   and Architecture Constraint representations without compatibility copies;
   and
9. record path and semantic-ownership changes in `log.md`.

Extraction, acceptance, changed wording, a new identifier, or a changed
subject is a semantic change and requires the applicable authority. A
mechanical migration MUST NOT manufacture desired state.

## Validation

Run the extension-relative structural checker:

```bash
python3 scripts/validate-software-architecture-profile.py <architecture-root>
```

The checker validates adoption, common fields, required root concepts,
canonical paths, Requirement identity/type/subject colocation, eligible subject
resolution, quality metadata, derivation references and cycles, indexes,
superseded collections, and reachability. Manual review MUST additionally
check the semantic contracts, individual requirement engineering and wording,
any claimed bounded requirement-set quality, system boundary, decisions,
assurance, model distinctions, authority claims, and whether load-bearing
obligations remain outside their canonical Requirements. Structural validation
does not establish requirement validation or realized-system satisfaction.

The [minimal conforming architecture
corpus](minimal-conforming-architecture-corpus.md) provides a synthetic example
and dated manual report.
