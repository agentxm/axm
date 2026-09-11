---
type: Decision
status: stable
description: The executable-specification metadata contract, classification lens, controlled vocabularies, and shared product-goal identities live once in `@agentxm/specification-metadata` and are consumed by every AgentXM specification corpus.
depends-on:
  - ./executable-specifications-authority.md
  - ./colocated-specifications.md
  - ./package-classification-and-dependency-policy.md
  - ../system-wide/testing-strategy.md
---

# Shared specification contract

## Decision

`@agentxm/specification-metadata` owns the executable
specification contract for every AgentXM repository: the metadata shape, the
classification lens, the controlled vocabularies, the shared product-goal
registry, the decoders, and the corpus conformance check. Every AXM
specification binds to that contract directly, wherever in the workspace it
lives; no local copy of the contract remains.

The contract is an engineering library under `tools/`, not a runtime package.
It ships with the fixed release cohort so other repositories can author
specifications against it, and the role matrix bars every runtime package from
importing it — only test-purpose files may.

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

Before this decision AXM carried its own metadata contract inside its central
specification project, with a per-characteristic class vocabulary, while the
AgentXM platform repository governed its obligations in prose. Converging both on executable specifications required one contract,
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
- **Publish the contract from a new package.** Rejected at the time, on the
  grounds that the shared kernel already shipped as one fixed release cohort
  that both repositories install and the contract is pure data and pure
  functions with no dependency the kernel lacks. **Now accepted.** Classifying
  every package by strategic domain and technical role made the objection
  answer itself: a contract used to author requirements is engineering support,
  and leaving it inside `@agentxm/extension-model` meant the Registry Worker
  and every runtime consumer of the shared model carried specification tooling
  they never call. `@agentxm/specification-metadata` is a separate `tools/`
  package, still a member of the same fixed cohort, so the original force —
  one install, one version — is preserved while the runtime model stays clean
  ([Package classification and dependency policy](package-classification-and-dependency-policy.md)).
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
  local product goals. The per-change verdict digests the complete metadata
  and bound evidence as the requirement contract, so a changed statement,
  lineage entry, assumption, or gate binding is a requirement-contract
  change; it digests the decisive example surface (ordered test titles and
  `each` rows) separately, so changed examples render as a possible
  requirement change to review, and a body-only change renders as evidence
  maintenance that tooling did not review for meaning
  ([Colocated specifications](colocated-specifications.md)).
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
