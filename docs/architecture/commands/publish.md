---
type: Architecture
status: stable
description: How AXM validates and distributes workspace-authored extensions.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
---

# Publish

`axm publish` validates and distributes workspace-authored extensions. Its
fixed distribution contract is distinct from configurable local lint policy
and from workspace reconciliation.

## Responsibilities

Publish:

- selects explicitly requested authored extensions;
- expands a pack selection only when the caller explicitly requests dependency
  inclusion;
- validates the complete selection before starting immutable uploads;
- applies the registry's fixed archive and distribution requirements; and
- reports the outcome of each selected extension without overstating remote
  rollback.

An extension may be valid authored workspace content but ineligible for
distribution. For example, an empty authored pack is valid locally while the
publish gate rejects it.

## Publication eligibility

The fixed gate separates these obligations:

- schema, canonical-content, and archive safety;
- explicit legal status, expressed as a valid SPDX license expression or the
  deliberate `UNLICENSED` value;
- Registry identity, authentication, ownership, and immutable version rules;
- real type-specific external identity and runtime requirements, including
  software-package or MCP connection declarations where the type requires
  them; and
- minimum discovery quality for people and agents evaluating the extension.

Missing legal status, missing required external identity, or known example and
placeholder identity is a hard publication failure. Description, README, and
similar discovery material may begin as quality diagnostics rather than hard
requirements unless a governing extension standard or Registry contract
requires them.

Publish validates authored intent; it never guesses, fills, normalizes, or
rewrites a manifest to make the package eligible. The
[authoring model](authoring.md) owns what scaffolding may populate before this
gate.

## Non-responsibilities

Publish does not repair installed state, reconcile projections, change an
extension's local authority, treat local lint configuration as registry policy,
or infer publication intent from unpublished authored changes.

A configured workspace owner supplies an authoring default; it does not prove
the caller is authenticated or authorized to publish under that handle.

Remote registry effects are outside AXM's local rollback guarantee. Once an
immutable remote effect succeeds, a later local or remote failure cannot make
that effect unoccur.

Pack dependency inclusion is opt-in on both the root and pack-specific publish
surfaces. Registry dependency validation is unconditional: leaving a dependency
out of the local upload set never relaxes the pack's publication requirements.

Preview and apply report three separate layers: local selection decisions, the
Registry-admitted publication set, and execution outcomes. Preview is
speculative; apply reconstructs and validates its own set. Once admitted, packs
wait only for included dependencies they reference. A failed dependency blocks
those packs while independent candidates continue.

Delayed exact authorization is followed by one final material-fingerprint check
before the first upload. Drift abandons the authorized attempt without a remote
write. After the first upload, the captured archives execute without rereading
workspace content.

When execution partially succeeds, recovery uses the exact admitted identities
with existing-version integrity verification. It does not replay broad filters
or store archive bytes. Repeating recovery against unchanged content converges
to verified-existing no-ops. Publish writes no local receipt, lockfile,
baseline, or manifest after a successful upload.

## Testing strategy

Behavior tests prove complete-selection preflight, fixed-gate independence from
local lint policy, no upload before a failed preflight, truthful partial remote
outcomes, preservation of local authored content and workspace state, and
result parity between root and type-specific forms.
