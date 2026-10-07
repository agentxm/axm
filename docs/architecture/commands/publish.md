---
type: Architecture
status: stable
description: How AXM validates and distributes workspace-authored extensions.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
  - ./interaction.md
---

# Publish

`axm publish` distributes workspace-authored extensions and explicitly selected
existing skill directories under a separate package envelope. Its
fixed distribution contract is distinct from configurable local lint policy
and from workspace reconciliation.

## Responsibilities

Publish:

- selects explicitly requested authored extensions;
- expands a pack selection only when the caller explicitly requests dependency
  inclusion, and only for dependencies authored by the same workspace;
- skips, as a successful outcome decided before any preparation, every selected
  version the Registry already has, yanked included;
- validates every version that will upload before starting immutable uploads;
- applies the registry's fixed archive and distribution requirements; and
- reports the outcome of each selected extension without overstating remote
  rollback.

An extension may be valid authored workspace content but ineligible for
distribution. For example, an empty authored pack is valid locally while the
publish gate rejects it.

## Distribution selection

The shared extension model owns the include/exclude manifest contract.
Workspace-kernel acquisition owns pure Git-pattern selection and distribution
identity; sources owns bounded filesystem discovery and rule provenance.
Publishing resolves one immutable selection snapshot for archive encoding,
preview, Git source assessment, and final revalidation. Entry kinds remain part
of source review, including paths present only in HEAD. Selection never changes
acquisition, full materialization integrity, import, fork, or projections.

A source switch compares the source's resolved distribution with the actual
Registry installation. Distribution identity canonicalizes implied parents and
retained empty directories, file bytes, executable bits, and link targets.
Git and local adapters preserve their original publication discovery boundary;
a cached canonical package does not substitute the consumer workspace's ignore
rules. Explicit inclusion is self-contained. When default selection lacks
original context, comparison refuses with a distribution-context-unavailable
diagnostic rather than claiming equivalence.

## Publication eligibility

The fixed gate separates these obligations:

- schema, canonical-content, and archive safety;
- validation of declared distribution metadata;
- Registry identity, authentication, ownership, and immutable version rules;
- real type-specific external identity and runtime requirements, including
  software-package or MCP connection declarations where the type requires
  them; and
- minimum discovery quality for people and agents evaluating the extension.

Missing required external identity or known example and placeholder identity
is a hard publication failure. License metadata is optional; AXM never infers a
license or adds an incidental license requirement. Description, README, and
similar discovery material may begin as quality diagnostics rather than hard
requirements unless a governing extension standard or Registry contract
requires them.

Publish validates authored intent; it never guesses, fills, normalizes, or
rewrites a manifest to make the package eligible. The
[authoring model](authoring.md) owns what scaffolding may populate before this
gate.

Skill admission is shared between existing-directory and authored publication.
The archive contains `skill.json` and the unchanged skill root at `src/`.
Publication checks the envelope, required payload, and archive safety without
applying an additional frontmatter conformance gate. Explicit local conformance
lint does not change this distribution contract. See [Skills](../extensions/skills.md).

## Non-responsibilities

Publish does not repair installed state, reconcile projections, change an
extension's local authority, treat local lint configuration as registry policy,
infer publication intent from unpublished authored changes, or reconstruct a
release from mutable installed external content.

A configured workspace owner supplies an authoring default; it does not prove
the caller is authenticated or authorized to publish under that handle.

Remote registry effects are outside AXM's local rollback guarantee. Once an
immutable remote effect succeeds, a later local or remote failure cannot make
that effect unoccur.

Pack dependency inclusion is opt-in on both the root and pack-specific publish
surfaces and can add only workspace-authored dependencies. Registry dependencies
remain references rather than upload candidates. Registry dependency validation
is unconditional: leaving a dependency out of the local upload set never
relaxes the pack's publication requirements.

Preview and apply report three separate layers: local selection decisions, the
Registry-admitted publication set, and execution outcomes. Preview is
speculative; apply reconstructs and validates its own set. Once admitted, packs
wait only for included dependencies they reference. A failed dependency blocks
those packs while independent candidates continue.

Delayed exact authorization is followed by one final material-fingerprint check
before the first upload. Drift abandons the authorized attempt without a remote
write. After the first upload, the captured archives execute without rereading
workspace content.

When execution partially succeeds, recovery re-runs publish for the exact
admitted identities. It does not replay broad filters or store archive bytes.
Versions that uploaded are then already published, so repeating recovery
converges to successful skips. Publish writes no local receipt, lockfile,
baseline, or manifest after a successful upload.

## Authorization and exact resume

Publish asks no confirmation question: the Registry's browser review of the
exact publication set is the approval, as [Interaction](interaction.md)
describes. When that review is needed, AXM records the pending request with
its private initiator proof and publication-set digest in the local AXM user
home before handing the person to the browser.

A pending authorization outlives the process that started it. The authorization
request URL is its exact resume capability: pass it with
`--authorization-request <url>`, and optionally bound an unattended wait with
`--wait-for-human`. AXM does not select a latest request implicitly. Resume
rejects a request whose publication set no longer matches its digest, so
changed archive bytes, membership, visibility, or Registry require a new
review.

## Specifications

The `cli/publish/*` specifications own publish's binding obligations — pure
preview against the fixed publication gate
(`cli/publish/preview-is-pure`) and refusing extensions the
workspace does not author (`cli/publish/requires-established-authorship`). The
[specification catalog](../../../specifications/catalog.md) resolves each
identity to its owning project and file.
