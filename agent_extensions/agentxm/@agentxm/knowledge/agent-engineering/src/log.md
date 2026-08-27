# Agent engineering update log

## 2026-08-26

- **Generated-file boundaries**: Assigned runtime output, extension-root ignore
  rules, and release filtering separate responsibilities so independently
  distributed extensions do not assume consumer repositories ignore their
  generated files. Skill authoring and AXM guidance now verify those controls
  without duplicating the canonical resource policy.

## 2026-08-24

- **Evidence-calibrated instructions**: Distinguished interface conformity from
  demonstrated behavioral value, added minimal and absent-guidance baselines,
  component ablations, held-out cases, adjacent-task regressions, and separate
  outcome, compliance, trajectory, economy, and safety measures.
- **Repository guidance evidence**: Reconciled mixed empirical results across
  generated, static, efficiency-oriented, and failure-refined repository
  guidance, added unproven accretion as an audit finding, and made continued
  retention contingent on representative value without unacceptable cost or
  regression.
- **Instruction elements**: Added evidence-calibrated guidance for goal
  contracts, scope-wide invariants, examples, personas, tone labels,
  procedures, and formatting; narrowed negative examples to measured material
  boundaries and replaced emphasis escalation with failure diagnosis.
- **Roles and personas**: Separated responsibility-and-authority role contracts
  from presentation or simulation personas and rejected persona labels as
  evidence of expertise.

## 2026-08-22

- **Catalog and composition authority**: Clarified that an active catalog or
  observed cohort supplies routing, coexistence, and compatibility context but
  cannot create a dependency or required composition. Required collaboration
  needs independent package, host, or workflow authority, and collision
  findings belong to the smallest responsible surface.
- **Replaceable evaluation runners**: Defined explicit-runner precedence over
  an active configured default, selection-source attribution, disabled-source
  handling, no auto-discovery or fallback, and adapter-based evidence mapping
  for runners that do not reproduce a reference implementation's interface.
- **Evaluation runner engineering**: Added a portable runner pattern with a
  versioned protocol, capability-aware host and grader adapters, native-versus-
  proxy routing identity, declared/observed/verified/enforced controls,
  preflight without empty evidence, environment allowlists, atomic lifecycle,
  separate trials and retry attempts, resumability, enforced budgets, and
  deterministic summaries bounded to selected coverage.
- **AXM-aware extension guidance**: Reframed AXM as an extension-management
  layer independent of agent hosts, expanded its profile across extension
  types, workspace state, pack and plugin relationships, and lifecycle
  controls, and routed skill authoring, maintenance, and retirement through
  that profile. Governance deprecation, registry yanking, installed-state
  disabling, and workspace uninstall are now distinct operations.
- **Routing measurement**: Routing evaluations now measure a trigger rate over
  repeated attempts instead of a single verdict, require cases sized so that
  selection can vary at all, and require decision cases held out before a
  description is tuned against measured results. Case-realism guidance covers
  concrete detail, register variation, and near-miss negatives. The Claude
  profile records the observed under-selection behavior with the precision-first
  boundary that limits how far a description should widen in response.
- **Instrument observation**: Added measure discrimination across compared
  configurations, a grader channel for reporting defects in the suite itself,
  provenance-blinded judging with unblinded attribution as a separate second
  phase, and verification of the claims an output makes about its own work.
  Trial evidence now retains self-reported uncertainties and workarounds as
  observations that never move an outcome. Evaluation validity gains threat rows
  for uninformative task difficulty and non-discriminating measures.
- **Authoring generalization**: Skill maintenance now warns against fitting a
  revision to the small case set that motivated it, treats repeated improvisation
  across independent trials as evidence that the skill should own the work, and
  prefers stated reasons over escalating emphasis, with absolutes reserved for
  genuine invariants.
- **Agent-mediated UX**: Added round trips that leave the conversation — return
  paths, response semantics, artifact identification, and a degradation ladder
  ending in ordinary conversation — plus vocabulary calibration to an unknown
  reader, teardown of agent-created resources, artifacts presented before the
  agent's own assessment at a review gate, and honoring a promised check-in
  cadence for background work.

## 2026-08-21

- **Evaluation evidence lifecycle**: Added portable guides for managing
  evaluation source, generated runs, and promoted decision evidence and for
  evaluating Agent Skills through independent routing and activated-execution
  stages. Added provisional repository layouts, isolation and retention rules,
  evidence tiers, and an explicit artifact lifecycle to evaluation governance.
- **Agent Skill authoring architecture**: Added a focused creation guide and
  moved candidate admission, routing, workflow contracts, package composition,
  host adaptation, interaction design, and proportional lifecycle guidance
  into the knowledge bundle. The coupled authoring skill now acts as a thin
  execution router over those concepts instead of duplicating their method.
- **Agent-mediated user experience**: Extracted portable interaction guidance
  for user-facing agent workflows: task-state translation, surface-independent
  interaction intents, proportional openings and progress, answerable
  questions, authority-aware gates, evidence-led closeouts, and plain-text
  degradation. The guide distinguishes interaction choreography from harness
  rendering, prompt presentation contracts, human-control policy, and agent
  experience; the glossary now records that distinction.

## 2026-08-17

- **Consolidation**: Merged the `context-engineering`, `eval-engineering`,
  `harness-engineering`, `prompt-engineering`, and `skill-engineering` bundles
  into this one. Prompts, context, harness, skills, and evaluation are now
  sections of a single body of knowledge rather than separately installable
  bundles, so no reader has to decide which bundle owns a question before
  asking it.
- **Boundaries**: Collapsed the four bundle-boundary concepts —
  `agent-system-boundaries`, the prompt-engineering `boundaries` matrix,
  `context-engineering-boundary`, and `instruction-files-as-harness-elements` —
  into one `foundations/system-elements-and-boundaries` concept that assigns
  each concern to a surface within one system. Evaluation-versus-neighboring-
  practices and skill-versus-neighboring-elements survived as section material,
  since they distinguish this bundle's subjects from things outside it rather
  than from each other.
- **Vocabulary**: Merged the agent, evaluation, and harness glossaries into one
  `glossary`, resolving the duplicate definitions of agent, plan, context,
  evaluation, and trace, and dropping the "core disciplines" section that
  described the former bundle split.
- **Agent instruction files**: Reduced the three instruction-file concepts to one
  explainer and one guide. The general `context/instruction-files` explainer was
  roughly a lower-resolution copy of the repository one — same content taxonomy,
  same guidance-versus-enforcement paragraph, a weaker treatment of scope — so it
  was folded in and removed. Renamed both survivors to `agent-instruction-files`
  and `authoring-agent-instruction-files`, matching the vocabulary the
  `author-agent-instructions` and `audit-agent-instructions` skills already use,
  and placed them in the software-engineering domain where their AGENTS.md and
  CLAUDE.md subject matter belongs.
- **Structure**: Regrouped concepts into `foundations`, `agents`, `multi-agent`,
  `prompts`, `context`, `harness`, `skills`, `evaluation`, `trust`,
  `operations`, and `domains`. Evaluation concepts that had been distributed
  across bundles — agent, context, prompt, harness, and skill evaluation — now
  sit together in `evaluation`.
- **Compatibility routes removed**: Deleted the deprecated `glossary` route in
  agent engineering, the `glossary` route in evaluation engineering, all 19
  harness-engineering routes and the seven directories that held only them, the
  prompt-engineering `operations/eval-driven-development` route, and the
  skill-engineering `overview`, `design/progressive-disclosure`, and
  `evaluation/variance-baselines-and-grading` routes.
- **Document types**: Retired the non-Diátaxis `Guide` and `Playbook` types
  across all merged material. Concepts that inventory required decisions or
  coverage are Reference; those that argue judgment are Explanation; single
  linear procedures are How-to guides.
- **Naming**: Retitled how-to guides to the `How to …` form so procedure is
  distinguishable from description at the search surface.
- **Provenance**: Normalized `generated` to flow style and gave every concept a
  review horizon.

## 2026-08-15

- **Trust semantics**: Clarified across all merged material that lifecycle
  status, machine provenance, machine confirmation, and independent human
  review are distinct signals, and removed verification events that predated
  their current generated content.
- **Repository instructions**: Distinguished scope, applicability, composition,
  and precedence in the instruction-file explainer; added a portable guide for
  authoring and validating scoped repository instructions.
- **Human interaction surfaces**: Added the harness surface that renders
  questions, choices, and approvals to a person, its structured and plain-text
  forms, harness-owned label rendering, and surface selection as behavioral
  policy owned by the agent or skill layer.
- **Presentation contracts**: Made the identifier scheme for enumerated items a
  named contract field, and added the distinction between a template's fixed
  tokens and its fillable slots.
- **Decision support**: Added stable choice referents across a skill's turns and
  its pack siblings, explicit emission-surface selection between assistant text
  and a host question affordance, and grading for label-scheme and surface
  drift.
- **Degrees of freedom**: Extended per-surface strictness to per-token
  strictness within a template.
- **Portability**: Added the rule that a question, choice, or approval must
  stand as ordinary output, with a host prompting affordance treated as an
  optional rendering mapped onto the skill's own identifiers.
- **Platform profiles**: Added the current OpenAI `agents/openai.yaml`
  invocation-policy role and surface-specific explicit-invocation checks;
  replaced the authenticated AXM product homepage source with public
  architecture and CLI-help authorities.
- **Usage**: Replaced retired `axm knowledge open` examples with exact
  `axm knowledge concepts get` references.
- **Source traceability**: Connected two previously unused source notes to the
  claims they support.
- **Discovery naming**: Replaced generic or stale concept IDs and aligned root
  section labels with their canonical titles.

## 2026-08-14

- **Ownership**: Established `@agentxm` as the first-party identity for all
  merged material.
- **Agent engineering**: Established the behavioral-system discipline for
  agency choice, goals, loops, planning, tool and memory policy, human control,
  coordination, trust, reliability, evaluation obligations, and lifecycle.
- **Context engineering**: Extracted context from the broader harness domain and
  established context lifecycle, forms, quality, authority, progressive
  disclosure, instruction-file design, gardening, evaluation, memory,
  compaction, feedback, continuity, and repository and specification-authority
  specializations.
- **Prompt engineering**: Established prompt contracts, composition, examples,
  presentation contracts, prompt surfaces, eval-driven iteration, robustness,
  versioning, compatibility, injection defenses, and structural security
  boundaries.
- **Harness engineering**: Added independent classification axes for
  application domain, adaptation locus, ownership scope, interaction,
  execution, continuity, coordination, authority, and evaluation role so
  category names do not mix unrelated dimensions. Established coding harness as
  the software-engineering domain profile and repository harness as a
  first-class environment-side adaptation profile, and distinguished the agent,
  harness core, adapted environment, runtime substrate, orchestration plane,
  governance plane, agent platform, and evaluation harness by responsibility.
  Added first-class concepts for action and observation interfaces, runtimes
  and environments, state and continuity, feedback and verification, authority
  and containment, and whole-system evaluation.
- **Skill engineering**: Established the skill lifecycle, design, evaluation,
  trust, operations, and platform profiles; added presentation contracts,
  per-surface degrees of freedom, and a decision-support pattern separating
  balanced option comparison from a single proposed recommendation and explicit
  human choice; added a governance model covering admission, distributed
  ownership, enforceable capability boundaries, risk tiers, semantic
  versioning, change control, and portfolio coherence.
- **Evaluation engineering**: Established foundations, design, validity, and
  operations for evaluating variable AI systems, and centralized generic task
  sampling, trials, graders, baselines, uncertainty, and lifecycle guidance
  previously repeated in target-specific material. Expanded agent-evaluation
  identity and obligations to include goal contract, model, tools, memory
  policy, topology, autonomy, termination, recovery, trajectories, effects,
  interventions, safety, and cost.
- **Market terminology**: Treated assistants, copilots, digital workers,
  frameworks, platforms, scaffolds, and "AI OS" labels as product claims to map
  onto explicit axes rather than canonical architectural categories.
- **Provenance**: Synthesized modern agent surveys, practitioner guidance,
  classical agent-oriented engineering, human-AI interaction guidance,
  interoperability specifications, and current assurance sources.

## 2026-08-09

- **Trust**: Machine-confirmed all 16 then-stable harness concepts against their
  cited sources with `codex/gpt-5.6` and set a six-month freshness review date;
  human review remains a distinct, unclaimed trust signal.
- **Ownership**: Made knowledge concepts authoritative for context-gardening and
  repository-instruction finding classes so skills can focus on control flow
  without duplicating doctrine.
- **Specification practice**: Added spec-driven development as the umbrella
  software-engineering practice, separating its shared development loop from
  repository-specific authority and mutation choices, and added spec-first,
  spec-anchored, and spec-as-source as distinct models for specification
  persistence, human code editing, and durable change.
- **Pattern**: Added progressive disclosure as the reusable structure for
  advertising small routes and loading deeper context only when relevant.
- **Practice**: Added context gardening as the evidence-led maintenance cycle
  for repairing discovery, pruning noise, and promoting knowledge to the right
  harness element.
- **Vocabulary**: Added agent experience (AX) as an emerging lens distinct from
  harness engineering, and added agent legibility as the cross-domain quality of
  making task-relevant intent, state, capabilities, constraints, and feedback
  usable by an agent.
- **Scope**: Expanded the bundle from coding-agent concerns to harness
  engineering as a general discipline, with context as a core responsibility and
  coding harnesses as a software-engineering domain profile.
- **Migration**: Moved the bundle to the `@craigsmitham` namespace and paired it
  with the migrated `improve-instructions` skill.

## 2026-08-07

- **Creation**: Established the original harness-engineering bundle with
  instruction files.
