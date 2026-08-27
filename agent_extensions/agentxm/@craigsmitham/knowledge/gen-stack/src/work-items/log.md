# Software engineering update log

## 2026-08-26

- **Exact four-role taxonomy**: Made Operational Incident Record, Defect
  Report, Change Specification, and Bugfix Specification the exhaustive Gen
  Stack software work-item taxonomy. Investigation is activity, delivery is
  implementation context, host-native planning records remain outside the
  taxonomy, and title-and-summary revision is cross-cutting. Renamed
  `change-specifications-and-delivery-work.md` to
  [`change-specifications.md`](change-specifications.md) and
  `preserving-design-and-delivery-context.md` to
  [`preserving-technical-context.md`](preserving-technical-context.md).
- **Possible-defect investigation**: Added [Investigating possible
  defects](investigating-possible-defects.md), a source-neutral Guide that
  turns prompts, alerts, feedback, Defect Reports, Evaluation Results, and
  cross-stack Signals into bounded evidence gathering, honest dispositions,
  authorized routes, and verified source-system synchronization without
  presuming a Bug or corrective authority.
- **Defect-report triage**: Added [Triaging defect
  reports](triaging-defect-reports.md) to produce evidence-backed dispositions
  and next routes across duplicates, overlaps, splits, escalations, unresolved
  expectations, and batch handling without turning triage into diagnosis,
  priority, or corrective authority.
- **Common Requirement-change guidance**: Added [Specifying Requirement
  changes](specifying-requirement-changes.md) for additions, revisions,
  retirements, replacements, splits, and merges. Change and Bugfix
  Specifications now distinguish impact classification from an explicit
  desired-state delta, preserve identity and lineage, surface action-specific
  blockers, and route per-entry acceptance and downstream reconciliation.
- **Material meaning gaps in change work**: Defect Reports, Change
  Specifications, and Bugfix Specifications now raise missing,
  underdeveloped, misplaced, disputed, or contradicted Requirements, Surfaces,
  C4 structure, and Evaluation routes with evidence, impact, options,
  recommendation, authority, and blocking status. Intake can continue through
  an indeterminate expectation, while a Bugfix stops before dependent delivery
  when accepted corrected behavior or load-bearing Architecture is unresolved.
- **Common work-item guidance**: Added [Preserving evidence and authority in
  software work items](preserving-work-item-evidence-and-authority.md),
  [Maintaining work-item identity, relationships, and
  lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md),
  and [Managing work-item metadata and
  labels](managing-work-item-metadata-and-labels.md). The collection index now
  chooses artifact type and applicable common concerns, while type-specific
  Guides retain only their specialized workflow and templates.
- **Defect report guide**: Reorganized [Recording defect
  reports](recording-defect-reports.md) around a minimum reporting path,
  outcome-focused template, conditional enrichment, and lifecycle maintenance
  while preserving evidence, authority, safety, and verification boundaries.
- **Cross-stack Bugfix scope**: Clarified that a Bug is a realized-system
  Defect, that it may implicate several additional Defects across Gen Stack
  work products, and that one Bugfix Specification may coordinate changes for
  several related Defects while preserving separate authority and Provenance.
- **Change Specifications**: Replaced request-centered work-item guidance with
  [Change specifications](change-specifications.md) and [Writing change
  specifications](writing-change-specifications.md); raw requests remain
  Signals or source evidence until a candidate system or Architecture change
  has a recognizable boundary and explicit authority state.
- **Bugs and corrective work**: Added an explainer and authoring guide for
  Bugfix Specifications, defined the boundary from Defects, Defect reports,
  and Bugs, required separate identities so corrective work cannot erase the
  originating report's Signal and Provenance, and distinguished
  observation-facing Defect-report titles from correction-facing Bugfix
  titles.

## 2026-08-25

- **Gen Stack composition**: Made the Gen Stack pack the recommended entry
  point and connected work-item guidance to its single authoritative
  Requirement-impact analysis rather than duplicating that classification in
  every artifact guide.

## 2026-08-24

- **Originating evidence**: Strengthened defect-report provenance so multiple
  occurrences remain individually traceable and monitoring-sourced reports
  retain canonical occurrence identifiers and controlled-access links without
  copying unsafe raw evidence.

## 2026-08-21

- **Operational incidents**: Distinguished impact, service, response,
  understanding, and follow-up state; expanded the live-record guide with
  safe channels, response surfaces, scalable roles, objectives, actions,
  communications, acknowledged handoffs, exit criteria, closure validation,
  and progressive coordination and transition fields.
- **Defect reports**: Reframed defect guidance around reported anomalies,
  static and dynamic evidence, classification, resolution, verification, and
  safe progressive intake; renamed the explainer to [Failures, defects, and
  defect reports](failures-defects-and-defect-reports.md) and the
  guide to [Recording defect reports](recording-defect-reports.md).
- **Source requests**: Reframed request intake around attributable source
  occurrences, normalized analysis, Requirements, and delivery authority. The
  later Change Specification guidance now preserves that material as source
  context without treating raw intake as a first-class change work item.
- **Scope**: Removed software architecture guidance so this bundle now focuses
  on evidence-timed design change and context-rich software work items.

## 2026-08-20

- **Architecture docs**: Added scale-neutral capability, feature, surface,
  domain-context, C4 structural, strategic-evolution, and architecture-doc
  organization guidance for progressive, explicitly related architecture
  views.
- **Work items**: Added [Preserving technical context in software
  work items](preserving-technical-context.md), connected
  it to Defect Report and Change Specification authoring, and clarified that brief limits
  never justify trimming supplied technical context.

## 2026-08-15

- **Architecture documentation**: Added the candidate Just Enough Architecture
  Docs pattern and Applying Just Enough Gen Stack guide for
  preserving durable functional, quality, and structural meaning without a
  parallel prose specification.
- **Quality concerns**: Added quality-characteristic guidance to connect
  quality vocabulary to contextual requirements, scenarios,
  architecture significance, and proportionate evidence.
- **Work items**: Added the cross-cutting pair [Work item titles and
  summaries](work-item-titles-and-summaries.md) and [Titling and
  summarizing work items](titling-and-summarizing-work-items.md),
  and gave each type-specific guide a `Summary` section, a pointer from its
  titling step, and a final-check bullet.
- **Work items**: Added paired explainers and guides for operational incident
  records, software Defect Reports, and change work under
  [Software work items](index.md).
- **Principles and patterns (historical)**: Reframed YAGNI as a principle of
  timing, optionality, and deferred commitment, and added Tidy First as its
  related just-in-time structural-change pattern. Gen Stack 0.10.0 later
  removed both from the bundle.
- **Expansion**: Broadened invariant guidance beyond architectural guardrails
  and added a paired invariant-authoring guide.
- **Creation**: Established the bundle with architecture guidance and the
  then-current YAGNI material, which Gen Stack 0.10.0 later removed.
