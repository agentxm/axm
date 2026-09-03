---
type: Decision
status: stable
description: The executable-specification metadata contract, classification lens, controlled vocabularies, and shared product-goal identities live once in `@agentxm/extension-model` and are consumed by every AgentXM specification corpus.
depends-on:
  - ./executable-specifications-authority.md
  - ./specification-infrastructure.md
  - ../system-wide/testing-strategy.md
---

# Shared specification contract

## Decision

`@agentxm/extension-model/unstable/specifications` owns the executable
specification contract for every AgentXM repository: the metadata shape, the
classification lens, the controlled vocabularies, the shared product-goal
registry, the decoders, and the corpus conformance check. AXM's
`specifications/` corpus binds to that contract directly; no local copy of the
contract remains.

The contract fixes these points:

- **Class is the review lens.** Every specification carries exactly one of
  `functional`, `quality`, `constraint`, `external-conformance`,
  `human-factors`, or `process`. A `quality` specification names the
  characteristic it measures (`installability`, `compatibility`,
  `performance`, `security`, and so on); selection by characteristic replaces
  the former per-characteristic classes. Former `architecture` specifications
  are `constraint`; former `usability` specifications are `human-factors`.
- **Presence is authority.** A specification on a corpus's `main` is
  accepted; merging the change that adds, revises, or removes it is the
  acceptance decision, and the identities a successor `supersedes` are retired
  in the same change. The metadata decoder rejects unknown fields, and the
  conformance check rejects a successor whose superseded predecessor is still
  present, so one obligation is never normative in two places.
- **The statement is the obligation.** Every specification carries a
  product-language `statement` (subject, condition, required or prohibited
  outcome) alongside its title; native tests remain the reportable scenarios.
- **Lineage and uncertainty are explicit.** `derivedFrom` records predecessor
  requirements, prior specifications, witnessing tests, or surfaces;
  `assumptions` and `openQuestions` are stated as lists or as `"unknown"`,
  never omitted; `limitations` declare blind spots with retirement
  conditions; a boundary other than memory requires a `boundaryRationale`.
- **Shared goals are registered once.** Outcomes that more than one AgentXM
  repository serves live in `sharedProductGoals`; each repository's local
  registry holds only its own goals and may not redefine a shared identity.
  A specification that names a shared goal the installed contract does not
  register fails conformance as a dangling cross-repository reference.
- **Each corpus specifies its own conformance.** Where two repositories meet
  through a published contract, each side specifies its own conformance to a
  named contract version; neither restates the other's obligations.

## Context

Before this decision AXM carried its own metadata contract in
`specifications/support/contract.ts` with a per-characteristic class
vocabulary, while the AgentXM platform repository governed its obligations in
prose. Converging both on executable specifications required one contract,
one lens, one goal identity space, and one conformance rule that both
repositories could install as a published artifact. The
[testing strategy](../system-wide/testing-strategy.md) defines the model this
contract makes executable; the
[executable specifications authority decision](executable-specifications-authority.md)
established that specifications own AXM requirements.

## Alternatives considered

- **Keep a local contract per repository and align by convention.** Rejected:
  vocabulary drift and duplicated goal identities would have no mechanical
  check, and the cross-repository allocation of obligations would rest on
  prose.
- **Publish the contract from a new package.** Rejected: the shared kernel
  already ships as one fixed release cohort that both repositories install,
  and the contract is pure data and pure functions with no dependency the
  kernel lacks.
- **Keep the per-characteristic classes.** Rejected: the shared lens is the
  review lens both repositories agreed to, and the characteristic field
  preserves every existing filter.

## Consequences

- `pnpm test:spec --class <lens>` selects by review lens and
  `pnpm test:spec --characteristic <characteristic>` selects a quality
  characteristic; `pnpm test:compatibility` and `pnpm test:performance`
  select by characteristic.
- The catalog renders each specification's statement, lineage,
  assumptions, open questions, and limitations, and separates shared from
  local product goals. The per-change verdict digests the complete metadata,
  so a changed statement, lineage entry, or assumption is a
  requirement-contract change.
- The Allure adapter and catalog generator validate metadata through the
  shared decoders; a specification that does not satisfy the contract fails
  to load.
- A change to the contract is a change to a published kernel package and
  follows the fixed release cohort, so a consuming repository adopts a new
  contract version deliberately.

## Reconsideration

Reconsider when a third specification corpus needs the contract with
materially different vocabularies, when the shared kernel stops shipping as
one fixed cohort, or when a corpus needs an obligation to exist on `main`
without being authority, which presence-as-authority cannot express.
