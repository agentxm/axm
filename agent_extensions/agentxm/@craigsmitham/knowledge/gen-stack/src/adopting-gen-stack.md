---
type: Guide
title: Adopting Gen Stack
description: Use when a greenfield or brownfield repository is establishing its first Gen Stack corpus; achieve day-one OKF and profile conformance while keeping incomplete coverage, realization, and evidence explicit.
tags: [gen-stack, adoption, okf, profile-conformance, greenfield, brownfield, architecture, requirements, evaluations]
status: draft
sources:
  - resource: /overview.md
    title: How the Gen Stack operates
  - resource: /profile/gen-stack-application-profile.md
    title: Gen Stack application profile for OKF v0.2
  - resource: /architecture/developing-candidate-architecture-and-requirements.md
    title: Developing candidate Architecture and Requirements
  - resource: /evaluations/deriving-evaluation-coverage-in-harnesses.md
    title: Deriving evaluation coverage in harnesses
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T23:50:45Z
---

# Adopting Gen Stack

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) owns canonical meaning, and the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns governed corpus
> representation and conformance. This Guide supplies an adoption workflow; it
> adds neither semantic authority nor profile-conformance rules.

Use this guide to establish the first supported Gen Stack corpus for one
repository. Greenfield and brownfield adoption use different evidence, but
both finish with the same strict day-one contract: a complete required kernel,
only accepted governed meaning, conforming representation, and separate,
truthful statements about what remains uncovered, unrealized, or unevaluated.

## Goal

Create `<repository-root>/gen-stack/` as an OKF v0.2 bundle that explicitly
adopts the supported Gen Stack profile and passes structural validation and a
named semantic review. Do not claim adoption while the corpus is only a
scaffold or while a required root concept contains invented, candidate, or
unknown meaning.

Day-one conformance is deliberately narrower than complete system knowledge or
operational maturity:

| Claim | Day-one expectation |
| --- | --- |
| OKF conformance | Required and passing |
| Gen Stack profile structural conformance | Required and passing |
| Semantic review of governed meaning | Required and passing through a named review authority |
| Required cross-cutting kernel and Evaluation navigation | Present, accepted, and conforming |
| Optional Intent and Architecture coverage | May be incomplete; every admitted concept must conform |
| Requirement coverage | Unassessed or unaccepted areas may remain incomplete; every known accepted obligation in scope must have one active canonical Requirement |
| Implementation realization | May be `pass`, `fail`, or `unknown` from bounded evidence |
| Evaluation coverage and Requirement satisfaction | May be incomplete or `unknown`; missing evidence is never a pass |
| Operational fitness or release readiness | Separate decisions, never implied by adoption |

OKF document `status` describes the document lifecycle. In particular,
`status: draft` does not make candidate system meaning eligible for the
governed corpus.

## Representation

Keep evidence inventories, candidate development, decision support, and the
adoption completion report in their native conversation, review, work-item, or
change-management surfaces. The durable adoption result is the complete
`<repository-root>/gen-stack/` OKF bundle: use the profile's exact paths,
types, fields, body requirements, colocation, relationships, and navigation,
then use each linked Author Guide for residual concept meaning. This Guide
does not introduce an adoption concept, universal template, candidate
frontmatter, or second conformance record. Link peer authorities instead of
copying their native fields or results into the corpus.

## Preconditions

Before creating the adopted corpus, identify:

- the repository root and the single System the corpus will document;
- the supported Gen Stack profile version;
- the human or institutional authorities that can accept the System boundary,
  lifecycle, ownership, Architecture Decision policy, assurance posture,
  Evaluation Protocols, Architecture, and Requirements;
- the authoritative or evidentiary sources available to those decisions; and
- the day-one coverage boundary and known material omissions.

The same person, role, or process may hold several authorities, but acceptance
must be explicit. Repository edit permission, implementation history, tests,
or polished drafts do not supply it.

Develop unresolved meaning in a conversation, work item, review, or another
native decision surface. Do not use a partially created governed concept as
the candidate-development workspace.

## 1. Bind the adoption scope and decision authorities

State the System that will be documented, the repository boundary, the
profile version, the planned adoption change, and the authority for each
required decision. Name what day-one coverage will include and exclude without
claiming that an excluded area has no Requirements, Architecture, or risk.

Treat adoption as one coherent repository change. A working branch or draft
may be incomplete while it is being assembled, but consumers must not receive
an adoption declaration until the complete required corpus is ready for all
validation gates.

## 2. Orient from the applicable starting state

Choose one evidence route, then converge on the common ratification and
authoring steps.

### Greenfield route

Use accepted or candidate Intent, external constraints, scenarios, risks,
prototypes, proposed operating practices, evaluation design, and ownership
commitments. Distinguish what an authority has already accepted from what is
still exploratory or proposed.

When a required boundary, responsibility, interaction, or obligation remains
open, use [Developing candidate Architecture and
Requirements](/architecture/developing-candidate-architecture-and-requirements.md)
and only the implicated Surface, C4 structure, or Requirement guide. Do not
create every optional concept type for symmetry, and do not require an
Implementation to exist before accepting durable desired-state or governance
meaning.

### Brownfield route

Inventory material existing claims rather than migrating documents one for
one. One legacy document may contain several kinds of meaning with different
authorities and maturity.

| Existing material | Initial Gen Stack treatment |
| --- | --- |
| Maintained accepted architecture or decision | Possible accepted Architecture or Architecture Decision Record |
| Architecture prose with unclear acceptance | Evidence, candidate Architecture, or a disputed claim |
| Contract, policy, law, or external standard | Possible Requirement source or incorporated normative reference |
| API, schema, compatibility commitment, or runbook | Peer authority or evidence according to local governance |
| Code, configuration, deployment, and data layout | Implementation evidence |
| Test or other reusable assessment | Candidate Evaluation Protocol, Case, or witness, never automatically a Requirement |
| Execution result, telemetry, support report, or incident | Evaluation Result, Observation, or Signal according to its native meaning |
| Repeated relied-upon behavior without accepted desired state | Evidence for an inferred candidate obligation |

For every material claim, preserve its source, availability, observed meaning,
authority, maturity, confidence, and contradictions. Current implementation
establishes what exists; it does not silently decide what ought to exist.

Use the shared candidate-development Guide when evidence exposes missing,
underdeveloped, misplaced, disputed, stale, or contradicted Architecture or
Requirements. Resolve only the meaning needed for truthful adoption and the
declared day-one coverage. Preserve other gaps as coverage findings rather
than inventing completeness.

For every known accepted legacy obligation in the adopted scope, create one
active canonical Requirement and resolve its authority before duplication
occurs. Either retain an identified external normative authority and
incorporate it with explicit local scope, or make the Gen Stack Requirement
the one canonical local authority while the legacy representation becomes
derived or historical. Defer only unassessed or unaccepted meaning, never a
known accepted obligation. Do not leave two independently maintained local
normative formulations.

## 3. Ratify the required cross-cutting kernel

Both routes must produce accepted, bounded meaning for every required root
concept. Use the profile's Author route for each concept instead of copying a
template from this Guide.

| Required path | Ratify | Author route |
| --- | --- | --- |
| `system.md` | System purpose, boundary, material exclusions, and environmental relationships | [Documenting systems](/governance/documenting-systems.md) |
| `lifecycle.md` | Support state, change horizon, expected evolution, and reassessment triggers | [Documenting system lifecycle](/governance/documenting-system-lifecycle.md) |
| `ownership.md` | Stable accountability, stewardship boundary, continuity, and escalation | [Documenting system ownership](/governance/documenting-system-ownership.md) |
| `decisions.md` | ADR threshold, acceptance and supersession authority, record location, minimum content, and reconsideration | [Documenting architecture decision policies](/governance/documenting-architecture-decision-policies.md) |
| `assurance.md` | Required confidence, evidence authorities, review or approval routes, and reassessment triggers | [Documenting system assurance](/governance/documenting-system-assurance.md) |

Required does not mean verbose. A small system may have a concise lifecycle,
one durable stewardship role, no current local ADRs under an accepted
threshold, and no assurance obligation beyond ordinary repository review and
automated evaluations. Each bounded conclusion still needs its accepted
rationale, consequence, evidence route, and reassessment trigger where the
applicable Author Guide requires them.

If an authority cannot truthfully accept one of these concepts, adoption is
blocked. Do not replace the missing decision with `unknown`, `TBD`, an empty
section, a guessed owner, or a generic policy.

## 4. Admit Evaluation Protocols and navigation

Create `evaluations/index.md` as navigation. Admit each durable accepted
assessment claim through [Designing Evaluation
Protocols](/evaluations/designing-evaluation-protocols.md), using the exact
role-specific path, fields, and headings from the profile. Omit
`evaluations/protocols/` when no Protocol is yet accepted; report the resulting
coverage gaps separately rather than inventing a portfolio.

For each admitted Protocol, establish:

- one role and its matching Requirement, Architecture, or Implementation
  targets;
- a bounded claim, assessment method or sampling strategy, judgment procedure,
  and evidence lifecycle;
- how repository-native Cases, Suites, Executions, Results, and Reports link to
  the Protocol;
- how evidence is found by Architecture subject, Requirement ID, Protocol role,
  or Implementation Unit;
- where Executions, Results, and Reports remain authoritative;
- how provenance, `unknown`, failures, and harness errors are preserved; and
- stewardship, refresh, and retirement triggers.

When repository tooling can make the assessment repeatable, prefer
harness-assisted coverage derivation. Follow [Deriving evaluation coverage in
harnesses](/evaluations/deriving-evaluation-coverage-in-harnesses.md) so the
harness consumes the policy-neutral `evaluation-candidates` projection, binds
it to the exact corpus snapshot and profile version, applies an identified
repository-local coverage or assurance policy, and classifies each selected
role-and-target pair as `defined` or `uncovered`. The projection supplies
eligibility only: the adopting authority still decides what is in scope and
whether coverage is required. Protocol adequacy, evidence state, outcomes,
assurance, and release readiness remain separate judgments.

Do not copy run evidence into the governed corpus, fabricate Protocol coverage,
or turn an absent Result into a pass. A conforming corpus can have sparse or no
Protocols while coverage, evidence state, and outcomes remain explicitly
incomplete or unknown.

## 5. Select optional day-one coverage

Admit an optional Intent or Architecture concept only when its meaning is
accepted and useful within the declared day-one coverage. Admit every known
accepted obligation in the adopted scope as one Requirement once its source
context, classification, eligible subject, identity, and lifecycle are
accepted. If those supporting decisions remain open, resolve them before
claiming adoption rather than omitting the accepted obligation.

For accepted concepts, follow the applicable **Author** route in the
[application profile](/profile/gen-stack-application-profile.md). For
candidate meaning, return to the shared development Guide. Do not create empty
collections or speculative concepts to resemble the profile's complete type
inventory.

Every admitted active Requirement must have:

- one bundle-unique, never-reused identifier;
- one requirement type and `active` lifecycle state;
- exactly one eligible, maintained Architecture subject;
- one canonical normative expression and a rationale;
- truthful source, derivation, normative-reference, and relationship metadata
  when applicable; and
- no competing governed normative formulation.

Use [Documenting requirements](/architecture/requirements/documenting-requirements.md)
and its focused type Guide. Candidate obligations remain outside the corpus
and receive no canonical identifiers.

## 6. Assemble the governed corpus

Follow the application profile rather than reconstructing its layout here.
Within one coherent adoption change:

1. create `gen-stack/` at the repository root as an OKF v0.2 bundle;
2. author the five required root concepts and required Evaluation navigation,
   plus only accepted Evaluation Protocols;
3. author only the accepted optional concepts and Requirements selected for
   day one;
4. add only navigation earned by maintained concepts and keep every concept
   reachable from the root;
5. synchronize controlled relationship projections from their authoritative
   assertions; and
6. make `gen-stack/index.md` explicitly adopt and link the supported Gen Stack
   profile version.

Keep Implementation, Evaluation Suites, Cases that do not need governed
identity, Executions, Results, Reports, Signals, Observations, work items, and
operational records in their repository-native authorities. Link them where
their meaning and host permit; do not move or copy them merely to make the
corpus appear complete.

## 7. Validate before activation

Run the validation layers independently against the adopting repository:

1. the applicable OKF v0.2 validator directly against `gen-stack/`;
2. `scripts/sync-gen-stack-relationships.py <repository-root> --check` from
   the maintained Gen Stack knowledge package;
3. `scripts/validate-gen-stack-profile.py <repository-root>` from that
   package; and
4. a named manual semantic review against the glossary, profile, accepted
   sources, and applicable Author Guides.

Resolve every OKF or profile error before adoption. Structural success is not
semantic review evidence. The semantic reviewer confirms that required
concepts contain accepted meaning, Requirements have appropriate subjects and
one normative owner, peer authorities remain distinct, and no candidate,
implementation fact, or evidence result has been promoted by inference.

If the corpus changes after validation, rerun the affected gates. Activate or
merge the adoption declaration only with the complete coherent corpus change;
do not expose an `absent`, `unsupported`, or `invalid` repository state as an
adopted corpus.

## 8. Report adoption and remaining work separately

Record a completion result that keeps these claims independent:

```text
OKF conformance: pass | fail
Gen Stack structural profile conformance: pass | fail
Named semantic review: pass | fail | unknown
Declared corpus coverage: <bounded statement>
Known coverage gaps: <identified gaps or none known within the assessed scope>
Implementation realization: pass | fail | mixed | unknown, with evidence scope
Protocol coverage, evidence state, and outcomes: <separate role-specific projections>
Operational fitness or release decision: <separate authority and result | not assessed>
```

Strict day-one adoption requires the first three results to pass. The remaining
results may be incomplete, mixed, unknown, or not assessed without weakening
those conformance claims. They must not be omitted when that omission could be
mistaken for completeness or success.

Route subsequent Signals and gaps through the Gen Stack control loop. Add
accepted corpus concepts incrementally, preserve candidate work outside the
governed corpus, and reassess the kernel when its named triggers occur.

## Final check

- The corpus occupies exactly `<repository-root>/gen-stack/` and its root
  index declares OKF v0.2 and supported-profile adoption.
- All five root governance concepts and Evaluation navigation are present,
  accepted, conforming, and reachable; every admitted Protocol also conforms.
- Greenfield proposals or brownfield implementation evidence did not become
  desired state without ratification.
- Optional day-one coverage is bounded rather than padded with speculative or
  empty concepts.
- Every known accepted obligation in the adopted scope is represented by one
  active canonical Requirement; only unassessed or unaccepted meaning remains
  outside the corpus.
- Every admitted Requirement has one eligible subject and one normative owner.
- Peer Implementation, Evaluation execution and evidence, Signal, Observation,
  work-item, and operational authorities remain repository-native.
- OKF, structural profile, and named semantic-review results all pass.
- Coverage, realization, satisfaction, and fitness remain separate and retain
  `unknown` or failure where evidence requires it.
