# Gen Stack Update Log

## 2026-08-27

- **Gen Stack 0.25.0, Gen Stack skill 3.2.0, Plan skill 0.5.0, Sync Change
  skill 0.1.0, and pack 4.2.0 — host-neutral exact artifact synchronization**:
  Added one cross-cutting synchronization operation for exact Pitches, Change
  coordination records, Change Specifications, Change Designs, and
  implementation plans. It binds the exact source, selects one canonical home,
  maps through runtime-inspected host semantics, bounds mutations, protects
  concurrent work, reads persisted state back, and reports exact, faithful,
  drifted, or unverified fidelity. Explicit plan projection may create or
  update host-native implementation records from an exact plan revision while
  preserving the plan as canonical. Synchronization is not a lifecycle stage,
  artifact-authoring pass, acceptance action, or vendor workflow.

- **Gen Stack 0.24.0, Plan skill 0.4.0, Implement and Review skills 0.3.0,
  Gen Stack skill 3.1.0, Reviewer 0.1.0, and pack 4.1.0 — focused review
  feedback and integrated candidate assurance**: Added one fresh-context,
  read-only Reviewer for proportional Architecture, Requirements, Evaluations,
  and Implementation checkpoints during realization and a separate integrated
  final review. Plans disposition all four focuses and bind stable checkpoints;
  implementation dispositions every reviewer action and re-reviews stale
  claims. Review now separates Protocol coverage, adequacy, realization,
  evidence state, and bounded outcome, applies a whole-change integrity overlay,
  and emits an exception-based decision, ordered actions, findings, assurance
  summary, unknowns, and exact boundary. Reviewer judgment remains distinct
  from Protocol Results, semantic acceptance, and release authority.

- **Gen Stack 0.23.0, skill 3.0.0, Quick Change skill 0.1.0, and pack 4.0.0 —
  change-centered coordination and artifacts**: Replaced Change
  Specification and Bugfix Specification as parallel work-item roles with one
  Change coordination role. Change Specification now owns why and what; Change
  Design owns how; Bugfix classifies a Change whose explicit remedial purpose
  addresses established Defects. Added shared canonical Markdown fallbacks,
  action-relative readiness, and the combined `/quick-change` route while
  retiring the generic Specification and Bugfix Specification terms without
  reassigning their identifiers.

- **Gen Stack 0.22.0, Plan skill 0.2.0, and pack 3.2.0 — evidence-guided
  implementation planning**: Made planning sequence architecture-bearing
  boundaries, contracts, ownership, state, observability, and testability seams
  before dependent behavior except where compatibility, migration, safety, or
  atomicity creates a real dependency. Every required Requirement-satisfaction
  and Architecture-realization Protocol now receives an executable
  realization, earliest credible execution point, re-execution triggers,
  Result-driven control behavior, and final exact candidate-revision or
  observation-window exit evidence. Implementation uses those Executions as
  feedback throughout bounded realization rather than deferring them to final
  inspection. Human, integrated, operational, and windowed Evaluations retain
  their real preconditions, and Implementation-conformance Evaluations remain
  separate and delegated unless an accepted Design, policy, or assurance input
  requires them.

- **Gen Stack 0.21.0, skill 2.1.0, and pack 3.1.0 — shaping Pitches before
  specification and design**: Added Shape as the focused Orientation stage
  that turns raw or mixed change context into a bounded, repository-grounded
  Pitch. The Pitch captures problem or opportunity, intended outcome,
  appetite, boundaries, anticipated Gen Stack impact, an inline filesystem
  breadboard, rough response contours, risks, authority, and requested
  response. It remains provisional rather than becoming a fifth work item,
  governed concept, Specification, accepted meaning, selected Design, or
  implementation authorization. Added the `/shape` skill, proportional
  immediate/provisional/elicitation behavior, and explicit handoffs to
  research, investigation, specification, design, human decision, or no
  change. Made Shape and Specification explicitly agnostic about
  implementation-level Evaluations and tests. Specification now uses a
  complete human-ratifiable presentation contract, dispositions every affected
  Requirement and Architecture authority, and names exact
  Requirement-satisfaction and Architecture-realization Protocol semantics
  without selecting their realization. Design now compares alternatives before
  recommending, maps accepted Architecture to its technical realization,
  defines the executable realization of every required Protocol, and keeps
  optional Implementation-conformance Evaluations separate. The Gen Stack
  application profile remains `0.5.0` because governed concept paths, fields,
  and structural rules did not change.

- **Gen Stack 0.20.0 and pack 3.0.0 — change-realization operating model**:
  Added [Deciding and realizing bounded software
  changes](processes/deciding-and-realizing-software-changes.md) as the
  canonical Process and home of the operating-model diagram. Added a shared
  stage contract and focused Research, investigation, specification, design,
  planning, implementation, review, and shipping skills. Specification-first
  and design-first entry now converge at an explicit coherence gate;
  implementation and independent review may iterate; shipping requires a
  separate exact release authorization. Gen Stack orchestration records a
  proportional corpus disposition around each stage and routes accepted
  refinement, evidence maintenance, and compaction to their proper authorities.
  Research now owns bounded Research Brief framing and its fresh read-only
  Researcher while remaining independent of Gen Stack stage semantics; the
  separate Question skill and QRSPI pack are deprecated.

- **Interface-native Surface identity guidance**: Revised Surface development
  and authoring so an adopting System can establish and consistently apply an
  interface-native identity policy, such as one Surface per public CLI command
  path, without turning that example into a universal rule. Distinguished
  actor-visible commands, namespaces, routes, operations, and protocol methods
  from aliases, flags, modes, handlers, tests, and source-tree groupings;
  clarified parent, child, and Feature Requirement placement; and added
  native-interface inventory reconciliation without transferring desired-state
  authority to current implementation.

- **Gen Stack 0.19.1 — defect triage and investigation boundaries**: Factored
  defect handling so recording owns intake, triage owns report identity,
  classification, current applicability, lifecycle disposition, impact, and
  routing from available evidence, and investigation owns gathering and
  interpreting new diagnostic evidence, including selective reproduction.
  Added report age, evidence currency, later changes, and recurrence to triage
  without using age as a proxy for validity, impact, priority, or closure.
  Replaced repeated investigation procedure in triage with a bounded-question
  handoff and reduced the two Guides from 5,069 to 2,985 words.

## 2026-08-26

- **Purpose-relative work-item completion**: Centralized handoff,
  disposition, delivery, and verified-closure boundaries in the shared
  work-item lifecycle Guide; added a four-role completion comparison to the
  work-item index; gave each role concise next-action, verified-closure, and
  non-requirement criteria; renamed phase completion checks to exit criteria;
  and reduced role templates and repeated shared-guide instructions so host
  fields remain primary and role Guides contain only their distinctive delta.
- **Selective defect-report reproduction**: Revised [Triaging defect
  reports](work-items/triaging-defect-reports.md) so triagers preserve
  occurrences, form candidate groups, and then decide whether one bounded,
  safe, authorized, proportionate reproduction attempt could materially change
  identity, classification, impact, urgency, or routing before final
  relationship decisions. Required any attempt to preserve its conditions,
  revision, result, limitations, and disposition impact; clarified that failure
  to reproduce is bounded negative evidence and that reproduction is not a
  prerequisite for completing triage; and condensed the workflow from nine
  stages to seven.
- **Gen Stack 0.19.0, skill 1.10.0, and pack 2.11.0 — authority-gated
  adoption**: Replaced physical-authorship language and the blanket agent
  adoption refusal with separate semantic ratification, mutation authority,
  and execution responsibilities. Reduced the adoption Guide to Decide,
  Encode, and Verify-and-activate phases; centralized mechanical commands in
  the corpus tools; added a canonical read-only composite check for OKF,
  structural profile, and relationship projections; added exact working-tree,
  Git-index, and Git-revision inputs with the versioned `v1alpha3` contract;
  documented non-mutating pre-commit feedback and authoritative CI in
  [Integrating Gen Stack mechanical validation into repository
  workflows](profile/integrating-mechanical-validation-into-repository-workflows.md);
  and removed the repeated
  sync command from individual concept Guides. Named semantic review and
  coverage or fitness remain independent and unknown until their authorities
  establish them. Profile `0.5.0` is unchanged because governed paths, fields,
  and structural validation rules did not change.
- **Gen Stack 0.18.1 and skill 1.9.1 — exact software work-item taxonomy**:
  Clarified that the taxonomy contains exactly Operational Incident Record,
  Defect Report, Change Specification, and Bugfix Specification. Investigation
  is uncertainty-reduction activity, delivery is implementation activity and
  lifecycle context, host-native tasks remain outside the taxonomy, and
  title-and-summary revision is a cross-cutting operation. Renamed
  `work-items/change-specifications-and-delivery-work.md` to
  `work-items/change-specifications.md`
  and `work-items/preserving-design-and-delivery-context.md` to
  [`work-items/preserving-technical-context.md`](work-items/preserving-technical-context.md),
  updating corpus routes, skill instructions, and evaluation cases.
- **Gen Stack 0.18.0, skill 1.9.0, and pack 2.10.0 — Gen Stack briefs**:
  Added [Creating a Gen Stack
  brief](control-loop/creating-gen-stack-briefs.md), a reader-oriented Guide
  for explaining the bounded current state of a Gen Stack-adopted system
  through relevant stack lenses, assessing conformance, coverage, coherence,
  realization, evidence, and fitness without collapsing them, and offering
  proportionate next options without assuming decision or mutation authority.
  Added the memorable “brief me on” skill route and versioned routing and
  execution cases while retaining the read-only boundary.
- **Harness-assisted adoption coverage**: Updated [Adopting Gen
  Stack](adopting-gen-stack.md) to prefer harness-assisted Protocol Coverage
  derivation when repository tooling improves repeatability, while keeping
  scope selection with the adopting authority and separating coverage from
  Protocol adequacy, evidence, outcomes, assurance, and release readiness.
- **Possible-defect investigation**: Added [Investigating possible
  defects](work-items/investigating-possible-defects.md), a source-neutral
  Guide for gathering discriminating evidence, identifying the narrowest
  supported disposition, routing resulting work to its proper authority, and
  synchronizing source records while keeping investigation completion,
  report closure, correction, and verification independent.
- **Defect-report triage**: Added [Triaging defect
  reports](work-items/triaging-defect-reports.md), an evidence-bound Guide for
  relating, consolidating, splitting, escalating, and routing one or more
  Defect Reports while preserving occurrences, uncertainty, decision
  authority, and item-local batch outcomes.
- **Cross-stack incoherence diagnosis**: Added [Diagnosing and reconciling
  cross-stack
  incoherence](control-loop/diagnosing-and-reconciling-cross-stack-incoherence.md),
  a bounded Guide for diagnosing drift, missing meaning, contradictions, and
  Evaluation gaps without presuming which part of the stack is wrong. The
  workflow uses Evaluations as discriminating evidence, routes repairs to
  their canonical owners and authorities, and preserves partial, deferred, and
  unknown outcomes without introducing a standing Process or new governed
  concept.
- **Gen Stack 0.17.0 — policy-neutral evaluation candidates**: Added the
  read-only `evaluation-candidates` operation, machine contract
  `gen-stack-inspection/v1alpha2`, public synthetic example, and harness
  integration guidance. The projection derives eligible Requirement and
  Architecture role-and-target pairs, exposes active and retired Protocol
  matches, records retired-Requirement and C4 View exclusions, and limits
  Implementation discovery to Units already named by active Protocols. It
  explicitly does not select required coverage, judge Protocol adequacy,
  discover uncovered Implementation Units, bind Suites, execute evaluations,
  or establish evidence, outcomes, assurance, or release authorization.
  Profile `0.5.0` remains unchanged because the addition is a read-only
  projection, not a new governed corpus concept or field.
- **Gen Stack pack 2.9.0**: Advances the bundled knowledge dependency to
  `0.17.0` while retaining skill `1.8.0`; the harness integration is knowledge
  and inspection behavior and does not expand the skill's authoring authority.
- **Gen Stack 0.16.0 and profile 0.5.0 — governed Evaluation Protocols**:
  Replaced the required System Evaluation Approach with optional, durable
  Evaluation Protocols organized by `requirement-satisfaction`,
  `architecture-realization`, or `implementation-conformance`. Added
  role-specific targets, Protocol lifecycle, Case and Coverage semantics,
  three-axis reporting, executable validation, inspection projection, focused
  guidance, and a synthetic Pet Store example. `evaluations/index.md` remains
  required navigation; Suites, executable Cases, Executions, Results, Reports,
  and run evidence remain repository-native.
- **Stable evaluation vocabulary migration**: Made Evaluation Protocol the
  preferred label while retaining stable identifier `evaluation-definition`
  and the established relationship IDs whose meaning remains continuous.
  Retired System Evaluation Approach and redistributed its responsibilities to
  System, System Assurance, Protocols, Suites, Executions, Results, Reports,
  derived navigation, and work items.
- **Gen Stack skill 1.8.0 and pack 2.8.0**: Added governed Protocol authoring to
  established-corpus work, preserved the boundary against executable tests and
  evaluation runs, and revised behavioral cases for profile `0.5.0`.
- **Gen Stack 0.15.0 — corpus inspection plane**: Added a read-only reusable
  inspection library, task-oriented CLI, versioned JSON Schema, deterministic
  snapshots and comparison. Humans and harnesses can resolve governed concepts
  and Requirement IDs; inspect controlled relationship provenance; navigate
  Surface and C4 hierarchies; and request an `evaluation-context` projection
  containing direct Requirements, explicit cross-view mappings, and evaluation
  governance. The projection preserves unknowns and does not claim Requirement
  inheritance, physical Suite layout, Implementation realization, Evaluation
  coverage, satisfaction, or fitness.
- **Strict day-one adoption**: Added [Adopting Gen
  Stack](adopting-gen-stack.md), one workflow for greenfield and brownfield
  repositories that requires a complete accepted kernel, OKF and profile
  validation, and named semantic review at activation while reporting corpus
  coverage, Implementation realization, Evaluation coverage, satisfaction,
  and operational fitness separately. Clarified in the overview that gradual
  operationalization does not permit a partially conforming adopted corpus.
- **Gen Stack 0.14.0 — native-first representation**: Established the
  method-wide sequence from semantic role through native format, applicable
  profile, exact host mapping, and residual body content. Added an
  artifact-class mapping and a compact `Representation` contract to every
  Guide so independently authored artifacts converge on recognizable logical
  shape without a universal template, empty sections, duplicate facts, or
  invented persistence metadata. Clarified that the Gen Stack application
  profile is a delta over OKF v0.2 and that Guide body order adds no profile
  conformance.
- **Gen Stack 0.13.0 — controlled Requirement change**: Added a shared
  Requirement-change Guide that separates impact analysis from the actual
  desired-state delta and gives additions, revisions, retirements,
  replacements, splits, and merges consistent baseline, identity, authority,
  blocker, decision, canonicalization, and reconciliation treatment.
- **Gen Stack profile 0.4.0 — Requirement lifecycle and supersession**: Added
  required `active` and `retired` lifecycle, preservation and Provenance rules
  for retired Requirements, and successor-owned `supersedes` lineage with
  validator and relationship-projection enforcement. Supersession does not
  imply equivalence, derivation, satisfaction, or transfer of Evaluation
  evidence.
- **Gen Stack 0.12.0 — candidate Architecture and Requirement development**:
  Added one shared evidence-bound workflow and distinct Surface, C4 structure,
  and Requirement guides for greenfield and brownfield development. The
  guidance classifies missing, underdeveloped, misplaced, disputed, and
  contradicted meaning; tests Requirement subject placement against encounter,
  replacement, scope, structure, and authority; distinguishes inference from
  derivation; and records evidence, impact, options, recommendation, authority,
  and blocking status without treating candidates as accepted.
- **Cross-stack gap disposition**: Integrated the candidate workflow into
  Requirement-impact analysis, Defect Reports, Change Specifications, Bugfix
  Specifications, Change Design, scenario-based responsibility review, and
  bounded regeneration. Blocking gaps stop only dependent action; non-blocking
  gaps remain visible without creating ritual escalation, and missing
  documentation is not automatically classified as a Defect.
- **Gen Stack 0.11.0 — portable work-item foundations**: Added shared Guides
  for evidence and authority, identity and lifecycle, and metadata and labels;
  made the work-item index their canonical chooser; and refactored work-item
  type guidance to retain incident-, defect-, change-, and bugfix-specific
  meaning while referencing the common procedures.
- **Gen Stack profile 0.3.0 — fixed repository placement**: Prescribed
  `<repository-root>/gen-stack/` as the sole supported corpus location,
  retained `gen-stack/index.md` as the OKF and profile-adoption authority, and
  prohibited root placement, alternate-path configuration, scanning, and
  upward discovery. Profile tools now accept a repository root, default to the
  current directory, derive `gen-stack/`, report repository and corpus roots,
  and reject missing, misplaced, invalid, or boundary-escaping candidates.
- **Gen Stack profile 0.3.0 — explicit controlled relationships**: Added the
  producer-owned top-level `relationships` map with readable semantic roles,
  one authoritative assertion source, synchronized reciprocal endpoint views,
  domain, range, cardinality, and drift validation, and a deterministic
  round-trip synchronizer. Existing Requirement fields and selected canonical
  paths remain authoritative; peer-owned Implementation, Evaluation, Signal,
  Observation, Decision, and Action encodings remain outside the corpus
  contract.
- **Gen Stack 0.10.0 — human-governed development**: Made human or
  institutional ratification explicit for binding Intent, Requirements,
  Architecture, and related decisions. Agents may develop candidates and
  recommendations and may record explicitly accepted meaning, while meaning
  maturity remains separate from authority to act.
- **Focused method boundary**: Removed the YAGNI principle and Tidy First
  pattern, their collections, and their cross-links from the bundle. Their
  earlier presence remains recorded here as history rather than discoverable
  current guidance.
- **Gen Stack 0.9.0 — explicit documentation authority**: Established one
  four-role contract across the bundle: the glossary owns canonical semantics,
  profile `0.2.0` owns governed OKF representation, Explanations deepen
  understanding, and Guides support action. The profile now provides the
  canonical Understand and Author routes while remaining minimal; supporting
  documents conform and add no semantic or profile-conformance rules. No new
  explainer type or folder was introduced. The `author-gen-stack` and
  `setup-gen-stack` skills are versioned `2.2.0` with conflict-precedence
  evaluation cases.
- **Architecture and Requirements co-development**: Reframed the method's
  concept of operations, vocabulary, and profile so Intent shapes
  co-developed Architecture and Requirements. Architecture supplies the
  organizing subjects and response shape; Requirements own accepted
  obligations that test and constrain that shape; Evaluation Definitions
  guide realization and Executions assess Implementation without taking over
  either authority.
- **Gen Stack 0.8.0 — method-open requirement specification**: Kept
  individual-Requirement and set-quality criteria first-class, added guidance
  for selecting any proportionate method by semantic fit and authority
  clarity, retained EARS as one optional method, and added explicit treatment
  of external normative conformance. Profile `0.2.0` now governs durable
  representation rather than prescribing an authoring syntax; the
  `author-gen-stack` and `setup-gen-stack` skills are versioned `2.1.0`.
- **Bug and Defect corrective scope**: Defined Bug explicitly as the
  realized-system specialization of Defect, clarified that one Bug may
  implicate several additional Defects across Requirements, Architecture,
  Implementation, Evaluations, tests, and documentation, and allowed one
  Bugfix Specification to coordinate separately authorized changes addressing
  several related Defects without absorbing their authorities or Provenance.
- **Vocabulary identifier correction**: Renamed the Pace layer identifier from
  `pace` to `pace-layer` in [the vocabulary and relationship
  model](glossary.md). The preferred label and meaning are unchanged; the
  identifier now matches its label as every other vocabulary identifier does,
  and no consumer referenced the prior value.
- **Requirement classification encodings**: Kept the six canonical
  classifications in the glossary and their `requirement_type` encodings in
  the profile, including the explicit `human-factors-requirement` to
  `human-factors` mapping.
- **Glossary attribution**: Cited the declared ISO/IEC 25040, ISO/IEC/IEEE
  29119 series, and Chad Fowler evaluation sources in the Evaluations section
  footnotes, which previously declared them without attribution.
- **Gen Stack 0.7.0 and workflow 2.0.0**: Versioned the Knowledge bundle for
  the evaluation-profile contract and versioned `setup-gen-stack`,
  `author-gen-stack`, and `reconcile-gen-stack` for their required System
  Evaluation Approach behavior and evaluation-boundary regressions.
- **Evaluation model and adoption**: Added [Evaluation as bounded
  evidence](evaluations/evaluation-as-bounded-evidence.md), defined Evaluation
  Roles, Suites, and Reports, and added general, Surface, and C4 design guides.
  The draft profile now requires a governed System Evaluation Approach with
  subject- and Requirement-navigable evidence and distinct
  Requirement-satisfaction and Architecture-realization reporting while
  leaving concrete Definitions, Suites, Executions, Results, and Reports at
  repository-native authorities.
- **Bugs and corrective work**: Added [Bugs and bugfix
  specifications (`work-items/bugs-and-bugfix-specifications.md`) and writing
  bugfix specifications (`work-items/writing-bugfix-specifications.md`), defined
  Defect as a broad imperfection, Bug as concrete defective system behavior,
  kept Bugfix Specifications separate from provenance-bearing Defect reports,
  and gave their briefs distinct naming rules for observed discrepancies and
  authorized corrected behavior.
- **Specification vocabulary**: Defined Specification as a composition role
  whose constituents retain their canonical authority, distinguished its
  container from its content, defined Change Specification for bounded
  proposed or authorized system and Architecture change, and retained Bugfix
  Specification as its corrective specialization without requiring a new
  document type or corpus collection.
- **Change work items**: Replaced request-centered work-item guidance with
  [Changes](work-items/changes.md) and [Writing
  change specifications](work-items/writing-change-specifications.md), while
  keeping raw requests as Signals or source evidence until a candidate change
  has a recognizable boundary.
- **Change Design**: Defined Change Design as proportional technical reasoning
  for one bounded change, added guidance for developing it in conversation and
  capturing it in a work item, and deferred standalone repository documents
  until an explicit persistence lifecycle exists.
- **Profile simplification**: Retired the Just Enough Gen Stack pattern,
  corpus-organization guide, minimal-conformance reference, and synthetic
  example. The [Gen Stack vocabulary](glossary.md) remains the semantic
  authority, and the [Gen Stack application
  profile](profile/gen-stack-application-profile.md) remains the normative
  representation and conformance contract.
- **Control-loop cleanup**: Retired the redundant intent-to-feedback
  explanation, change-signal reconciliation guide, and change-signal Process.
  The [OODA control loop](control-loop/ooda-control-loop.md) retains the
  adaptive authority model, while [Analyzing Requirement
  impact](control-loop/analyzing-requirement-impact.md) retains bounded
  work-item intake guidance.
- **Action-document discovery**: Revised every Gen Stack Guide description to
  name the situation or intent that makes the guide relevant and the outcome
  it supports, then synchronized the descriptions into their enclosing
  indexes.
- **Process routing**: Required Process previews to expose their triggering
  condition and intended closing outcome, and kept Process triggers distinct
  from participant preconditions.
- **Work-item placement**: Promoted [Software work
  items](work-items/) from `control-loop/` to the top-level `work-items/`
  collection so durable case-record guidance remains distinct from OODA and
  from reusable Processes.
- **Principle and pattern collections (historical)**: Placed the YAGNI
  principle and Tidy First pattern in distinct top-level collections. Gen
  Stack 0.10.0 later removed both from the bundle.
- **Evaluation guidance consolidation**: Kept Evaluation identities and
  relationships in the [Gen Stack vocabulary](glossary.md), retained
  uncertainty and evaluator-failure handling in Signal reconciliation, and
  removed the redundant one-document `evaluations/` collection.
- **Pace and trust consolidation**: Expanded `Pace layer` and added `Trust
  gradient` in the [Gen Stack vocabulary](glossary.md), retained their
  application in OODA and bounded regeneration, and retired the underspecified
  standalone principle.
- **Process collection boundary**: Established top-level `processes/` for
  reusable Process definitions and authoring guidance, kept OODA and
  change-intake guidance in `control-loop/`, and gave principles and patterns
  distinct top-level collections.
- **Change-signal Process (retired)**: Defined `Reconcile a change signal` as
  a recommended standing Process for OODA reconciliation, then retired it
  during control-loop cleanup.
- **Adoption guide retirement**: Retired the standalone Gen Stack adoption
  ladder; the bundle overview retains its bounded-adoption guidance.
- **EARS requirement syntax**: Added an explanation of the Easy Approach to
  Requirements Syntax and a focused authoring guide for selecting, ordering,
  composing, and reviewing EARS clauses with synthetic Gen Stack examples.
- **Vocabulary authority**: Established the [Gen Stack vocabulary and
  relationship model](glossary.md) as the semantic authority for preferred
  terms, stable local identifiers, canonical relationship direction, domain,
  range, cardinality, and prohibited inference; narrowed the application
  profile to governed OKF representation, relationship encoding, recording
  location, and conformance.
- **Subject-first organization**: Reorganized the Knowledge bundle around the
  Gen Stack profile's semantic neighborhoods while keeping the bundle distinct
  from an instantiated profile corpus.
- **Cross-cutting governance**: Moved System, lifecycle, ownership, decision
  policy, and assurance authoring guidance into `governance/`.
- **Architecture colocation**: Replaced form-first Architecture `foundations/`
  and `guides/` shelves with Requirements, Decisions, Capabilities, Features,
  Surfaces, Domains, and C4 Structure collections.
- **Control-loop organization**: Consolidated OODA, feedback, Signal
  reconciliation, Process, and software work-item guidance under
  `control-loop/`.
- **Foundation retirement**: Colocated Requirement authority and Compaction
  with Architecture Requirements and Implementation respectively; removed the
  generic root `foundations/` collection.
- **Gen Stack profile 0.1.0**: Replaced the architecture-specific application
  profile with the clean `gen-stack` identity and canonical `intent/` and
  `architecture/` namespaces.
- **Cross-cutting root governance**: Defined System, Lifecycle, Ownership,
  Decision Policy, and Assurance as root-scoped context and governance rather
  than members of Intent or Architecture.
- **Repository-native peers**: Kept Implementation, Evaluations, Signals,
  Observations, Feedback, and results in the shared vocabulary and relationship
  model while excluding their artifact collections from the corpus profile.
- **Workflow identities**: Replaced the architecture-specific author, setup,
  and reconcile skills with `author-gen-stack`, `setup-gen-stack`, and
  `reconcile-gen-stack` without aliases or compatibility paths.
- **Process concept**: Defined Process as a distinct, bounded,
  outcome-oriented model of coordinated work, with explicit boundaries from
  work items, workflows, procedures, practices, Capabilities, Process
  Requirements, and OODA.
- **Process authoring**: Added [Defining a
  Process](processes/defining-a-process.md), including an adaptable
  process-definition template for value, authority, events, activities,
  resources, work-item participation, measures, and views.
- **Process provenance**: Recorded the Business Process Manifesto as a
  conceptual source for an original Gen Stack synthesis without reproducing
  its text, worksheet, or diagram.
- **Knowledge consolidation**: Moved the complete software-architecture and
  software-engineering corpora, architecture profile validator, synthetic
  example, work-item guidance, and the then-current YAGNI principle and Tidy
  First pattern into Gen Stack as one canonical, locally cross-referenced
  knowledge authority. Gen Stack 0.10.0 later removed both named topics.
- **Package retirement**: Removed the legacy project-authored pack and
  knowledge package roots after preserving their published-version migration
  guidance in the Gen Stack pack and their source history in version control.
- **License continuity**: Changed Gen Stack knowledge to CC-BY-SA-4.0 to
  preserve the reciprocal licensing of the consolidated knowledge packages.
- **OODA control model**: Adopted Observe, Orient, Decide, and Act as the
  adaptive control loop governing learning and repair across Gen Stack
  authorities without making them additional artifact layers.
- **Signal and Observation boundary**: Defined Signals as indications requiring
  attention and Observations as contextual evidence, both outside
  human-oriented Intent.
- **Self-healing flow**: Reorganized signal reconciliation around evidence-bound
  Orientation, an authorized repair hypothesis, bounded Action as a test, and
  closure evidence returned to Observe.
- **Attribution**: Recorded John R. Boyd's *The Essence of Winning and Losing*
  as the source of the adapted OODA semantics without reproducing its briefing
  or diagram.

## 2026-08-25

- **Update**: Defined Requirements as canonical accepted obligations derived
  from Intent and assigned to exactly one eligible Architecture subject;
  removed Offering and every other Intent concept from the subject set.
- **Update**: Removed raw Intent as a direct Compilation input and replaced the
  ambiguous `Compilation targets Architecture` wording with Architecture
  constraining Compilation into Implementation Units.
- **Update**: Replaced Realization as a peer-layer noun with Implementation,
  split Evaluation into Definition, Execution, and Result throughout the
  feedback loop, and standardized replacement scope on Implementation Unit.
- **Update**: Revised signal reconciliation as human-governed self-healing that
  repairs the first incoherent authority, establishes a missing Architecture
  subject before Requirement placement, and preserves human gates for accepted
  meaning.
- **Update**: Added a controlled relationship model to the [Gen Stack glossary](glossary.md), with canonical directions, derived inverse readings, cardinalities, authoritative recording locations, and prohibited inferences across authority, realization, evidence, and architecture views.
- **Update**: Clarified Compilation as the transformation that produces an
  Implementation, Architecture and its Requirements as the mostly human-authored
  constraining contract, and Implementation as the materialized output.
- **Update**: Added Evaluation, Evaluation Definition, Evaluation Execution, and Evaluation Result as a top-level glossary section between Architecture and Implementation, preserving Evaluation as a peer authority rather than part of Architecture.
- **Update**: Moved Subdomain under Intent in the [Gen Stack glossary](glossary.md) as a problem-space concept while retaining Bounded Context and Context Map under Architecture as model-authority and relationship concepts.
- **Update**: Reorganized the [Gen Stack glossary](glossary.md) around Intent, Architecture with subject-colocated Requirements, Implementation, and the Gen Stack method, and defined Implementation and Implementation Unit without introducing a separate grain concept.
- **Update**: Expanded the [Gen Stack glossary](glossary.md) to cover the then-governed architecture-profile concept types, grouped Value concepts flat under Intent, and documented the eligible Requirement subjects. This predates the clean `gen-stack` profile.
- **Addition**: Added the [Gen Stack glossary](glossary.md), a minimal reference for the method's load-bearing terms, actor-facing Surfaces, and governed C4 architecture concepts.
- **Addition**: Added a human-governed change-signal diagnostic and
  repair-recommendation flow, later retired during control-loop cleanup.
- **Creation**: Established the Gen Stack method, its authority and evidence boundaries, Requirement-impact workflow, evaluation semantics, bounded-regeneration guidance, and adoption ladder.
