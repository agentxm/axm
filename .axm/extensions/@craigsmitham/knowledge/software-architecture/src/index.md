---
okf_version: "0.2"
---

# Software architecture

Portable, human-first guidance for the durable value, behavior, quality, and
structural meaning that a repository cannot reveal reliably by itself. Keep
the corpus as a concise semantic delta: repository-specific accepted meaning
belongs in its local architecture docs, while exact current implementation and
runtime facts remain with their authoritative or generated sources.

**Maturity:** Candidate. The concepts are agent-generated, `draft`, and not
recorded as human-verified. Use them for evaluation and adaptation until review
or independent use justifies promoting an individual concept.

## Start here

- [Software architecture overview](overview.md) - What software architecture owns, what it deliberately leaves to other authorities, and how it relates desired structure to current implementation.

## Boundaries, change, and confidence

- [Invariants, preservation, and enforcement](foundations/invariants-and-enforcement.md) - What makes a property invariant, how state and observation boundaries qualify its preservation, and how invariants relate to requirements, correctness, and enforcement.
- [Reviewing responsibilities with scenarios](guides/reviewing-responsibilities-with-scenarios.md) - How to exercise representative use-case scenarios against architectural elements to find misaligned responsibilities, change spread, coupling, authority violations, and misplaced data variation.

## Architecture models

- [Architecture foundations](foundations/) - Complementary explanations of offerings and value, Jobs to Be Done, goal-oriented behavior, product quality, capabilities, invariants, domain-driven design, the C4 model, and Wardley mapping as demand, behavioral, quality, semantic, structural, and strategic architecture views.

## Product quality

- [Product quality in software architecture](foundations/product-quality.md) - How ISO/IEC 25010 product quality characteristics classify accepted, assessable requirements whose consequences matter to architecture without creating a quality catalog or duplicating stronger authorities.
- [Documenting product quality requirements](guides/documenting-product-quality-requirements.md) - How to create one named, architecture-significant Product Quality Requirement with an ISO/IEC 25010 classification, explicit target and conditions, architectural consequences, and an authoritative assessment route.

## Architecture documentation

- [Architecture documentation](architecture-documentation/) - The Just Enough Architecture Docs pattern and the OKF application profile that makes selected architecture concept rules independently checkable.
- [Architecture guides](guides/) - Focused procedures for organizing an architecture docs corpus, creating one profiled concept, expressing an invariant, or reviewing responsibilities through representative scenarios.
- [Organizing an architecture docs corpus](guides/organizing-an-architecture-docs-corpus.md) - How to grow a concise, navigable architecture docs corpus while giving every admitted concept a stable named identity from its first appearance.
- [Software architecture docs application profile for OKF v0.2](architecture-documentation/software-architecture-application-profile.md) - The application profile for representing demand and value, goal-oriented behavior, product quality requirements, capabilities, interactions, domain architecture, and C4 structure in a set of OKF v0.2 software architecture docs.
- [Minimal conforming architecture corpus](architecture-documentation/minimal-conforming-architecture-corpus.md) - A complete synthetic OKF corpus and dated manual report demonstrating the smallest nontrivial adoption of the software architecture docs profile.
