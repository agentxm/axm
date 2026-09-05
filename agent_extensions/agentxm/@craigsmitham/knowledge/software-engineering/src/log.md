# Bundle update log

## 2026-09-02

- **Task interface**: Renamed Command execution strategy to [Designing a
  coherent repository task interface](/repository-task-interface.md), made its
  developer, agent, automation, and maintenance outcomes explicit, and recast
  task graphs and script boundaries as means to discoverable, safe, and
  trustworthy repository work.
- **Execution contract**: Added outcome-based target ownership and naming,
  declared-dependency and single-inventory rules, bounded alias and composite
  semantics, behavior-based cache guidance, explicit bootstrap boundaries,
  executable conformance, and a stepwise adoption workflow.
- **Source review**: Revised the task-interface model against official Nx,
  Turborepo, Gradle, Bazel, Buck2, Pants, moon, and just guidance plus primary
  build-systems literature. Replaced graph-target canonicality with one
  resolved semantic contract, added portable operation and selection terms,
  typed dependencies, launcher and host boundaries, cache trust and freshness
  semantics, behavioral conformance, and observable outcome signals.

## 2026-09-01

- **Packaging**: Added `@craigsmitham/packs/software-engineering` as an
  optional recommended pack. The pack installs only this standalone knowledge
  bundle.
- **Refactor**: Replaced the active topic-based review set with ten product-
  quality criteria lists for Suitability, Correctness, Reliability, Security,
  Safety, Efficiency, Usability, Compatibility, Evolvability, and
  Intelligibility. Each list contains ten stable-ID outcome questions with
  rationale, applicability, nearest-neighbor boundaries, sources, and
  list-level cross-cutting relationships.
- **Separation**: Added [Test-suite quality
  criteria](/codebase-review/supporting/test-suite-quality.md) as a supporting-
  artifact assessment. Product testability remains under Evolvability, while
  Assurance and Evidence retain the evidence-to-product relationship.
- **Review aids**: Added optional repository-evidence, scenario-analysis,
  verification-evidence, runtime-investigation, and model-assisted-review
  guides so inspection methods remain discoverable without entering the
  timeless outcome criteria.
- **Design review**: Added [Codebase-review framework design
  review](/codebase-review/framework-design-review.md), covering structural
  checks, six synthetic product forms, seven boundary challenges, design
  revisions, and unresolved risks. The result supports comparative trials, not
  a claim of field validation.
- **Replacement**: Removed the former ten topic checklists after the new
  framework was complete. The bundle intentionally carries no redirect,
  deprecated-stub, legacy-ID, or backward-compatibility layer.

- **Research**: Added [Cross-cutting concerns for software
  quality](/codebase-review/cross-cutting-concerns.md), a typed model with
  Claim context and Evidence as assessment envelopes around six singular
  concern families: Specification, Structure, Lifecycle integrity, Risk,
  Assurance, and Feedback. It defines a cross-cutting admission gate, explicit
  relationship types, a concern-by-pillar map, precise placement for testing
  and testability, and a comparative validation plan.
- **Research**: Added [Software quality
  pillars](/codebase-review/software-quality-pillars.md), a research-grounded
  candidate taxonomy of ten singular product-quality outcomes. It defines the
  assessed entity and outcome layer, records boundary tests and alternatives,
  and treats the current ten topics as migration evidence rather than a
  preservation constraint.
- **Methodology**: Separated product-quality outcomes from subqualities, design
  principles, engineering-system enablers, assurance mechanisms, and evidence
  contracts before refactoring the remaining checklists.
- **Research**: Added Test Desiderata and pstack as practitioner datapoints.
  Distinguished test-suite quality from product testability and product
  quality, and classified pstack's principles, review methods, assurance
  practices, and code-shape heuristics without promoting them into product
  pillars.
- **Creation**: Added [Maintaining codebase-review
  criteria](/codebase-review/maintaining-codebase-review-criteria.md) to keep
  durable quality outcomes separate from optional evidence, perspective, and
  inspection-method aids as the collection evolves.
- **Pilot**: Converted the then-current Testing and verification quality
  criteria into ten stable-ID,
  outcome-centered questions with explicit rationales as the collection's
  first vertical slice, then design-reviewed it against synthetic library,
  service, multi-package workspace, and interrupted-review scenarios.
- **Protocol**: Refocused [Reviewing a
  codebase](/codebase-review/reviewing-a-codebase.md) on reviewer use, added
  non-lossy assessment states and evidence fields, and routed checklist design,
  validation, and retirement to the maintenance guide.

## 2026-08-31

- **Expansion**: Broadened the bundle from execution-surface engineering to
  include [codebase review](/codebase-review/) while preserving the exclusions
  for change methods, requirements and architecture lifecycle, work items,
  documentation craft, and language or framework references.
- **Creation**: Added [Reviewing a codebase](/codebase-review/reviewing-a-codebase.md)
  and ten source-traced, `reporting-review` checklists for correctness,
  testing, module and API design, workspace configuration, code clarity, data
  contracts, dependencies, security, reliability, and performance.
- **Lifecycle**: Marked the review collection as source-reviewed candidates,
  not field-validated controls, and documented comparison, reviewer-agreement,
  misselection, false-completion, and retirement signals.

## 2026-08-29

- **Creation**: Re-established the bundle at a new scope — portable
  execution-surface engineering craft — after retiring v1.1.0's broader
  design-change and work-item scope. Added
  Command execution strategy, renamed in v2.3.0 to [Designing a coherent
  repository task interface](/repository-task-interface.md).
