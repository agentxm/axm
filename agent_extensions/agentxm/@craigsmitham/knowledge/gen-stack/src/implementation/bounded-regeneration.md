---
type: Guide
title: Bounded regeneration
description: Use when considering regeneration of replaceable Implementation Units; make regeneration earn trust through conservation boundaries, operational memory, and rollback.
tags: [regeneration, replacement, deletion-test, data, contracts, rollback, operational-memory]
generated: { by: "codex/gpt-5.6", at: "2026-08-26T20:07:37Z" }
---

# Bounded regeneration

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Treat regeneration as an earned property of a bounded Implementation Unit or
coordinated set of Units, not as a synonym for generating more code.

## Representation

Keep Implementation in repository-native code, schemas, configuration,
manifests, generated files, and ownership or provenance mechanisms. Use their
native identifiers and dependency, generation, test, and rollback fields
before adding any Gen Stack context. A regeneration plan or report should then
present only residual scope, conserved authorities, writable boundary,
evidence, recovery, decision state, and gaps. Do not wrap Implementation Units
in OKF, duplicate executable configuration in prose, or let a generated report
become the owner of current realized state.

Before replacing or regenerating an Implementation Unit:

1. Identify the accepted Requirements, public contracts, persistent data,
   security and compliance boundaries, and operational envelope that must be
   conserved.
2. Extract knowledge that exists only in implementation behavior, incidents,
   runbooks, or experienced maintainers. Classify observations separately from
   accepted Intent. When the evidence suggests a missing, underdeveloped, or
   misplaced Surface, C4 responsibility, or Requirement, use [Developing
   candidate Architecture and
   Requirements](/architecture/developing-candidate-architecture-and-requirements.md)
   and preserve the result as candidate meaning.
3. Establish diverse evaluations for the conserved behavior and failure modes.
4. Bound the writable scope and dependencies of the replacement mechanism.
5. Make the change observable, containable, and reversible; define rollback
   against durable state rather than only source files.
6. Compare the new Implementation with its Requirements, Architecture, and
   evaluation evidence.
7. Compact the superseded Unit only after the replacement and recovery path
   are established.

For every material conservation gap, state its evidence, impact, candidate
options, recommendation, authority, and blocking status. A missing accepted
obligation or ownership boundary that is necessary to preserve data, public
contracts, safety, or recovery blocks regeneration of the dependent Unit. A
non-blocking documentation or Evaluation gap may proceed as visible follow-up
when accepted conservation meaning and a safe recovery path already exist.

Use a deletion test as a diagnostic: if an Implementation Unit disappeared,
could the system be rebuilt from retained Requirements, Architecture, data,
contracts, decisions, operational memory, and Evaluations without
rediscovering critical behavior in production? A failed deletion test
identifies missing conservation knowledge; it does not authorize
reconstructing that knowledge as accepted Intent, Architecture, or Requirements
without review.
