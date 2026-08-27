---
type: Standard
title: Gen Stack application profile for OKF v0.2
description: The application profile for a durable human-authored corpus at repository `gen-stack/`, governing cross-cutting system governance, Intent, Architecture, subject-colocated Requirements, and Evaluation Protocols.
tags: [gen-stack, okf, application-profile, intent, architecture, requirements, evaluations, governance]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md
    title: Gen Stack vocabulary and relationship model
  - id: okf-v0.2
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.2
  - id: dcmi-application-profile
    resource: https://www.dublincore.org/resources/glossary/application_profile/
    title: DCMI definition of an application profile
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 — Product quality model
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:30:00Z
---

# Gen Stack application profile for OKF v0.2

## Profile identity

| Property | Value |
| --- | --- |
| Profile identity | `gen-stack` |
| Profile version | `0.5.0` |
| Base specification | OKF v0.2 |
| Status | Draft |
| Applies to | The required root kernel and evaluations navigation, plus admitted concepts under `intent/`, `architecture/`, subject-colocated `requirements/`, and `evaluations/protocols/` collections |
| Audience | Intent, requirements, architecture, and governance authors; maintainers; reviewers; and profile validators |

## Authority and document roles

The [Gen Stack vocabulary and relationship model](../glossary.md) is the
semantic authority for preferred terms, stable identifiers, definitions,
distinctions, relationship meaning and cardinality, and prohibited inferences.
This profile MUST conform to that meaning and is authoritative only for the
governed OKF representation: admitted types, paths, fields, body structure,
relationship encodings, navigation, and profile validation. A semantic conflict
between this profile and the glossary is a profile defect.

Documents of type `Explanation` deepen understanding through rationale,
examples, comparisons, consequences, and tradeoffs. Documents of type `Guide`
support selection, authoring, review, and maintenance. Both MUST conform to the
glossary; guides MUST also use this profile's representation. Neither document
type adds semantic authority or profile-conformance requirements. Links labeled
**Understand** and **Author** below are supporting routes, not normative
incorporation.

OKF v0.2 remains authoritative for the base document envelope, path-derived
identity, provenance, lifecycle metadata, reserved files, and ordinary links.
This profile is a delta over that native contract: it strengthens or adds only
the representation needed for governed Gen Stack concepts. It does not rename,
restate, or create aliases for OKF-owned fields. OKF conformance and this
profile's conformance remain separate claims.

## Purpose and scope

This profile governs the durable, human-authored representation of the required
cross-cutting kernel, admitted Intent and Architecture concepts,
subject-colocated Requirements, and Evaluation Protocols. The
[glossary](../glossary.md) defines their meaning and relationships; the
[Gen Stack overview](../overview.md) explains how those authorities cooperate.

Implementation, repository-native Evaluation Suites, Executions, Results and
Reports, Signals, and Observations are peer authorities outside this corpus
contract. A conforming corpus MUST NOT require `implementation/`, `feedback/`,
`signals/`, or `observations/` collections or copy those peer artifacts into
the corpus. Evaluation Protocols are the governed exception: their durable
assessment claims belong in this corpus and repository-native tools may
project or compile them into executable forms.

A conforming corpus MUST be an OKF v0.2 bundle. Its root `index.md` MUST state
that it adopts and link `gen-stack` version `0.5.0`. This is an open-world
profile: other OKF concepts may coexist, but local conventions MUST NOT
redefine a governed type or waive a profile rule.

Profile conformance establishes representation conformance and conformance to
the glossary meanings this profile references. It does not establish corpus
coverage, completeness of requirements, implementation satisfaction,
evaluation coverage, or operational fitness.

## Repository placement and discovery

A repository claiming conformance to this profile MUST place its one supported
Gen Stack corpus at `<repository-root>/gen-stack/`. The repository root itself
and every alternate corpus location are unsupported. A `gen-stack/` directory
is only a discovery candidate: its `index.md` MUST still establish OKF v0.2
and explicitly adopt the supported profile version before a consumer treats
the corpus as accepted Gen Stack knowledge.

Public Gen Stack tools MUST receive a repository root, default it to the
current directory when omitted, and derive the corpus root by appending
`gen-stack`. They MUST NOT scan for candidate corpora, walk upward to find a
repository or Git root, or consult a locator file, environment variable, or
alternate-path configuration. A `gen-stack` path that is a symlink or resolves
outside the repository boundary MUST be rejected. Consumers MAY accept an
explicit repository-root argument when they are not invoked from that root.

Repository placement and corpus identity remain distinct. Bundle-relative
paths beginning with `/` resolve beneath `gen-stack/`, not beneath the
repository root, and moving the complete bundle to `gen-stack/` does not
change those internal concept identities. Repository-native Implementation,
Implementation, repository-native Evaluation execution and evidence, Signal,
Observation, and work-item authorities remain outside the corpus unless
another authority independently places them there.

### Consumer contract

A host harness, corpus query utility, or other Gen Stack consumer MUST take a
repository root as its location input and derive `gen-stack/` through the same
fixed rule. It SHOULD distinguish these machine-readable states:

- `absent` — `gen-stack/` is not present;
- `unsupported` — a profile-like corpus is at the repository root or the
  candidate escapes the repository boundary;
- `invalid` — `gen-stack/` exists but its OKF declaration, profile adoption,
  or governed representation is invalid; and
- `conforming` — executable structural validation passes.

`conforming` in this state vocabulary is only the structural result. The
separate semantic review remains `unknown` until named evidence establishes
it. Consumers MUST NOT treat `absent`, `unsupported`, or `invalid` as an empty
but usable corpus. Host harnesses MAY use a structurally conforming corpus to
discover Architecture subjects and associated Requirements for test-suite or
evaluation guidance while preserving the separate authorities of Requirements,
Evaluation Protocols, Executions, Results, and coverage claims.

## Conformance

Report three separate results when they are in scope:

1. **OKF conformance** — whether the bundle satisfies OKF v0.2.
2. **Profile conformance** — whether governed concepts satisfy this profile.
3. **Coverage or fitness assessment** — any separately bounded claim about
   completeness, satisfaction, evaluation coverage, or operation.

The third result is never implied by the first two. Missing evidence produces
`unknown`, not pass. Complete profile conformance combines executable
structural validation with a named manual review against the referenced
glossary meanings. An explanation or guide can inform that review but cannot
supply a missing semantic or representation rule.

A conforming corpus MUST contain the five required root concepts and
`evaluations/index.md`, use governed types at canonical paths, keep every
maintained concept reachable from the root, maintain one active normative
Requirement authority per accepted obligation, retain retired Requirement
identity and lineage, and colocate each Requirement with its one canonical
Architecture subject.

## Base fields and profile delta

OKF owns the meaning and representation of `type`, `title`, `description`,
`status`, `tags`, `sources`, `generated`, `verified`, `stale_after`, and
`resource`. This profile adds no aliases or duplicate body sections for those
facts. It makes the following governed-presence delta: every governed concept
MUST include `type`, `title`, `description`, and `status`; `status` MUST be
`draft`, `stable`, or `deprecated`; and `tags` are recommended. Other standard
OKF fields may be used truthfully. OKF `status` describes the knowledge
document, not the system lifecycle, Requirement lifecycle, acceptance,
delivery, verification, or operational state.

The producer-owned `relationships` field MAY encode controlled Gen Stack
relationships as specified in [Relationship
representation](#relationship-representation). It is not an OKF v0.2 field.
Consumers that do not implement this profile must nevertheless preserve it as
producer frontmatter.

The Author Guides provide preferred logical body order where this profile does
not require exact structure. Such guidance supports consistent presentation
but is not an additional profile-conformance rule. A governed concept MUST NOT
repeat frontmatter fields as a generic metadata section merely to satisfy that
guidance.

## Required cross-cutting kernel

The corpus root MUST contain these concepts:

| Path | Exact type and canonical meaning | Understand | Author |
| --- | --- | --- | --- |
| `system.md` | <a id="system"></a>`System` → [`system`](../glossary.md#term-system) | [Gen Stack overview](../overview.md) | [Documenting systems](../governance/documenting-systems.md) |
| `lifecycle.md` | <a id="system-lifecycle"></a>`System Lifecycle` → [`system-lifecycle`](../glossary.md#term-system-lifecycle) | — | [Documenting system lifecycle](../governance/documenting-system-lifecycle.md) |
| `ownership.md` | <a id="system-ownership"></a>`System Ownership` → [`system-ownership`](../glossary.md#term-system-ownership) | — | [Documenting system ownership](../governance/documenting-system-ownership.md) |
| `decisions.md` | <a id="architecture-decision-policy"></a>`Architecture Decision Policy` → [`architecture-decision-policy`](../glossary.md#term-architecture-decision-policy) | — | [Documenting architecture decision policies](../governance/documenting-architecture-decision-policies.md) |
| `assurance.md` | <a id="system-assurance"></a>`System Assurance` → [`system-assurance`](../glossary.md#term-system-assurance) | — | [Documenting system assurance](../governance/documenting-system-assurance.md) |

Only `System` is an eligible Requirement subject. A separately maintained
binding obligation expressed through the other governance concepts MUST be a
`process` Requirement assigned to an eligible subject and linked from the
governance concept. Individual accepted architecture decisions use type
`Architecture Decision Record` under `architecture/decisions/`; concrete
evaluation artifacts remain repository-native.

## Evaluation Protocols

The corpus MUST contain `evaluations/index.md` as reserved navigation and link
it from the root index. The
index routes readers to governed Protocols and repository-native Suites,
Executions, Results, Reports, and coverage projections when they exist; it MUST
NOT own a durable evaluation claim, portfolio policy, current result, or
assurance conclusion.

`evaluations/system-evaluation-approach.md` and type `System Evaluation
Approach` are retired and MUST NOT appear in a `0.5.0` corpus. Migration
distributes their meaning rather than retaining the old document as a second
portfolio authority.

<a id="evaluation-protocol"></a>`Evaluation Protocol` maps to the glossary
term [`evaluation-definition`](../glossary.md#term-evaluation-definition).
[Evaluation Protocols as assessment
contracts](../evaluations/evaluation-protocols-as-assessment-contracts.md)
provides the primary explanation; [Designing Evaluation
Protocols](../evaluations/designing-evaluation-protocols.md) is the authoring
guide.

Every Evaluation Protocol MUST include:

```yaml
---
type: Evaluation Protocol
title: Rejected pet updates preserve accepted state
description: Assesses one accepted store-update obligation.
status: stable
protocol_id: PET-EVAL-REQ-001
protocol_lifecycle: active
evaluation_role: requirement-satisfaction
requirements:
  - PET-REQ-0042
---
```

`protocol_id` MUST be a bundle-unique, never-reused non-empty string.
`protocol_lifecycle` MUST be `active` or `retired`. The body MUST contain these
exact second-level headings:

- `## Claim`
- `## Assessment`
- `## Judgment`
- `## Evidence and lifecycle`

The Protocol MAY define one or more Evaluation Cases within that body or link
to stable repository-native case source. A Case inherits its Protocol's role
and criteria authority; it is not a separate governed OKF type. If a Case needs
an independent claim, lifecycle, outcome, or reporting identity, authors MUST
promote it to its own Protocol.

### Role and target fields

`evaluation_role` MUST be exactly one of `requirement-satisfaction`,
`architecture-realization`, or `implementation-conformance`. Each role has one
matching target field and prohibits the other two:

| Role and canonical meaning | Required target field | Target form |
| --- | --- | --- |
| `requirement-satisfaction` → [`evaluation-role`](../glossary.md#term-evaluation-role) | `requirements` | Non-empty unique list of maintained `requirement_id` values. An active Protocol MUST target active Requirements. The Protocol derives Architecture subjects from each Requirement's canonical `subject`; it MUST NOT duplicate them in `architecture_authorities`. |
| `architecture-realization` → [`evaluation-role`](../glossary.md#term-evaluation-role) | `architecture_authorities` | Non-empty unique list of bundle-relative paths to maintained System, Architecture Decision Record, Capability, Feature, Surface, Bounded Context, Context Map, C4 Software System, C4 Container, or C4 Component concepts. C4 View is prohibited. |
| `implementation-conformance` → [`evaluation-role`](../glossary.md#term-evaluation-role) | `implementation_units` | Non-empty unique list of repository-relative POSIX paths to mechanically resolvable files or directories outside `gen-stack/`. The evaluated contract or invariant remains repository-local and MUST be stated in the Protocol's Claim and Judgment. |

A retired Protocol retains its identity, last applicable targets, claim, and
retirement Provenance in `## Evidence and lifecycle`; it does not contribute
`defined` coverage. Prefer one Requirement per requirement-satisfaction
Protocol when that gives the claim, judgment, and lifecycle one clear owner,
but multiple targets remain valid for one genuinely indivisible claim.

### Canonical protocol paths

Protocol paths encode their primary role:

```text
evaluations/protocols/requirements/<protocol>.md
evaluations/protocols/architecture/<protocol>.md
evaluations/protocols/implementation/<protocol>.md
```

`evaluations/protocols/` and a role directory MUST be omitted until its first
Protocol is admitted. Every present directory requires `index.md`; no empty
role directories or plural catch-all Protocol documents are permitted. The
same role structure MAY be mirrored by repository-native Suites, but Suite
layout is not semantic and does not establish Protocol role or target.

### Reporting projections

Evaluation reporting MUST preserve three logically separate projections:
Requirement satisfaction, Architecture realization, and Implementation
conformance. A single rendered report MAY contain all three, but it MUST NOT
merge their outcomes or imply that one projection proves another. Within each
projection, keep these axes independent:

- Protocol Coverage: `uncovered` or `defined`;
- evidence state: `absent`, `stale`, `current`, `skipped`, or
  `harness-error`; and
- bounded outcome: `pass`, `fail`, or `unknown`.

Profile conformance establishes only the Protocol representation. It does not
establish coverage, evidence currency, a passing outcome, Requirement
satisfaction, Architecture realization, Implementation conformance, or System
Assurance. Physical Suites and evidence stores remain repository-native and
MUST bind every Execution to the exact Protocol revision, selected Cases or
sample, inputs or observations, environment and configuration, Implementation
revision, evaluator or harness, and attempt time or observation window.

## Governed Intent types

Intent types are optional and admitted only when the corpus contains an
accepted concept. Their canonical meaning comes solely from the linked glossary
term.

| Exact type and canonical meaning | Canonical collection | Understand | Author |
| --- | --- | --- | --- |
| <a id="offering"></a>`Offering` → [`offering`](../glossary.md#term-offering) | `intent/offerings/` | [Offerings and value](../intent/offerings-and-value.md) | [Documenting offerings](../intent/documenting-offerings.md) |
| <a id="audience"></a>`Audience` → [`audience`](../glossary.md#term-audience) | `intent/audiences/` | [Offerings and value](../intent/offerings-and-value.md) | [Documenting audiences](../intent/documenting-audiences.md) |
| <a id="need"></a>`Need` → [`need`](../glossary.md#term-need) | `intent/needs/` | [Offerings and value](../intent/offerings-and-value.md) | [Documenting needs](../intent/documenting-needs.md) |
| <a id="job-to-be-done"></a>`Job to Be Done` → [`job-to-be-done`](../glossary.md#term-job-to-be-done) | `intent/jobs/` | [Jobs to Be Done](../intent/jobs-to-be-done.md) | [Documenting Jobs to Be Done](../intent/documenting-jobs-to-be-done.md) |
| <a id="value-proposition"></a>`Value Proposition` → [`value-proposition`](../glossary.md#term-value-proposition) | `intent/value-propositions/` | [Offerings and value](../intent/offerings-and-value.md) | [Documenting value propositions](../intent/documenting-value-propositions.md) |
| <a id="use-case"></a>`Use Case` → [`use-case`](../glossary.md#term-use-case) | `intent/use-cases/` | [Goal-oriented behavior and use cases](../intent/goal-oriented-behavior.md) | [Documenting use cases](../intent/documenting-use-cases.md) |
| <a id="subdomain"></a>`Subdomain` → [`subdomain`](../glossary.md#term-subdomain) | `intent/domains/{core,supporting,generic}/` | [Domain-driven design](../architecture/domains/domain-driven-design.md) | [Documenting subdomains](../intent/documenting-subdomains.md) |

Intent concepts may be `requirement_sources`. They MUST NOT be Requirement
subjects and MUST NOT own a second normative formulation of an admitted
Requirement. A Use Case is not a Requirement or an exhaustive test inventory.

## Governed Architecture types

Architecture types are optional and admitted only when the corpus contains an
accepted concept. Their canonical meaning comes solely from the linked glossary
term.

| Exact type and canonical meaning | Canonical collection | Understand | Author |
| --- | --- | --- | --- |
| <a id="architecture-decision-record"></a>`Architecture Decision Record` → [`architecture-decision-record`](../glossary.md#term-architecture-decision-record) | `architecture/decisions/` | [Software architecture overview](../architecture/overview.md) | [Documenting architecture decision records](../architecture/decisions/documenting-architecture-decision-records.md) |
| <a id="capability"></a>`Capability` → [`capability`](../glossary.md#term-capability) | `architecture/capabilities/` | [Capabilities](../architecture/capabilities/capabilities.md) | [Documenting capabilities](../architecture/capabilities/documenting-capabilities.md) |
| <a id="feature"></a>`Feature` → [`feature`](../glossary.md#term-feature) | `architecture/features/` | [Capabilities](../architecture/capabilities/capabilities.md) | [Documenting features](../architecture/features/documenting-features.md) |
| <a id="surface"></a>`Surface` → [`surface`](../glossary.md#term-surface) | `architecture/surfaces/` | [Capabilities](../architecture/capabilities/capabilities.md) | [Documenting surfaces](../architecture/surfaces/documenting-surfaces.md) |
| <a id="bounded-context"></a>`Bounded Context` → [`bounded-context`](../glossary.md#term-bounded-context) | `architecture/domains/contexts/` | [Domain-driven design](../architecture/domains/domain-driven-design.md) | [Documenting bounded contexts](../architecture/domains/documenting-bounded-contexts.md) |
| <a id="context-map"></a>`Context Map` → [`context-map`](../glossary.md#term-context-map) | `architecture/domains/context-maps/` | [Domain-driven design](../architecture/domains/domain-driven-design.md) | [Documenting context maps](../architecture/domains/documenting-context-maps.md) |
| <a id="c4-software-system"></a>`C4 Software System` → [`c4-software-system`](../glossary.md#term-c4-software-system) | `architecture/structure/systems/` | [C4 model](../architecture/structure/c4-model.md) | [Documenting C4 software systems](../architecture/structure/documenting-c4-software-systems.md) |
| <a id="c4-container"></a>`C4 Container` → [`c4-container`](../glossary.md#term-c4-container) | `architecture/structure/containers/` | [C4 model](../architecture/structure/c4-model.md) | [Documenting C4 containers](../architecture/structure/documenting-c4-containers.md) |
| <a id="c4-component"></a>`C4 Component` → [`c4-component`](../glossary.md#term-c4-component) | Beneath its owning Container | [C4 model](../architecture/structure/c4-model.md) | [Documenting C4 components](../architecture/structure/documenting-c4-components.md) |
| <a id="c4-view"></a>`C4 View` → [`c4-view`](../glossary.md#term-c4-view) | `architecture/structure/views/` | [C4 model](../architecture/structure/c4-model.md) | [Documenting C4 views](../architecture/structure/documenting-c4-views.md) |

## Requirements

<a id="requirement"></a>`Requirement` maps to the glossary term
[`requirement`](../glossary.md#term-requirement). [Requirements
engineering](../architecture/requirements/requirements-engineering.md) provides
the primary explanation; [Documenting
requirements](../architecture/requirements/documenting-requirements.md) is the
authoring guide.

```yaml
---
type: Requirement
title: Failed installation preserves the workspace
description: A failed installation leaves no partial workspace changes.
status: stable
requirement_id: AXM-REQ-0061
requirement_type: functional
requirement_lifecycle: active
subject: /architecture/surfaces/cli/install.md
requirement_sources:
  - /intent/use-cases/install-an-extension.md
derived_from:
  - AXM-REQ-0014
---
```

Every Requirement MUST include a bundle-unique, never-reused
`requirement_id`; exactly one `requirement_type`; exactly one
`requirement_lifecycle` value; and exactly one bundle-relative `subject` link.
`requirement_lifecycle` MUST be `active` or `retired`. Candidate obligations
MUST remain outside the governed corpus until accepted.

Its body MUST contain a `## Requirement` section preserving the canonical
expression of exactly one active or formerly accepted obligation and a
`## Rationale` section. The expression has normative force only while
`requirement_lifecycle` is `active`. A retired Requirement MUST also contain a
`## Lifecycle` section identifying the accepted retirement decision and its
available Provenance. No other governed concept may own a competing normative
formulation of an active obligation. OKF `status` continues to describe the
knowledge document and MUST NOT substitute for `requirement_lifecycle`.

<a id="requirement-types"></a>
The six `requirement_type` values map to glossary classifications and focused
authoring guides:

| Value | Canonical meaning | Author |
| --- | --- | --- |
| <a id="functional-requirement"></a>`functional` | [`functional-requirement`](../glossary.md#term-functional-requirement) | [Documenting functional requirements](../architecture/requirements/documenting-functional-requirements.md) |
| <a id="quality-requirement"></a>`quality` | [`quality-requirement`](../glossary.md#term-quality-requirement) | [Documenting product quality requirements](../architecture/requirements/documenting-product-quality-requirements.md) |
| <a id="process-requirement"></a>`process` | [`process-requirement`](../glossary.md#term-process-requirement) | [Documenting process requirements](../architecture/requirements/documenting-process-requirements.md) |
| <a id="human-factors-requirement"></a>`human-factors` | [`human-factors-requirement`](../glossary.md#term-human-factors-requirement) | [Documenting human-factors requirements](../architecture/requirements/documenting-human-factors-requirements.md) |
| <a id="usability-requirement"></a>`usability` | [`usability-requirement`](../glossary.md#term-usability-requirement) | [Documenting usability requirements](../architecture/requirements/documenting-usability-requirements.md) |
| <a id="constraint-requirement"></a>`constraint` | [`constraint-requirement`](../glossary.md#term-constraint-requirement) | [Documenting architecture constraints](../architecture/requirements/documenting-architecture-constraints.md) |

`requirement_sources` may list bundle-relative non-Requirement concepts or
external URIs. It is distinct from OKF `sources`, which records document
provenance. `derived_from` may list maintained parent `requirement_id` values.
`supersedes` may list maintained predecessor `requirement_id` values on an
accepted successor. Both relationships MUST omit self-references and cycles.
Every superseded predecessor MUST be `retired`; a retired Requirement may have
no successor. Replacement, split, and merge updates SHOULD add successors,
retire predecessors, and establish all supersession edges as one coherent
change. This profile does not define
`allocated_to`, `implemented_by`, `verified_by`, `verification_methods`,
`priority`, or `owner` fields.

A quality Requirement MUST include `quality_model`,
`quality_characteristic`, and `quality_subcharacteristic`. When
`quality_model` is `ISO/IEC 25010:2023`, the characteristic MUST be one of
`functional-suitability`, `performance-efficiency`, `compatibility`,
`interaction-capability`, `reliability`, `security`, `maintainability`,
`flexibility`, or `safety`, and the subcharacteristic MUST use the
applicable kebab-case English name from that standard.

### Eligible Requirement subjects

`subject` MUST resolve to exactly one maintained concept of type System,
Capability, Feature, Surface, Bounded Context, C4 Software System, C4 Container,
or C4 Component. Offering, Audience, Need, Job to Be Done, Value Proposition,
Use Case, Subdomain, Context Map, C4 View, ADR, governance concept, Requirement,
and index documents MUST NOT be subjects.

Subject-selection judgment and review belong to the [requirements
guide](../architecture/requirements/documenting-requirements.md). Profile
conformance checks only eligibility, resolution, and colocation.

## Canonical layout and colocation

```text
<repository-root>/
  gen-stack/
    index.md
    system.md
    system/requirements/...
    lifecycle.md
    ownership.md
    decisions.md
    assurance.md
    evaluations/
      index.md
      protocols/
        index.md
        requirements/
        architecture/
        implementation/
    intent/
      offerings/
      audiences/
      needs/
      jobs/
      value-propositions/
      use-cases/
      domains/{core,supporting,generic}/
    architecture/
      decisions/
      capabilities/
      features/
      surfaces/
      domains/contexts/
      domains/context-maps/
      structure/systems/
      structure/containers/
      structure/views/
```

The `evaluations/` collection is always required for navigation. Its
`protocols/` collection and role directories exist only when they contain
admitted Protocols. Other collections likewise exist only when they contain
admitted concepts. Every present collection has a navigational `index.md`.
Plural catch-all concept documents are prohibited.

Narrower Surfaces may use
`architecture/surfaces/<surface>/<narrower>.md`. Components use
`architecture/structure/containers/<container>/components/<component>.md`.
Canonical C4 View paths are:

```text
architecture/structure/views/system-landscape.md
architecture/structure/views/system-context.md
architecture/structure/views/containers.md
architecture/structure/views/components/<container>.md
architecture/structure/views/dynamics/<interaction>.md
architecture/structure/views/deployments/<environment>.md
architecture/structure/views/code/<component>.md
```

`Subdomain.classification` MUST be `core`, `supporting`, or `generic` and
match its directory. `C4 View.view_type` MUST be `system-landscape`,
`system-context`, `container`, `component`, `code`, `dynamic`, or
`deployment`.

Requirements are placed in a same-named directory adjacent to their subject:

```text
<subject>.md
<subject>/
  requirements/
    index.md
    <requirement_type>/
      index.md
      <requirement>.md
```

The type-directory name MUST match `requirement_type`, and `subject` MUST
match the adjacent concept. Do not create empty subject, Requirement, or type
directories. Colocation expresses canonical ownership, not exclusivity.

## Relationship representation

The [Gen Stack vocabulary and relationship model](../glossary.md) owns the
canonical direction, domain, range, inverse reading, cardinality, and inference
boundaries of every controlled relationship. This profile owns only their
governed recording locations, readable frontmatter roles, reciprocal
projections, and validation.

### Relationships field

`relationships` is an optional mapping from a profile-defined readable role to
a non-empty list of targets:

```yaml
relationships:
  contributes-to-capability:
    - /architecture/capabilities/extension-management.md
  is-available-through-surface:
    - /architecture/surfaces/cli.md
```

Each role MUST appear in the tables below, every target MUST be a unique
non-empty string, and empty mappings or role lists MUST NOT be present.
Producers MUST NOT use `relations`, `links`, or independent top-level role
fields as aliases for this controlled map; ordinary Markdown links retain
their normal navigational and explanatory purpose.
Internal targets MUST be bundle-relative absolute paths beginning with `/`,
resolve to non-reserved concept documents, and omit query strings and
fragments. An absolute external URI is allowed only where the applicable row
explicitly permits one. YAML mapping order is not semantic; producers SHOULD
sort roles and targets for stable review.

The role reads naturally from the document that carries it. One recording
location is authoritative for each relationship fact. A reciprocal role is a
derived projection of that same fact, not a second assertion. For an internal
relationship whose two endpoints are governed concepts, both endpoint views
MUST be present and agree exactly. Authors MUST edit the designated assertion
source and then synchronize reciprocal projections. A synchronizer MUST NOT
infer controlled meaning from an ordinary Markdown link or from prose.

For example, a Feature authors this assertion:

```yaml
relationships:
  contributes-to-capability:
    - /architecture/capabilities/extension-management.md
```

Synchronization materializes the same fact on the Capability without creating
a second source of truth:

```yaml
relationships:
  is-supported-by-feature:
    - /architecture/features/install-an-extension.md
```

Rich dependency conditions, translations, rationale, consequences, or other
relationship meaning remain in the applicable concept body. The frontmatter
edge makes the controlled relationship discoverable; it does not replace that
meaning or create a stronger inference than the glossary permits.

### Existing Requirement encodings

These established fields remain the authoritative assertion sources and MUST
NOT be duplicated under `relationships` on the Requirement. Their reciprocal
roles are materialized only on internal governed targets.

| Vocabulary relationship | Assertion source | Derived reciprocal role |
| --- | --- | --- |
| [`requirement-source-is-source-of-requirement`](../glossary.md#relationship-requirement-source-is-source-of-requirement) | `requirement_sources` on the Requirement, containing bundle-relative non-Requirement concept paths or external URIs | `is-source-of-requirement` on each internal governed source, targeting the Requirement path |
| [`requirement-has-subject`](../glossary.md#relationship-requirement-has-subject) | `subject` on the Requirement plus subject-colocated placement | `is-subject-of-requirement` on the eligible Architecture subject, targeting the Requirement path |
| [`requirement-is-derived-from-requirement`](../glossary.md#relationship-requirement-is-derived-from-requirement) | `derived_from` on the child Requirement, containing parent `requirement_id` values | `is-parent-of-requirement` on each maintained parent, targeting the child Requirement path |
| [`requirement-supersedes-requirement`](../glossary.md#relationship-requirement-supersedes-requirement) | `supersedes` on an accepted successor Requirement, containing retired predecessor `requirement_id` values | `is-superseded-by-requirement` on each maintained predecessor, targeting the successor Requirement path |

### Governed relationship roles

The **Assertion source** column names the only author-maintained representation.
The reciprocal column is mechanically derived. `0..*` relationships are
omitted when inconsequential; omission does not prove that no relationship
exists.

| Vocabulary relationship | Assertion source | Derived reciprocal | Additional representation rule |
| --- | --- | --- | --- |
| [`requirement-incorporates-normative-reference`](../glossary.md#relationship-requirement-incorporates-normative-reference) | `incorporates-normative-reference` on the Requirement | `is-incorporated-by-requirement` when the target is an internal governed concept | Targets MAY be bundle-relative concept paths or external URIs. An external target has no reciprocal frontmatter. |
| [`adr-responds-to-requirement`](../glossary.md#relationship-adr-responds-to-requirement) | `responds-to-requirement` on the Architecture Decision Record | `is-addressed-by-adr` on the Requirement | Both endpoints MUST resolve to the stated governed types. |
| [`offering-depends-on-capability`](../glossary.md#relationship-offering-depends-on-capability) | `depends-on-capability` on the Offering | `supports-offering` on the Capability | Both endpoints MUST resolve to the stated governed types. |
| [`use-case-exercises-capability`](../glossary.md#relationship-use-case-exercises-capability) | `exercises-capability` on the Use Case | `is-exercised-by-use-case` on the Capability | Both endpoints MUST resolve to the stated governed types. |
| [`feature-enables-use-case`](../glossary.md#relationship-feature-enables-use-case) | `enables-use-case` on the Feature | `is-enabled-by-feature` on the Use Case | Both endpoints MUST resolve to the stated governed types. |
| [`feature-contributes-to-capability`](../glossary.md#relationship-feature-contributes-to-capability) | `contributes-to-capability` on the Feature | `is-supported-by-feature` on the Capability | Both endpoints MUST resolve to the stated governed types. |
| [`feature-is-available-through-surface`](../glossary.md#relationship-feature-is-available-through-surface) | `is-available-through-surface` on the Feature | `exposes-feature` on the Surface | Both endpoints MUST resolve to the stated governed types. |
| [`architecture-view-is-realized-by-c4-element`](../glossary.md#relationship-architecture-view-is-realized-by-c4-element) | `is-realized-by-c4-element` on a Capability, Feature, or Surface | `realizes-architecture-view` on the C4 element | The role does not create a containment relationship or make the endpoints identical. |
| [`bounded-context-models-subdomain`](../glossary.md#relationship-bounded-context-models-subdomain) | `models-subdomain` on the Bounded Context | `is-modeled-by-bounded-context` on the Subdomain | Both endpoints MUST resolve to the stated governed types. |
| [`context-map-relates-context`](../glossary.md#relationship-context-map-relates-context) | `relates-bounded-context` on the Context Map | `participates-in-context-map` on each Bounded Context | Every Context Map MUST relate one or more Bounded Contexts. Participation alone does not encode a directional dependency between contexts. |
| [`surface-contains-surface`](../glossary.md#relationship-surface-contains-surface) | The narrower Surface's canonical nested path | `contains-surface` on the parent and `is-contained-by-surface` on the child | A nested Surface MUST have exactly one maintained parent Surface; a root Surface has none. Both roles are derived from the path. |
| [`c4-system-contains-container`](../glossary.md#relationship-c4-system-contains-container) | `belongs-to-c4-software-system` on the C4 Container | `contains-c4-container` on the C4 Software System | Every C4 Container MUST name exactly one C4 Software System. |
| [`c4-container-contains-component`](../glossary.md#relationship-c4-container-contains-component) | The C4 Component's canonical owning-Container path | `contains-c4-component` on the Container and `belongs-to-c4-container` on the Component | Every Component MUST resolve to exactly one maintained Container. Both roles are derived from the path. |
| [`c4-view-projects-element`](../glossary.md#relationship-c4-view-projects-element) | `projects-c4-element` on the C4 View | `appears-in-c4-view` on each C4 element | Every C4 View MUST project one or more canonical C4 elements. |

### Evaluation Protocol relationship encodings

Evaluation Protocol target fields are authoritative assertion sources and MUST
NOT be duplicated under `relationships`. The profile validator resolves them;
the synchronizer does not place coverage backlinks on Requirements,
Architecture concepts, or repository-native Implementation Units.

| Vocabulary relationship | Assertion source |
| --- | --- |
| [`evaluation-definition-evaluates-requirement`](../glossary.md#relationship-evaluation-definition-evaluates-requirement) | `requirements` on a `requirement-satisfaction` Evaluation Protocol |
| [`evaluation-definition-evaluates-architecture-realization`](../glossary.md#relationship-evaluation-definition-evaluates-architecture-realization) | `architecture_authorities` on an `architecture-realization` Evaluation Protocol |
| [`evaluation-protocol-evaluates-implementation-conformance`](../glossary.md#relationship-evaluation-protocol-evaluates-implementation-conformance) | `implementation_units` on an `implementation-conformance` Evaluation Protocol |
| [`evaluation-protocol-defines-case`](../glossary.md#relationship-evaluation-protocol-defines-case) | The Protocol body or its stable repository-native case links |

### Other relationship encodings

The remaining controlled relationships are semantically defined by the
glossary but have another assertion source. This profile MUST NOT require peer
artifacts to move into the corpus or place volatile backlinks on governed
concepts.

| Glossary relationship | Representation owner |
| --- | --- |
| [`architecture-constrains-compilation`](../glossary.md#relationship-architecture-constrains-compilation) | The Compilation authority |
| [`compilation-produces-implementation-unit`](../glossary.md#relationship-compilation-produces-implementation-unit) | The Compilation or generation record |
| [`implementation-unit-realizes-authority`](../glossary.md#relationship-implementation-unit-realizes-authority) | Repository-native Implementation metadata |
| [`evaluation-suite-groups-definition`](../glossary.md#relationship-evaluation-suite-groups-definition) | The repository-native Evaluation Suite |
| [`evaluation-execution-applies-definition`](../glossary.md#relationship-evaluation-execution-applies-definition) | The repository-native Evaluation Execution |
| [`evaluation-execution-assesses-implementation`](../glossary.md#relationship-evaluation-execution-assesses-implementation) | The repository-native Evaluation Execution |
| [`evaluation-execution-produces-result`](../glossary.md#relationship-evaluation-execution-produces-result) | The repository-native Evaluation Execution and Result store |
| [`evaluation-result-evidences-requirement`](../glossary.md#relationship-evaluation-result-evidences-requirement) | The repository-native Evaluation Result |
| [`evaluation-result-evidences-architecture-realization`](../glossary.md#relationship-evaluation-result-evidences-architecture-realization) | The repository-native Evaluation Result |
| [`evaluation-result-evidences-implementation-conformance`](../glossary.md#relationship-evaluation-result-evidences-implementation-conformance) | The repository-native Evaluation Result |
| [`evaluation-report-projects-result`](../glossary.md#relationship-evaluation-report-projects-result) | The repository-native Evaluation Report |
| [`signal-draws-attention-to`](../glossary.md#relationship-signal-draws-attention-to) | The Signal authority |
| [`observation-informs-orientation`](../glossary.md#relationship-observation-informs-orientation) | The Observation or Orientation record |
| [`orientation-frames-decision`](../glossary.md#relationship-orientation-frames-decision) | The Orientation or decision record |
| [`decision-selects-action`](../glossary.md#relationship-decision-selects-action) | The decision or action record |
| [`action-produces-observation`](../glossary.md#relationship-action-produces-observation) | The action or Observation record |

### Synchronization and migration

From the repository root, run `scripts/sync-gen-stack-relationships.py` after
changing an assertion source. Pass an explicit `[repository-root]` only when
invoking it elsewhere. Run the same command with `--check` in non-mutating
review or continuous integration. Synchronization MUST be deterministic and
idempotent, MUST preserve unrelated frontmatter and provenance, and MUST
refuse to write when placement or adoption is unsupported or authoritative
assertions are malformed, ambiguous, or contradictory.

To migrate an explicitly identified `gen-stack` `0.2.0`, `0.3.0`, or `0.4.0`
corpus, or a supported corpus previously stored elsewhere:

1. identify the existing corpus by its OKF and Gen Stack profile adoption;
2. move the complete corpus to `<repository-root>/gen-stack/` without sweeping
   unrelated repository documents into it;
3. add `requirement_lifecycle: active` to Requirements whose accepted force is
   still established; do not infer retirement from OKF `status` or stale prose;
4. remove `evaluations/system-evaluation-approach.md` from the current corpus
   after moving each durable claim,
   assessment method, judgment rule, and evidence-lifecycle contract it owns
   into one or more role-specific Evaluation Protocols; route System boundary
   to `system.md`, confidence and independence policy to `assurance.md`, and
   current inventory, gaps, and outcomes to derived indexes, reports, or work
   items rather than copying them into Protocols;
5. update the root adoption statement to `0.5.0`;
6. synchronize relationships safely established by canonical paths and the
   existing Requirement fields;
7. manually encode consequential controlled relationships previously carried
   only by prose or ordinary links;
8. synchronize reciprocal projections;
9. update repository-external links, continuous-integration paths, harness
   inputs, and agent instructions that named the old location; and
10. run OKF validation against `gen-stack/`, profile validation against the
   repository root, and a named semantic review as
   separate checks.

Migration MUST NOT treat an untyped link as evidence of a controlled
relationship, preserve an alternate-path fallback, or leave a compatibility
symlink. Bundle-relative `/...` links retain their
meaning beneath the moved corpus. A corpus may be structurally conforming after
migration without being complete; missing optional relationships and unknown
coverage remain separate assessment questions. The Gen Stack skill does not
perform this migration; this policy constrains a separately authorized human
or tool workflow.

## Navigation and maintenance

Each collection index states its grouping rule and links immediate concepts or
narrower collections. Every concept remains reachable from the root. A path
move changes OKF identity; update inbound links, generated consumers, and
`log.md` together.

Do not create a global `explainers/` collection or change the established
`Explanation` type merely to mirror this profile. Explanations and guides
remain subject-colocated unless a separately evidenced reader route warrants a
different organization.

## Change policy

| Change | Canonical owner | Profile version effect |
| --- | --- | --- |
| Definition, distinction, relationship meaning, cardinality, or prohibited inference | Glossary and bundle `log.md` | Change the profile version only when governed representation or conformance also changes. |
| Governed type, presence, path, field, body structure, encoding, or validation rule | This profile, its validator, tests, and bundle `log.md` | Change the profile version. |
| Rationale, conceptual model, example, comparison, consequence, or tradeoff | An `Explanation` | No profile version change unless a profile rule also changes. |
| Authoring workflow, method, checklist, or quality advice | A `Guide` | No profile version change unless a profile rule also changes. |

When an explanation or guide reveals a semantic gap, update or propose the
glossary meaning before treating the discovery as canonical. When it reveals a
representation gap, update this profile before requiring producers to follow
the rule.

## Validation

From the repository root, run
`scripts/sync-gen-stack-relationships.py --check` and
`scripts/validate-gen-stack-profile.py` for mechanically decidable profile
rules. Both commands accept an optional explicit `[repository-root]`; neither
accepts or discovers an arbitrary corpus root. Their machine-readable results
identify both repository and corpus roots and distinguish absent, unsupported,
invalid, and structurally conforming repository states. The validator checks
placement, adoption, field form, role vocabulary, target resolution, domain
and range, role-specific target exclusivity, Requirement lifecycle,
Requirement-derived subjects, Architecture target eligibility, C4 View
exclusion, cardinality, path consistency, index reachability, empty protocol
directories, reciprocal projection, and cycles where the glossary prohibits
them. Also run the applicable OKF validator
directly against `<repository-root>/gen-stack/` and a named manual semantic
review. Structural validation cannot establish correct Intent, proper
Requirement subject selection, Protocol coverage or method adequacy, evidence
currency, satisfaction, realization, conformance, assurance, or fitness.

Operationally, keep validation layered: run the native OKF check first, the
profile's structural check second, named semantic review third, and any
coverage or fitness assessment last. Preserve each result independently. Do
not add a style or preferred-body-order failure to the profile validator unless
that structure first becomes a normative profile rule.
