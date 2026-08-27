---
type: Guide
title: Documenting offerings
description: Use when a coherent value boundary needs identity distinct from product, Capability, or software hierarchies; create one Offering concept.
tags: [architecture-documentation, offerings, value, authoring]
status: draft
sources:
  - resource: offerings-and-value.md
    title: Offerings and value in software architecture
  - resource: ../profile/gen-stack-application-profile.md#offering
    title: Gen Stack application profile — Offering
generated: { by: codex/gpt-5.6, at: "2026-08-26T20:18:00Z" }
---

# Documenting offerings

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Offering` concept under `intent/offerings/` that names a coherent
unit of value intentionally made available to one or more audiences.

## Before you begin

Confirm that the value boundary is accepted and durable. Do not create an
offering merely to provide a parent for features, systems, or delivery work.
Current pricing, availability, roadmap, and campaign wording remain with their
live or commercial authorities.

An Offering is an Intent concept. It may source or shape a Requirement, but it
must not be used as the Requirement's `subject`; assign an accepted obligation
to the eligible Architecture concept that is actually obligated.

## Representation

Use the OKF envelope, the profile's exact `Offering` type and collection, and
profile relationship roles only when applicable. Present residual body meaning
in this preferred order: offered value, circumstances, boundary and
exclusions, consequential audiences and needs, Capability dependencies, and
evidence. Keep controlled edges in `relationships` and other OKF facts in
frontmatter; do not reproduce either as a body inventory. This order is
authoring guidance, not profile conformance.

## Steps

1. Name the offering in the language its audiences and maintainers recognize.
   It may be a product, service, platform, program, or shared facility.
2. Create its canonical file using the `Offering` type and common fields from
   the [application profile](../profile/gen-stack-application-profile.md#offering).
3. State the coherent value made available and the circumstances in which it
   matters. Avoid describing only the software currently used to provide it.
4. Define its boundary and material exclusions. Say what adjacent products,
   services, operations, or outcomes it does not own.
5. Explain consequential audiences, needs, jobs, propositions, and use cases in
   prose. Record each controlled Capability edge under
   `relationships.depends-on-capability`; do not author the reciprocal
   `supports-offering` role.
6. From the repository root, run `scripts/sync-gen-stack-relationships.py` so reciprocal
   views and any Requirement-source backlinks are current.
7. Link the accepted authority or evidence for the definition, then add the
   offering to `intent/offerings/index.md` using its canonical title and
   description.

## Final check

- The document describes offered value rather than a feature collection.
- It does not imply that an offering is a C4 system or commercial product.
- Its exclusions prevent it from absorbing neighboring architecture views.
- Material relationships and evidence are explicit without copied inventories.
- Relationship synchronization reports no changes.

## Related

- [Offerings and value in software architecture](offerings-and-value.md)
- [Gen Stack application profile for OKF v0.2](../profile/gen-stack-application-profile.md)
- [Gen Stack vocabulary and relationship model](../glossary.md)
