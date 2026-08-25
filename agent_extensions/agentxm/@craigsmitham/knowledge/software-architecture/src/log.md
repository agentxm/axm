# Software architecture update log

## 2026-08-25

- **Profile 0.10.2 authority and witnesses**: Clarified that each accepted
  obligation has one normative Requirement authority while tests and
  evaluations may intentionally repeat its predicate as distinct witnesses;
  split evaluation definitions, executions, results, observations, and
  governance decisions without adding a representation migration.
- **Profile 0.10.1 requirement classification**: Clarified that type follows
  the primary accepted obligation rather than its source label, clause form,
  concern name, or verification technique; no type, field, or path migration
  is required.
- **Standards crosswalk**: Added an ISO/IEC/IEEE 29148 and ISO/IEC 25030
  crosswalk for functional, interface, performance, process, quality,
  human-factors, usability, and constraint concerns, including invariant and
  security boundary cases.
- **Focused type guidance**: Added practical functional, process,
  human-factors, and usability guides and expanded the quality and constraint
  guides so all six profile types have a focused procedure.
- **Human-centred boundary**: Added shared context-of-use guidance based on ISO
  9241-11 to distinguish usability outcomes from broader human capabilities,
  limitations, workload, safety, health, and environmental concerns.
- **Quality scope**: Expanded the quality foundation beyond product quality to
  distinguish quality in use, product quality, and data quality without
  forcing every concern into ISO/IEC 25010 product-quality metadata.
- **Profile 0.10.0**: Added the required root `System` concept and made
  `Requirement` the single accepted-obligation type with `requirement_id`,
  `requirement_type`, and explicit `subject`.
- **Subject-centered requirements**: Colocated requirements beneath their
  architecture subjects and organized them by functional, quality, process,
  human-factors, usability, or constraint type; recursive surfaces now support
  CLI command and subcommand navigation.
- **Traceability**: Defined optional `requirement_sources` and `derived_from`
  relations while keeping implementation and evidence backlinks out of the
  authoritative requirement model.
- **Consolidation**: Superseded Architecture Constraint, Product Quality
  Requirement, and top-level `constraints/` and `quality/` collections without
  compatibility aliases.
- **Verification boundary**: Kept requirements verifiable but removed
  verification-method metadata; evaluations reference stable requirement IDs
  and generated living documentation remains a projection.
- **Requirements engineering**: Added the iterative path from source concerns
  through analysis, requirement verification and validation, acceptance,
  architecture response, evidence, and controlled change.
- **Requirement quality**: Turned the nine individual characteristics into
  actionable review questions and repairs, distinguished them from product
  quality Requirements, and added synthetic weak-to-strong examples.
- **Set review**: Added bounded review for completeness, consistency, combined
  feasibility, comprehensibility, and ability to satisfy source needs without
  treating an open-world architecture corpus as a complete specification.
- **Standards lifecycle**: Pinned the guidance to ISO/IEC/IEEE 29148:2018,
  stated the narrower profile-conformance boundary, and added reassessment when
  a successor edition or requirements model is published.
- **Validation and example**: Extended the checker and synthetic corpus for the
  five-concept kernel, requirement colocation, quality metadata, derivation
  integrity, and removal of superseded representations.

## 2026-08-22

- **Focused authoring coverage**: Added dedicated guides for every profile
  `0.9.0` system-context, decision, and constraint type and linked each guide
  from the normative type definition and guide index.
- **Profile 0.9.0**: Required root System Lifecycle, System Ownership,
  Architecture Decision Policy, and System Assurance concepts; added
  conditional atomic Architecture Decision Record and Architecture Constraint
  collections; and prohibited overview, risk-driver, and constraint-set
  catch-alls from substituting for their owning concepts.
- **Reference and validation**: Migrated the synthetic conforming corpus to the
  required kernel and extended the structural checker for exact root paths,
  conditional decision and constraint collections, and the absence of
  `constraints.md`.
- **Profile 0.8.0**: Made OKF v0.2 and the software-architecture-docs profile
  the required representation contract for every Just Enough Architecture Docs
  corpus, limited local variation to profile-permitted choices, and preserved
  separate OKF and profile conformance results including `unknown`.
- **Pattern authority**: Clarified that Just Enough Architecture Docs supplies
  the philosophy, admission test, authority model, and maintenance discipline;
  it is not an alternative format to the profile that operationalizes it.
- **Validation**: Added a deterministic structural profile checker and retained
  named manual review for semantic requirements that executable checks cannot
  establish.

## 2026-08-21

- **Profile 0.7.0**: Required explicit root-index adoption language, exactly
  one containing C4 Software System for every C4 Container, and lawful access
  to the exact ISO/IEC 25010:2023 subcharacteristic vocabulary when applying
  Product Quality Requirement classification rules.
- **Reference corpus**: Added a complete, small synthetic corpus and a dated
  manual conformance report as inspectable profile evidence.
- **Architecture meaning**: Distinguished architecture from its descriptions,
  accepted desired architectural state from effective implemented
  architecture, and maintained prose from proposals and current evidence.
- **Maturity**: Made the bundle's agent-generated, draft, unverified state
  prominent and required actual review or independent evidence before
  promoting individual concepts.
- **Provenance**: Removed ambiguous source-author metadata and added the
  missing stable source identifier used by a footnote.
- **Profile 0.6.0**: Added `Product Quality Requirement` as the sole
  first-class product quality concept, classified under earned ISO/IEC
  25010:2023 characteristic and subcharacteristic paths.
- **Product quality model**: Replaced the abstract quality-concern progression
  with a SQuaRE-aligned distinction among quality needs, named accepted
  requirements, architectural responses, and assessment evidence; no Product
  Quality View is required.
- **Quality authoring**: Added one focused guide for a named,
  architecture-significant Product Quality Requirement with explicit target,
  conditions, consequences, authority, tradeoffs, and evidence route.
- **Quality authority**: Prohibited taxonomy-generated requirements, invented
  targets, shadow copies of external requirement authorities, empty quality
  collections, and agent-authored semantic change without accepted intent.
- **Profile 0.5.1**: Made material exclusions explicit for C4 Software System
  concepts, aligning the normative profile with the focused authoring guide;
  no path or metadata migration is required.
- **Profile 0.4.0**: Made human comprehension, semantic-delta authority,
  stable named concept identity, system lifecycle, stewardship, and review
  triggers explicit corpus-wide requirements with migration guidance.
- **Risk and authority**: Added a two-sided omission-versus-maintenance risk
  test and required agents to recommend semantic additions, reductions, or
  reorganizations unless the user authorizes that class and scope of change.
- **Progressive disclosure**: Replaced the complete-corpus tree with graduated
  minimum, first-concept, and growing-corpus examples; collections now appear
  with their first admitted named concept rather than beginning as plural
  catch-all files.
- **Realization evidence**: Strengthened guidance to link or generate current
  repository, structural, and runtime facts while architecture prose owns only
  their durable interpretation and consequences.
- **Invariant guidance**: Moved the conceptual invariant explanation into the
  foundations collection and consolidated repeated semantics there while
  retaining Expressing invariants as a focused authoring procedure.
- **Consolidation**: Removed the standalone boundaries, responsibilities,
  dependency-direction, and views concepts. The focused responsibility-review
  guide now owns the retained authority, state, information-hiding, and
  dependency tests; Just Enough Architecture Docs owns concern-driven view
  selection.
- **Behavior model**: Added goal-oriented behavior as the bridge from
  contextual actor goals to capabilities, surfaces, domain authority, C4
  responsibilities, selected scenarios, and executable evidence.
- **Profile 0.3.0**: Moved Use Case from `value/use-cases/` to top-level
  `use-cases/`, added its minimum behavioral contract, narrowed Feature
  admission, and strengthened dynamic-view scenario requirements.
- **Relationship semantics**: Defined author-facing cross-view relationship
  meanings while continuing to defer machine-readable relationship fields
  until a demonstrated consumer needs them.
- **Authoring guidance**: Expanded use-case authoring around subject boundary,
  contextual actors, goal scope, main success scenario, material extensions,
  progressive elaboration, and authority-aware evidence links.
- **Responsibility review**: Added a scenario-based review procedure covering
  abstraction, responsibility alignment, evolution, communication,
  information reachability, and data variation.
- **Creation**: Established a standalone software architecture bundle from the
  architecture material formerly maintained inside software engineering.
- **Foundations**: Consolidated domain-driven design, the C4 model, Wardley
  mapping, capabilities, offerings and value, and Jobs to Be Done into focused,
  complementary explanations.
- **Profile**: Added one software architecture docs application profile for
  offerings and value, capabilities, features, surfaces, DDD concepts, and C4
  elements and views under OKF v0.2.
- **Guides**: Added concise one-artifact guides for all 16 profiled concept
  types and one focused guide for progressively organizing an architecture
  docs corpus.
- **Organization**: Prescribed sibling classified-subdomain, bounded-context,
  and context-map collections; preserved C4 containment; and kept canonical
  concepts separate from selected views.
- **Cleanup**: Removed pre-release compatibility shims and replaced the broad
  application guide with the focused corpus-organization and concept-authoring
  guides.
- **Concept boundaries**: Made offerings and value the comparative authority
  for the demand-and-value family, narrowed capability and JTBD comparisons to
  their consequential neighbors, and documented when an architecture corpus
  needs a substantive boundary document instead of a larger index.
