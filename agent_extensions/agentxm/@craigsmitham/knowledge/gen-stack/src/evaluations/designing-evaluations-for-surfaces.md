---
type: Guide
title: Designing evaluations for Surfaces
description: Use when Surface behavior or realization needs evaluation coverage; define subject- and Requirement-navigable evidence without turning interaction hierarchy into a runner taxonomy.
tags: [evaluations, surfaces, requirements, usability, accessibility, interaction]
status: draft
sources:
  - resource: designing-evaluation-protocols.md
    title: Designing Evaluation Protocols
  - resource: ../architecture/surfaces/documenting-surfaces.md
    title: Documenting surfaces
---

# Designing evaluations for Surfaces

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

## Goal

Evaluate actor-facing behavior and the Implementation that realizes each
canonical Surface while preserving the Surface interaction hierarchy.

## Representation

Author governed Protocols using the profile and keep Suites, Executions,
Results, and Reports in their repository-native formats. Use the Protocol's
role-specific target field for Requirement IDs or Surface authority. Prefer
Case organization that follows the Surface interaction shape when useful, but
do not infer role or containment from a Suite folder.

## Steps

1. Select the narrowest Surface whose interaction boundary owns the claim.
   Use the parent only for behavior or quality that genuinely spans its
   children.
2. For `requirement-satisfaction`, reference the Surface-colocated Requirement
   IDs and derive the Surface subject from them. Derive scenarios from relevant
   Use Cases without making the Use Case, Case, or test the obligation authority.
3. Cover recognizable success behavior and material extensions, failures,
   recovery, trust transitions, accessibility, usability, human factors,
   compatibility, and operational conditions in proportion to consequence.
4. For `architecture-realization`, target the canonical Surface and assess
   whether the implemented encounter
   point preserves the Surface boundary, actors, exposed behavior, feature and
   Use Case mappings, trust boundary, and consequential accessibility or
   operational response.
5. Use the cheapest credible combination of examples, properties, protocol or
   contract checks, human studies, accessibility review, security analysis,
   and operational measures. Record the population, task, device, locale,
   assistive technology, or environment when it bounds the result.
6. Project Results through the canonical parent-child Surface navigation and
   by Requirement ID. Keep runner Suites organized for execution; do not infer
   Surface containment from their folders.
7. Report Requirement satisfaction separately from Surface realization.
   Expose uncovered children and `unknown`; passing child Surfaces do not by
   themselves prove a parent-level claim.

## Final check

- Each claim is attached to the narrowest responsible Surface.
- Actor-visible failures and quality conditions receive proportional coverage.
- Surface hierarchy drives navigation, not physical suite layout.
- Requirement satisfaction and realization reports remain distinct.
- Cross-Surface behavior is located at the narrowest common parent or linked
  explicitly across subjects.

## Related

- [Designing Evaluation Protocols](designing-evaluation-protocols.md)
- [Documenting surfaces](../architecture/surfaces/documenting-surfaces.md)
- [Goal-oriented behavior and use cases](../intent/goal-oriented-behavior.md)
