---
type: Guide
title: Documenting offerings
description: How to create one Offering concept that defines a coherent value boundary without turning it into a product, capability, or software hierarchy.
tags: [architecture-documentation, offerings, value, authoring]
status: draft
sources:
  - resource: ../foundations/offerings-and-value.md
    title: Offerings and value in software architecture
  - resource: ../architecture-documentation/software-architecture-application-profile.md#offering
    title: Software architecture docs application profile — Offering
generated: { by: codex/gpt-5.6, at: 2026-08-21T21:33:59Z }
---

# Documenting offerings

## Goal

Create one `Offering` concept under `value/offerings/` that names a coherent
unit of value intentionally made available to one or more audiences.

## Before you begin

Confirm that the value boundary is accepted and durable. Do not create an
offering merely to provide a parent for features, systems, or delivery work.
Current pricing, availability, roadmap, and campaign wording remain with their
live or commercial authorities.

## Steps

1. Name the offering in the language its audiences and maintainers recognize.
   It may be a product, service, platform, program, or shared facility.
2. Create its canonical file using the `Offering` type and common fields from
   the [application profile](../architecture-documentation/software-architecture-application-profile.md#offering).
3. State the coherent value made available and the circumstances in which it
   matters. Avoid describing only the software currently used to provide it.
4. Define its boundary and material exclusions. Say what adjacent products,
   services, operations, or outcomes it does not own.
5. Link consequential audiences, needs, jobs, propositions, use cases, and
   capabilities in prose. Keep those concepts in their own canonical files.
6. Link the accepted authority or evidence for the definition, then add the
   offering to `value/offerings/index.md` using its canonical title and
   description.

## Final check

- The document describes offered value rather than a feature collection.
- It does not imply that an offering is a C4 system or commercial product.
- Its exclusions prevent it from absorbing neighboring architecture views.
- Material relationships and evidence are explicit without copied inventories.

## Related

- [Offerings and value in software architecture](../foundations/offerings-and-value.md)
- [Organizing an architecture docs corpus](organizing-an-architecture-docs-corpus.md)
