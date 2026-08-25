---
okf_version: "0.2"
---
# Software architecture

Portable, human-first guidance for durable architecture subjects and their
accepted requirements, value, behavior, quality, and structural meaning. Keep
the corpus as a concise semantic delta: repository-specific accepted meaning
belongs in its local architecture docs, while exact current implementation and
runtime facts remain with their authoritative or generated sources.

**Maturity:** Candidate. The concepts are agent-generated, `draft`, and not
recorded as human-verified. Use them for evaluation and adaptation until review
or independent use justifies promoting an individual concept.

## Start here

- [Software architecture overview](overview.md) - What software architecture owns, what it deliberately leaves to other authorities, and how it relates desired structure to current implementation.

## Boundaries, change, and confidence

- [Requirements engineering in software architecture](foundations/requirements-engineering.md) - How needs become accepted, subject-centered requirements that guide architecture and realization, and how statement quality, set quality, validation, verification, traceability, and evidence remain distinct.
- [Classifying requirements in software architecture](foundations/requirement-classification.md) - How to choose one primary profile requirement type from the obligation itself while using standards classifications as complementary lenses rather than competing authorities.
- [Human-centred requirements in software architecture](foundations/human-centred-requirements.md) - How usability and human-factors requirements overlap while preserving different primary outcomes, contexts, evidence, and architecture consequences.
- [Invariants, preservation, and enforcement](foundations/invariants-and-enforcement.md) - What makes a property invariant, how state and observation boundaries qualify its preservation, and how invariants relate to requirements, correctness, and enforcement.
- [Reviewing responsibilities with scenarios](guides/reviewing-responsibilities-with-scenarios.md) - How to exercise representative use-case scenarios against architectural elements to find misaligned responsibilities, change spread, coupling, authority violations, and misplaced data variation.

## Architecture models

- [Architecture foundations](foundations/) - Complementary explanations of requirements, classification, human-centred outcomes, value, behavior, quality, capabilities, invariants, domain meaning, structure, and strategic landscape.

## Requirements and quality

- [Documenting requirements](guides/documenting-requirements.md) - How to transform one accepted obligation into a subject-centered Requirement, review its engineering and wording, preserve rationale and traceability, and connect it to architecture and evidence.
- [Reviewing a requirement set](guides/reviewing-requirement-sets.md) - How to declare and review a bounded set of requirements for completeness, consistency, combined feasibility, comprehensibility, and ability to satisfy its source needs without treating an open-world architecture corpus as a complete specification.
- [Quality requirements in software architecture](foundations/product-quality.md) - How accepted system, product, service, and data quality outcomes become assessable, subject-centered Requirements that applicable quality models classify without generating obligations or owning evidence.
- [Documenting quality requirements](guides/documenting-product-quality-requirements.md) - How to engineer and document one accepted, assessable system, product, service, or data quality obligation using the unified Requirement model and an applicable quality classification.
- [Architecture guides](guides/) - Focused procedures for each profile requirement type and the other governed architecture concepts.

## Architecture documentation

- [Architecture documentation](architecture-documentation/) - The Just Enough Architecture Docs pattern and the OKF application profile that makes selected architecture concept rules independently checkable.
- [Organizing an architecture docs corpus](guides/organizing-an-architecture-docs-corpus.md) - How to organize a concise subject-first OKF architecture corpus with stable concepts and requirements colocated beneath their architecture subjects.
- [Software architecture docs application profile for OKF v0.2](architecture-documentation/software-architecture-application-profile.md) - The application profile for representing a system, its accepted requirements, context, decisions, value, behavior, boundaries, and selected architecture views in OKF v0.2.
- [Minimal conforming architecture corpus](architecture-documentation/minimal-conforming-architecture-corpus.md) - A complete synthetic OKF corpus and dated manual report demonstrating the smallest nontrivial adoption of the software architecture docs profile.
