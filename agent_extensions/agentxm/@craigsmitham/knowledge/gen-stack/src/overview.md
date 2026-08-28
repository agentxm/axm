---
type: Explanation
title: How the Gen Stack operates
description: How Signals are shaped into Pitches, Intent shapes co-developed Architecture and Requirements, those authorities constrain and assess Implementation, and OODA governs adaptation.
tags: [generative-stack, concept-of-operations, operating-model, shape, pitch, specifications, processes, ooda, control-loop, signals, observations, software-change, requirements, architecture, change-design, evaluations, feedback]
sources:
  - id: fowler-generative-stack
    resource: https://chadfowler.com/regenerative-software/3miwhqqvwxc2x/
    title: Chad Fowler — The Generative Stack
  - id: boyd-ooda
    resource: https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf
    title: John R. Boyd — The Essence of Winning and Losing
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T23:32:00Z
---

# How the Gen Stack operates

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

This is the method-level concept of operations for Gen Stack: a compact account
of how the approach turns human direction into a shaped system, realized
software, evidence, and learning. Adopters use it to understand and tailor the
method; they are not required to author a separate concept-of-operations
artifact.

## Operating model

Intent supplies the outcomes, motivations, constraints, and context that shape
both Architecture and Requirements. Architecture is logically primary as the
organizing frame: it proposes the system's subjects, boundaries,
responsibilities, interactions, and response shape. Requirements make accepted
obligations on those subjects canonical. They are developed together rather
than handed off in a universal sequence: candidate Architecture makes useful
Requirements expressible, while candidate Requirements test, constrain, and
refine the Architecture.

Once accepted, the authorities remain distinct. Architecture owns the durable
subjects and response meaning; each Requirement owns one obligation on one
eligible Architecture subject. Neither silently redefines the other.
Active Requirements carry current normative force. Retired Requirements remain
as historical records with stable identity, last accepted expression, and
decision provenance; replacement lineage does not silently transfer meaning or
evidence to a successor.

## Human-governed development

Gen Stack makes authority a governance property, not a rule about who types
the prose. Before acting, answer three questions:

1. **Who decides meaning?** The applicable human or institutional authority
   ratifies desired state and durable Architecture.
2. **Who authorizes mutation?** The user's request, repository policy, and host
   controls bound what may change.
3. **Who executes?** A human, an authorized agent, or a deterministic tool may
   perform the work within those two boundaries.

The roles may coincide, but execution transfers neither semantic nor mutation
authority. An agent may organize evidence, expose contradictions, develop and
compare candidates, recommend, draft, encode an explicitly accepted decision,
and run deterministic checks. It must not infer acceptance from silence,
implementation activity, polished prose, or confidence. When a material choice
remains open, it asks the applicable authority to decide before recording the
result as accepted.

Two independent dimensions keep this boundary visible:

- **Meaning maturity** describes the claim itself: observed, exploratory,
  candidate, recommended, proposed, accepted, rejected, or superseded.
- **Action authority** describes what may happen next: read-only analysis,
  drafting, authorized repository mutation, authorized external mutation, or
  an action awaiting approval.

A mature recommendation can still lack authority to be recorded or acted on.
Conversely, authorization to edit a document does not authorize the agent to
invent its meaning. Local, reversible implementation choices may be delegated
within an independently authorized change, but they do not silently establish
new Intent, Requirements, or Architecture.

```text
                         Intent
                    shapes both
                 ↙              ↘
       Architecture  ⇄  Requirements
                 ↘              ↙
           Compilation and Evaluation Protocol
                 ↓                   ↓
        Implementation revision  Evaluation Execution
                 └────────── assessed by ──────────┘
                                  ↓
                         Results and Observations
```

Compilation translates accepted Requirements and Architecture into bounded
Implementation changes. Evaluation Protocols turn accepted obligations,
architectural claims, risks, and assurance needs into reusable assessment
contracts. They guide realization by making success and failure observable,
but they do not own desired state. Evaluation Executions apply those contracts
to a particular Implementation and context; Results provide evidence without
becoming Requirements or Architecture.

Focused review adds a separate judgment loop during Implementation. A fresh,
read-only reviewer may assess stable increments through Architecture,
Requirements, Evaluations, or Implementation lenses while dependent work can
still course-correct. Those checkpoint findings remain distinct from Protocol
Results and from a fresh integrated review of the exact final candidate. Neither
review mode accepts desired state or authorizes release.

## Adaptation through the stack

OODA governs how the stack learns which authority or activity should change:

```text
Observe Signals and contextual Observations
                  ↓
Orient across Intent, Requirements, Architecture,
Implementation, Evaluations, operations, and Provenance
                  ↓
Decide on an authorized repair hypothesis
                  ↓
Act to investigate, change, compile, evaluate, deploy, or roll back
                  └───────────────────────────────↺
```

A new Signal does not automatically become a Requirement or an implementation
change. Orientation compares observations with Intent, Requirements,
Architecture, Implementation, Evaluations, operations, and Provenance. Decision
selects an authorized repair hypothesis at the smallest responsible scope.
Action may investigate, revise Intent, co-develop Architecture and Requirements,
compile, implement, evaluate, deploy, or roll back. The outcome becomes new
evidence for the next loop.

## Supporting coordination

[Shaping a Pitch](control-loop/shaping-a-pitch.md) turns a raw or mixed Signal
into a rough, bounded, repository-grounded articulation suitable for a Change
Specification, Change Design, or combined response. A Pitch exposes anticipated
cross-stack impact and response contours while remaining provisional. It is
not accepted Intent, another Work item, a Change Specification, or selected Design.

[Change Design](design/change-design.md) supplies proportional technical
reasoning between accepted meaning and bounded Action. It may remain in the
conversation, be captured in a work item, or exceptionally be maintained as a
dedicated document. It is not another required authority layer: Requirements
still own obligations, Architecture owns durable response meaning, Work items
own delivery state, Implementation owns realized state, and Evaluations own
assessment and evidence.

A [Change](work-items/changes.md) coordinates one bounded case. Its Change
Specification owns why and what, its Change Design owns how, and the Change
owns identity, classification, exact artifact revisions, coherence, delivery,
evidence, and next action. A Change that explicitly remediates an established
Defect is classified as a Bugfix and remains linked to its provenance-bearing
Defect Reports; it is never a report under a new title.

[Synchronizing change artifacts with work-item
hosts](work-items/synchronizing-change-artifacts.md) preserves an exact landed
Pitch, Change coordination record, Change Specification, Change Design, or plan
in a host-neutral canonical home. It is a representation operation, not a new
stage, artifact type, authority layer, or host workflow. Deliberate plan
projection creates host-native implementation records while leaving the exact
plan canonical.

[Specifying Requirement
changes](work-items/specifying-requirement-changes.md) separates impact analysis
from the actual desired-state delta. It gives additions, revisions,
retirements, replacements, splits, and merges a common identity, lifecycle,
lineage, authority, blocker, and reconciliation model without making the work
item a second normative Requirement authority.

[Evaluation as bounded evidence](evaluations/evaluation-as-bounded-evidence.md)
explains why tests are only one Evaluation method and how Protocols,
Executions, Results, observations, assurance, and decisions retain distinct
authority. [Evaluation Protocols as assessment
contracts](evaluations/evaluation-protocols-as-assessment-contracts.md) and
[Designing Evaluation Protocols](evaluations/designing-evaluation-protocols.md)
turn those distinctions into Requirement-, Architecture-, and
Implementation-shaped assessment contracts with separate reporting
projections. [Deriving evaluation coverage in
harnesses](evaluations/deriving-evaluation-coverage-in-harnesses.md) shows how
repository tooling can consume policy-neutral candidates without making the
inspection layer own coverage selection, Suite bindings, or execution policy.

The loop is inspired by Chad Fowler's account of a generative stack that moves
from human intent through structured clauses, evaluations, implementation, and
runtime feedback, with overlapping representations and explicit composition
points between layers.[^fowler-generative-stack] Boyd's OODA model supplies the
complementary control semantics: Orientation shapes what is observed and which
actions are available, Decision is a hypothesis, and Action is a test that
produces further observations.[^boyd-ooda] This bundle combines those
influences into a practical software-change method with explicit authority
boundaries.

[Processes](processes/) give recurring coordination a stable
trigger-to-outcome model across the stack. A Process may use OODA to adapt one
enactment, but OODA is not a mandatory Process template and the Process does
not become another authority over Intent, Requirements, Architecture,
Implementation, or Evaluations.

## Represent meaning with least complexity

Gen Stack establishes an artifact's semantic role and authority before
choosing how to present it. Representation then follows this order:

```text
Gen Stack meaning → native artifact format → applicable profile
                  → exact host mapping → residual body content
```

Use the native format or host as the first presentation contract. An OKF
concept uses the OKF envelope; a work item uses exact tracker fields; an
  Evaluation Protocol, Process model, schema, or implementation artifact uses
its repository-owned format. Apply a declared profile only as a delta over
that native contract. Add Gen Stack-specific structure only for meaning that
neither layer can carry faithfully.

Five rules keep this predictable without creating a universal template:

1. **Native first.** Use an existing field, construct, link, or container when
   its documented semantics match the fact.
2. **Match meaning, not labels.** A similarly named field is not a valid home
   when its lifecycle, authority, cardinality, or evidence semantics differ.
3. **Delta only.** A profile or Gen Stack guide adds only what the underlying
   format does not already govern.
4. **One owner per fact.** Record a fact once in its canonical field or
   artifact and derive summaries, reciprocal links, exports, and views from
   that source.
5. **Fallback last.** Put a fact in prose or a compact metadata block only
   when no exact native affordance exists; remove that fallback when a richer
   target can represent the fact natively.

Artifact-specific Guides provide a preferred logical order for residual
content. Their canonical Markdown fallbacks may require exact headings so
independent skills produce interoperable artifacts. A richer native host may
satisfy the same semantic contract with exact fields and omit inapplicable
body sections. Outside such an explicit fallback or profile, prose, labels,
and proportional detail may vary and empty sections are omitted.

Durability determines how much presentation machinery is justified. Durable
authorities need stable identity, provenance, and lifecycle in their native
form. Work items use host mechanics plus a recognizable semantic body.
Transient analysis and conversational Change Design use lightweight contextual
structure and do not invent persistence metadata. Reports, dashboards,
reciprocal links, and exports identify themselves as derived projections and
preserve links to their canonical sources.

| Artifact class | Native representation owner | Gen Stack addition |
| --- | --- | --- |
| Governed System, Intent, Requirement, Architecture, and Evaluation Protocol concepts | OKF v0.2 plus the adopted application profile | Only the profile delta and Guide-supported residual body meaning |
| Operational Incident Records, Defect Reports, and Changes | Tracker identity, fields, relationships, and body | Role-specific evidence, authority, lifecycle, and fallback facts the host cannot express |
| Change Specification and Change Design | Native fields, conversation, work item, or established repository format | Shared semantic contracts and exact Markdown fallbacks; no mandatory standalone documents |
| Process definitions | Repository process notation, workflow model, or executable format | Residual purpose, authority, rationale, exclusions, evidence, and limits |
| Implementation Units and generation records | Repository code, schema, configuration, manifest, and provenance formats | Stable links to accepted authorities and bounded conservation context |
| Evaluation Protocols | Governed OKF concepts under `gen-stack/evaluations/protocols/` | Stable role, target, claim, assessment, judgment, and evidence lifecycle |
| Evaluation Suites, Executions, Results, and Reports | Repository evaluation schemas, runners, and evidence stores | Protocol and Case identity, bounded provenance, role-separated projections, and explicit unknowns |
| Signals, Observations, Orientations, Decisions, and Actions | Their source system, telemetry, work item, decision record, or current conversation | Only context and distinctions needed for the bounded control-loop step |
| Dashboards, summaries, reciprocal links, and exports | Generated projection over canonical sources | Declared scope, as-of context, source links, and honest unknowns |

Neither the operating model nor its supporting coordination transfers
authority automatically. A Signal or Observation is not Intent. Intent is
human-oriented direction, not raw feedback. A Requirement may arise from Intent
or another recognized source, but must obligate an eligible Architecture
subject. Intent is not a direct Compilation input. A Requirement is not its
architectural response. An Evaluation is not the Requirement or Architecture
it evaluates. An OODA Decision selects a repair hypothesis but does not
authorize it beyond the applicable human or institutional authority.

## What the method optimizes for

- Preserve a single normative authority for each accepted obligation.
- Permit useful, diverse redundancy among representations with different
  purposes and failure modes.
- Make changes traceable from originating signal through desired state,
  Implementation, and evidence without requiring one universal document or
  traceability matrix.
- Develop only the Change Design needed to resolve present technical ambiguity
  and preserve it no more durably than implementation, review, and handoff
  require.
- Use evidence-bound Orientation to identify the smallest authority capable of
  explaining and correcting a Signal.
- Treat each authorized repair as a hypothesis tested through bounded Action
  and new Observations.
- Keep contradiction, uncertainty, and unavailable evidence visible until an
  authorized decision resolves them.
- Let fast-changing Implementation Units remain replaceable while conserving
  data, contracts, Requirements, operational memory, and rollback paths.
- Compact obsolete structure and explanations after learning has stabilized.

## Boundaries

Gen Stack does not choose product priority, accept Requirements, approve
Architecture, or authorize production release. It supplies a shared method for
humans and agents to develop those decisions and keep their artifacts coherent.
It also does not require every implementation-local test to map to a maintained
Requirement; only an evaluation that claims Requirement coverage needs the
stable relationship.

The method is deliberately opinionated but not a claim that fully autonomous
regenerative software is mature. Operationalize only the next capability that
current needs and evidence support. When a repository declares profile
adoption, however, its corpus must conform from activation rather than treating
partial structure as a maturity stage; use [Adopting Gen
Stack](adopting-gen-stack.md) for the greenfield and brownfield workflow.

See [OODA as the Gen Stack control loop](control-loop/ooda-control-loop.md) for
the complete mapping and [Analyzing Requirement
impact](control-loop/analyzing-requirement-impact.md) for bounded work-item
intake when a Signal may imply a change to desired state.

[^fowler-generative-stack]: Fowler describes the motivating layered pipeline,
    overlapping representations, and feedback direction. “One authority, many
    witnesses” and the lifecycle contracts in this bundle are this package's
    synthesis.
[^boyd-ooda]: Boyd's [The Essence of Winning and Losing](https://www.coljohnboyd.com/documents/1995-06-28__Boyd_John_R__The_Essence_of_Winning_and_Losing__PPT-PDF.pdf)
    supplies the OODA control-loop semantics adapted across the Gen Stack.
