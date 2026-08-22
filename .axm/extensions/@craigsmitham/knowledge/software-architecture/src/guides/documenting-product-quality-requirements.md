---
type: Guide
title: Documenting product quality requirements
description: How to create one named, architecture-significant Product Quality Requirement with an ISO/IEC 25010 classification, explicit target and conditions, architectural consequences, and an authoritative assessment route.
tags: [architecture-documentation, product-quality, quality-requirements, iso-25010, square, evidence, authoring]
status: draft
sources:
  - resource: ../foundations/product-quality.md
    title: Product quality in software architecture
  - resource: ../architecture-documentation/software-architecture-application-profile.md#product-quality-requirement
    title: Software architecture docs application profile — Product Quality Requirement
generated: { by: codex/gpt-5.6, at: 2026-08-22T00:17:07Z }
---

# Documenting product quality requirements

## Goal

Create one `Product Quality Requirement` concept whose accepted outcome and
architectural consequences cannot be inferred reliably enough from existing
authorities.

## Before you begin

Obtain lawful access to the exact ISO/IEC 25010:2023 product-quality
subcharacteristic names before selecting or validating a classification. This
bundle names the top-level characteristics for orientation but does not
reproduce the standard's complete copyrighted taxonomy.

Identify the proposed target, originating quality need, risk, obligation, or
use case, and the authority that accepts the requirement. Confirm that the
requirement passes the [Just Enough Architecture Docs admission
test](../architecture-documentation/just-enough-architecture-docs.md#apply-the-admission-test)
and materially constrains architecture. If another requirements or policy
system already owns the requirement, link it from the affected architecture
concept instead of creating a shadow copy.

## Steps

1. **Confirm accepted meaning.** Separate an accepted desired outcome from a
   stakeholder wish, observed implementation, unresolved target, risk, or
   proposal. Do not infer acceptance from code or current telemetry.
2. **Apply the architecture-significance test.** Name the responsibility,
   boundary, state, dependency, invariant, deployment choice, change property,
   or material tradeoff the requirement constrains. If none is durable and
   consequential, leave the requirement with its natural authority.
3. **Name the outcome.** Use a stable outcome phrase such as “Resume
   interrupted imports,” not a generic label such as “Reliability” or a
   numerical target likely to change.
4. **Choose the primary classification.** Select the most useful ISO/IEC
   25010:2023 characteristic and subcharacteristic. Create
   `quality/<characteristic>/index.md`,
   `quality/<characteristic>/<subcharacteristic>/index.md`, and the named
   requirement file only when admitting the first requirement at that path.
   Link consequential secondary classifications; never duplicate the concept.
5. **Create the canonical concept.** Use the `Product Quality Requirement`
   type and common fields from the [application
   profile](../architecture-documentation/software-architecture-application-profile.md#product-quality-requirement).
   Do not begin with a plural `quality-requirements.md` inventory or create
   empty ISO taxonomy directories.
6. **State target, conditions, and outcome.** Identify or link the system or
   constituent being qualified. State the event or operating conditions and
   the required response clearly enough for different readers to reach the
   same interpretation.
7. **Explain why it belongs in architecture.** Link the accepted need, risk,
   obligation, or use case and state the durable architectural consequences.
   Avoid cataloging the current implementation.
8. **Route assessment to its owner.** State an unambiguous assessment criterion
   or link the authoritative measure, target, test, benchmark, evaluation, or
   telemetry source. Do not copy volatile observations or invent a numerical
   target. Explain what the linked evidence establishes.
9. **Record material tradeoffs and relationships.** Link affected capabilities,
   use cases, bounded contexts, C4 elements, invariants, or other requirements
   only when the relationship helps a maintainer reason about change.
10. **Update navigation.** Add the canonical title and description to the
    immediate subcharacteristic index and make each new parent collection
    reachable from `quality/index.md` and the architecture root.

## Suggested body

Use this shape when the repository has no stronger local template. Omit empty
sections rather than preserving form for its own sake.

```markdown
# Resume interrupted imports

## Requirement

After a worker stops during an accepted import, the import resumes from its
last durable checkpoint without accepting a record twice.

## Context and target

- Target: Import execution capability
- Primary classification: Reliability / Recoverability
- Applies when: A worker stops after the system accepts an import and before
  that import reaches a terminal state.
- Justified by: Complete an accepted import use case; duplicate-acceptance risk

## Architectural consequences

- Checkpoint state has one declared authority independent of worker lifetime.
- Recovery preserves the accepted-record invariant across replacement workers.
- Worker-local progress cannot be the only recovery source.

## Assessment and evidence

- Recovery integration test — establishes resume behavior after worker loss.
- Accepted-record invariant — establishes the no-duplicate obligation.

## Tradeoffs

Durable checkpoints add write and storage cost; checkpoint frequency balances
that cost against repeated processing after failure.
```

## Final check

- The document represents one named requirement, not a characteristic summary
  or collection of peers.
- Accepted desired state is distinguishable from needs, risks, proposals,
  current implementation, and observed operation.
- The target, conditions, required outcome, primary classification, and
  architecture significance are explicit.
- The assessment route is unambiguous and owned by the appropriate source.
- Numerical targets and evidence results are linked rather than copied when
  another authority owns them.
- Additional classifications and architecture relationships use meaningful
  links rather than duplicate documents or folder containment.
- Every created collection contains admitted content and every index remains
  navigational.

## Related

- [Product quality in software architecture](../foundations/product-quality.md)
- [Just Enough Architecture Docs](../architecture-documentation/just-enough-architecture-docs.md)
- [Software architecture docs application profile for OKF v0.2](../architecture-documentation/software-architecture-application-profile.md)
- [Organizing an architecture docs corpus](organizing-an-architecture-docs-corpus.md)
