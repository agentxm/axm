---
type: Guide
title: Documenting bounded contexts
description: Use when a coherent domain model and language need explicit authority and boundaries; create one Bounded Context concept that declares them.
tags: [architecture-documentation, ddd, bounded-contexts, authority, ubiquitous-language, authoring]
status: draft
sources:
  - resource: /architecture/domains/domain-driven-design.md
    title: Domain-driven design
  - resource: /profile/gen-stack-application-profile.md#bounded-context
    title: Gen Stack application profile — Bounded Context
generated: { by: codex/gpt-5.6, at: "2026-08-27T01:11:07Z" }
---

# Documenting bounded contexts

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Create one `Bounded Context` concept under `architecture/domains/contexts/` that declares
where a domain model and its language apply consistently.

## Before you begin

Confirm a coherent model boundary with accepted purpose and authority. A code
folder, service, team, or database is evidence only when it actually realizes
that model; none establishes a bounded context by itself.

## Representation

Use the OKF envelope, the profile's exact `Bounded Context` type and
collection, and controlled relationships in their native roles. Present
residual body meaning in this preferred order: model boundary and authority,
responsibility, ubiquitous language and important distinctions, material
exclusions, dependencies or translations, modeled Subdomains, and evidence.
Do not turn a service inventory or reciprocal relationship list into a second
representation. This order is authoring guidance, not profile conformance.

## Steps

1. Name the context for the model understood by domain experts and
   maintainers, not for its current deployment unit.
2. Create its canonical file using the `Bounded Context` type and common fields
   from the [application profile](/profile/gen-stack-application-profile.md#bounded-context). Do not add `classification`.
3. State the context's purpose, model and ubiquitous-language scope, policy or
   state authority, and material exclusions.
4. Record each modeled Subdomain under
   `relationships.models-subdomain`, allowing many-to-many mappings without
   nesting the context beneath a Subdomain.
5. Link the context map that owns the complete inter-context relationship
   view; keep only the context's consequential local relationships here. Link
   accepted invariant and boundary Requirements colocated beneath this context
   or another eligible subject.
6. Treat Subdomain and Context Map reciprocal views as derived; do not author
   them independently.
7. Link code, schemas, configuration, tests, or architecture checks as current
   realization or conformance evidence, then update `architecture/domains/contexts/index.md`.

## Final check

- Purpose, model, language, authority, and exclusions are explicit.
- The context is not classified as core, supporting, or generic.
- Implementation structure is evidence rather than the definition.
- Inter-context obligations have one Requirement authority and are not copied
  from the Context Map.
- Relationship synchronization reports no changes.

## Related

- [Domain-driven design](/architecture/domains/domain-driven-design.md)
- [Documenting subdomains](/intent/documenting-subdomains.md)
- [Documenting context maps](documenting-context-maps.md)
