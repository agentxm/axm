# Gen Stack

Helps humans orient and develop bounded software change using the Gen Stack
knowledge bundle. It can develop candidate Intent, Requirements, Architecture,
and Change Design; create or revise software work items; record explicitly
accepted concepts; and guide or execute authority-gated adoption and migration.
The fixed `./gen-stack/` directory makes a corpus discoverable; its `index.md`
remains the authority for adoption.

The skill is deliberately a decision-support and authoring surface, not an
autonomous architect or product authority. It keeps meaning maturity separate
from permission to act, stops for human ratification of material desired-state
or Architecture decisions, and preserves the distinct authority of
Implementation and Evaluations.

Version `1.10.0` replaces the blanket adoption refusal with three independent
questions: who ratifies meaning, who authorizes mutation, and who executes.
After explicit ratification and mutation authority, a human or agent may encode
the corpus and deterministic tools may check it. Evaluation suite `1.10.0`
keeps named semantic review and coverage or fitness outside the mechanical gate.

Version `1.9.1` makes the software work-item route exhaustive: Operational
Incident Record, Defect Report, Change Specification, and Bugfix Specification
are the only Gen Stack roles. Investigation remains activity, delivery remains
implementation context, host-native tasks remain outside the taxonomy, and
title-and-summary revision remains a cross-cutting operation. Evaluation suite
`1.9.1` adds direct taxonomy and boundary cases.

Version `1.8.0` adds profile `0.5.0` Evaluation Protocol authoring for accepted
Requirement-satisfaction, Architecture-realization, and
Implementation-conformance claims. It keeps executable Cases and tests,
Suites, Executions, Results, Reports, and run evidence repository-native and
does not infer coverage or outcomes. Evaluation suite `1.8.0` exercises this
boundary and the role-specific Protocol representation.

Version `1.7.0` uses native-first representation for governed concepts and
repository artifacts, maps only to host fields with exact semantics, keeps one
owner per fact, and uses body fallbacks only for residual meaning. It also
makes fixed-corpus inspection an exact-path probe rather than repository
enumeration. Evaluation suite `1.7.0` covers governed OKF concepts, tracker
fields and fallbacks, derived views, transient Change Design,
repository-native evaluation machinery and Process artifacts, and deterministic corpus
discovery.

Version `1.6.0` makes the supersession evidence boundary explicit in activated
behavior: historical Evaluation Results remain bound to the predecessor
Requirement, Evaluation Protocol, Implementation revision, inputs, and
environment actually assessed, while successor satisfaction begins unknown.
Evaluation suite `1.6.0` tests that boundary without conflating it with corpus
mutation preconditions.

Version `1.5.0` makes coupled-knowledge resolution deterministic: source
workspaces use the exact `knowledge/gen-stack/src/` path and installed packs
resolve the declared knowledge sibling through AXM state, without filesystem
scanning. Evaluation suite `1.5.0` strengthens the valid fixed-corpus fixture
with the profile-defined Capability collection and distinguishes corpus-path
discovery from package-knowledge resolution.

Version `1.4.0` separates Requirement-impact analysis from Requirement-change
specification and routes additions, revisions, retirements, replacements,
splits, and merges through one common workflow. It preserves stable identity,
explicit `active` and `retired` lifecycle, supersession lineage, entry-specific
decisions and blockers, and non-transfer of historical evidence. Evaluation
suite `1.4.0` covers the operation matrix, representation-only maintenance,
missing authority and architecture, partial acceptance, stale baselines, and
Requirement-change routing.

Version `1.1.0` routes software work-item actions through shared evidence and
authority, identity and lifecycle, and metadata and label Guides. It keeps a
brief-only revision narrow, requires persisted readback for external writes,
and preserves item-local failures and unintended metadata changes in batch
results. Its evaluation suite is versioned `1.1.0` with explicit coverage of
those boundaries.

Version `1.2.0` detects missing, underdeveloped, misplaced, disputed, stale, or
contradicted meaning and routes material gaps through the shared candidate
workflow and only the implicated Surface, C4 structure, or Requirement guide.
Defect Reports and Bugfix Specifications raise those gaps with evidence,
impact, options, recommendation, authority, and blocking status. Blocking gaps
stop dependent mutation; non-blocking gaps allow truthful work to continue;
direct accepted authoring skips candidate ceremony. Evaluation suite `1.2.0`
covers greenfield, brownfield, placement, blocking, non-blocking,
direct-authoring, adoption-boundary, and `author-docs` collision behavior.

Version `1.3.0` makes `<repository-root>/gen-stack/` the only established-corpus
discovery path. It verifies `gen-stack/index.md` before corpus authoring, does
not scan or walk upward, and treats repository-root, alternate-path, and
undeclared candidates as unsupported or invalid without mutation. Evaluation
suite `1.3.0` materializes each placement state as a synthetic fixture.

Initial corpus setup, profile adoption, connection, federation, and migration
are intentionally unsupported. The skill recognizes those requests and stops
without mutation. It does not search for corpora at the repository root or in
alternate directories. Install it through the Gen Stack pack so the coupled
knowledge bundle is available.
