# Gen Stack

Opinionated software-change guidance combining shaping and OODA control with
human-oriented Intent, co-developed Architecture and canonical Requirements,
Compilation, Implementation, Evaluations, and operational learning.

## Scope

This bundle is the canonical knowledge authority used by the `gen-stack` pack.
It contains the complete Intent, Requirements, Architecture, work-item,
Implementation, Evaluation, and adaptive-control guidance formerly distributed
across the `gen-stack`, `software-architecture`, and `software-engineering`
knowledge packages. Its central rule is **one authority, many witnesses**:
accepted Requirements own desired-state obligations, while architecture,
implementations, tests, evaluations, and runtime observations retain their
different roles and may intentionally represent the same predicate.

Gen Stack is a human-governed development method. Agents can gather evidence,
surface tensions, develop alternatives, recommend responses, and draft
artifacts. Only the applicable human or institutional authority can ratify
Intent, Requirements, Architecture, or another binding decision. An agent must
keep a candidate's maturity separate from its authority to be acted on.

The authority and transformation model is influenced by Chad Fowler's
[The Generative Stack](https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/)
and the surrounding Regenerative Software series. The adaptive control model
applies John R. Boyd's OODA semantics from
[The Essence of Winning and Losing](https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf).
The shaping workflow is conceptually influenced by Ryan Singer and Basecamp's
[Shape Up](https://basecamp.com/shapeup/) guidance while adapting the Pitch and
breadboard to Gen Stack authority and repository impact. The documents here
are an original synthesis for this extension family; they do not reproduce
those sources' text, diagrams, or templates.

## Use

Install the complete method through:

```bash
axm install @craigsmitham/packs/gen-stack
```

Open `src/index.md` to browse the bundle or use AXM Knowledge concept search.
Use [Adopting Gen Stack](src/adopting-gen-stack.md) to establish a first
strictly conforming corpus from either greenfield intent or brownfield
evidence without claiming complete coverage, realization, or satisfaction.

An adopting repository places its one supported corpus at `./gen-stack/`.
The directory is the deterministic discovery location; `gen-stack/index.md`
must still declare OKF v0.2 and explicitly adopt the supported profile. The
repository root and alternate corpus paths are unsupported.

From this package directory, pass the adopting repository root explicitly:

```bash
scripts/gen-stack.py --repository-root <repository-root> status
scripts/gen-stack.py --repository-root <repository-root> check
scripts/gen-stack.py --repository-root <repository-root> check --view git-index
scripts/gen-stack.py --repository-root <repository-root> check --revision HEAD
scripts/gen-stack.py --repository-root <repository-root> evaluation-context
scripts/gen-stack.py --repository-root <repository-root> evaluation-candidates
scripts/sync-gen-stack-relationships.py <repository-root>
scripts/sync-gen-stack-relationships.py <repository-root> --check
scripts/validate-gen-stack-profile.py <repository-root>
```

When these scripts are available from the adopting repository, run them from
its root without a positional argument. They derive `./gen-stack`; they do not
scan upward or support a corpus-location override.

Humans and harnesses can use the read-only [inspection
tools](scripts/README.md) for concept lookup, Surface and C4 hierarchy,
directly associated Requirements, explicit cross-view relationships,
evaluation context, provenance, snapshots, and corpus-only comparison. The
CLI exposes a [versioned machine contract](scripts/contracts/README.md).

Python-based consumers should reuse `gen_stack_profile.InspectionPlane` or the
lower-level `inspect_repository(repository_root)` rather than reproducing
location, adoption, indexing, or relationship logic.

Synchronization edits only the producer-owned `relationships` block, preserves
unrelated frontmatter, and refuses to write when authoritative assertions are
malformed or contradictory.

Version `0.25.0` defines host-neutral synchronization for exact Pitches,
Change coordination records, Change Specifications, Change Designs, and
implementation plans. It requires one canonical home, exact-source binding,
bounded mutation, authoritative readback, and explicit fidelity results. Plan
projection into host-native implementation records is a separate authorized
operation; synchronization is not a lifecycle stage, semantic revision, or
vendor workflow.

Version `0.24.0` adds proportional focused Architecture, Requirements,
Evaluations, and Implementation review feedback during implementation plus a
fresh integrated final review. It defines stable checkpoint binding, action
disposition, re-review triggers, four separate assurance areas, a whole-change
integrity overlay, and an exception-based actionable result while preserving
the distinction among reviewer judgment, Protocol Execution, semantic
acceptance, and release authority.

Version `0.23.0` adopts Change as the durable coordination case, makes Change
Specification and Change Design sibling artifacts, classifies explicit
remediation of established Defects as Bugfix, retires the separate Bugfix
Specification and generic Specification terms, and defines shared canonical
Markdown fallbacks plus action-relative readiness.

Version `0.22.0` makes implementation planning evidence-guided. Plans now
sequence architecture-bearing prerequisites before dependent behavior, realize
required Requirement-satisfaction and Architecture-realization Protocols at
their earliest credible points, use repeated Executions as implementation
feedback, and retain exact candidate-revision Results as final exit evidence.
Implementation-conformance Evaluations remain separate and delegated unless an
accepted Design, policy, or assurance input requires them.

Version `0.21.0` adds Shape as a focused Orientation stage and defines its
provisional Pitch, adaptive elicitation behavior, anticipated cross-stack
impact, headingless filesystem breadboard, dispositions, and handoffs to
specification, design, research, investigation, or human decision. A Pitch is
not accepted meaning, a fifth work item, a Specification, selected Design, or
implementation authorization. Shape is agnostic about implementation-level
Evaluations and tests: it may anticipate Requirement/Architecture Protocol
meaning but does not project test artifacts as candidate changes.

Version `0.20.0` defines the canonical bounded software-change Process and its
operating-model diagram, introduces a common stage handoff and corpus-
disposition contract, and adds focused guidance for implementation planning,
implementation, independent candidate review, and authorized shipping. It
supports both specification-first and design-first entry while requiring
their artifacts to converge into coherent change definition before planning.
Specification now supplies a complete human-ratifiable Requirement,
Architecture, and semantic Evaluation Protocol delta without selecting test
realization. Design maps accepted Architecture to the technical response,
realizes each required Requirement/Architecture Protocol, and keeps optional
Implementation-conformance Evaluations separate.

Version `0.19.1` factors defect handling into three concise responsibilities:
recording preserves intake, triage decides report disposition and routing from
available evidence, and investigation gathers and interprets new diagnostic
evidence, including selective reproduction. Triage now assesses report age,
evidence currency, and current applicability without treating elapsed time as
proof of invalidity, low impact, low priority, or grounds for closure.

Version `0.19.0` adds the canonical non-mutating mechanical `check`, exact
working-tree, Git-index, and Git-revision inputs, stable `0`/`1`/`2` gate exit
semantics, and the `gen-stack-inspection/v1alpha3` machine contract. The
repository-workflow Guide recommends exact-index pre-commit feedback and
exact-revision CI enforcement while keeping semantic review, coverage,
fitness, mutation, and release authority separate. Profile `0.5.0` is
unchanged because no governed corpus representation rule changed.

Version `0.17.0` adds a policy-neutral `evaluation-candidates` inspection
operation and harness-integration guidance. The projection derives eligible
Requirement-satisfaction and Architecture-realization role-and-target pairs,
shows explicit Protocol matches and exclusions, and exposes only
Protocol-declared Implementation Units. It leaves candidate selection,
required coverage, Protocol adequacy, executable realization, evidence,
outcomes, assurance, and release policy to their proper adopting authorities.
The machine contract advances to `gen-stack-inspection/v1alpha2`; profile
`0.5.0` is unchanged because no governed corpus type or field was added.

Version `0.16.0` introduces profile `0.5.0` and governed Evaluation Protocols
for Requirement satisfaction, Architecture realization, and Implementation
conformance. It retires the System Evaluation Approach, keeps
`evaluations/index.md` as navigation, and leaves executable Cases, Suites,
Executions, Results, Reports, and run evidence repository-native. The profile
validator and inspection plane now enforce and project Protocol identity,
lifecycle, role, targets, and required assessment structure without claiming
coverage, evidence currency, outcomes, or assurance.

Version `0.15.0` adds the read-only Gen Stack inspection plane: one reusable
profile index behind a task-oriented CLI, versioned machine contracts,
direct-Requirement Surface and C4 evaluation context, controlled relationship
provenance, deterministic snapshots, and corpus-only comparison. It does not
add peer-owned Implementation or concrete Evaluation mappings.

Version `0.14.0` establishes one native-first representation policy across the
method: establish Gen Stack meaning, use the artifact's native format, apply an
applicable profile as a delta, map only to exact host semantics, and add the
smallest residual body content. Every Guide now states its native target and
preferred logical presentation while omitting empty content, duplicate fields,
and false persistence metadata. The OKF profile remains `0.4.0`; the update
clarifies its relationship to OKF and does not add style-only conformance. It
also adds one strict day-one adoption workflow for greenfield and brownfield
repositories while keeping corpus coverage, realization, satisfaction, and
fitness separate from conformance.

Version `0.13.0` adds the shared Requirement-change workflow and profile
`0.4.0` lifecycle contract. Canonical Requirements are explicitly `active` or
`retired`; additions, revisions, retirements, replacements, splits, and merges
share one identity, authority, blocker, and reconciliation model; and
successors preserve many-to-many lineage through `supersedes` without
transferring meaning or Evaluation evidence. The profile validator and
relationship synchronizer enforce lifecycle and supersession integrity.

Version `0.12.0` adds a shared candidate Architecture and Requirements
workflow with distinct Surface, C4 structure, and Requirement specializations
for greenfield and brownfield work. It separates evidence extraction and
candidate development from canonical accepted authoring, makes misplaced
Requirement subjects reviewable through load-bearing placement tests, and
integrates actionable blocking and non-blocking meaning-gap dispositions into
work items, Change Design, scenario review, and bounded regeneration.

Version `0.11.0` consolidates portable work-item evidence and authority,
identity and lifecycle, and metadata and label concerns into shared Guides.
The work-item index now chooses both the semantic artifact and the smallest
applicable common-guide set. The current model further consolidates corrective
work into Change with Bugfix classification and shared Change Specification and
Change Design contracts.

Version `0.10.0` made human ratification explicit throughout the method,
removed the YAGNI and Tidy First guidance, and introduced Gen Stack profile
`0.3.0`. The profile prescribes `./gen-stack/` as the sole supported repository
location and records controlled corpus relationships under top-level
`relationships` maps with one authoritative assertion and synchronized
reciprocal views. The glossary remains the semantic authority. Explanations
deepen understanding, Guides support action, and neither adds semantic or
profile-conformance rules. Concrete Evaluation Definitions, Suites,
Executions, Results, and Reports remain repository-native.

## License

The package is licensed under `CC-BY-SA-4.0 AND MIT`. Files under `src/` are
licensed under CC-BY-SA-4.0, preserving the reciprocal license previously
declared by the consolidated software-architecture and software-engineering
knowledge packages. Original files under `scripts/` are licensed under MIT.
Referenced sources retain their own rights; citations identify influence and
provenance rather than relicensing source material.
