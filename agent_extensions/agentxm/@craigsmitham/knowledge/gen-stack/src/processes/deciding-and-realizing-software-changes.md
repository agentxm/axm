---
type: Explanation
title: Deciding and realizing bounded software changes
description: A recommended Process that carries a Signal through shaping, proportional uncertainty reduction, coherent change definition, implementation with focused review feedback, fresh integrated review, authorized shipping, and renewed observation.
tags: [process, software-change, change, shape, pitch, research, investigation, change-specification, change-design, quick-change, implementation-planning, implementation, review, shipping, feedback, compaction]
status: draft
sources:
  - id: gen-stack-overview
    resource: ../overview.md
    title: How the Gen Stack operates
  - id: process
    resource: process.md
    title: Process
  - id: change-specification
    resource: ../work-items/changes.md
    title: Changes
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T23:32:00Z
---

# Deciding and realizing bounded software changes

> **Authority:** This is a recommended Gen Stack Process definition. It applies
> the canonical meanings in the [Gen Stack vocabulary and relationship
> model](../glossary.md) without making the Process normative for an adopting
> organization. Binding obligations remain with identified Requirements,
> policies, standards, contracts, or other recognized authorities.

When a Signal, need, issue, or authorized change requires a bounded response,
this Process coordinates uncertainty reduction, change definition,
realization, assessment, and authorized final action until the change is
truthfully dispositioned or shipped with traceable evidence and reconciled
system meaning.

## Purpose and value

The Process helps decision authorities, reviewers, implementers, operators,
and affected audiences reach a coherent outcome without requiring any one
artifact to own the whole change. It intends to:

- preserve the originating evidence and human-oriented Intent;
- make accepted obligations and durable Architecture explicit before they are
  treated as implementation inputs;
- permit both specification-first and design-first discovery;
- carry one Change with exact, coherent Change Specification and Change Design revisions into bounded implementation;
- assess the exact candidate before an authorized final action;
- return Results and Observations to the control loop; and
- refine or compact meaning and realization when evidence has stabilized.

Executing every activity does not itself create value. A useful enactment may
end with no change, a clarified expectation, a rejected proposal, a deferred
decision, or an explicit blocker.

## Operating model

The diagram is a view of the Process definition, not a second authority for
its activities or artifacts.

```text
Signal, need, issue, or opportunity
                  ↓
                /shape
          ↙               ↘
    /research         /investigate
          ↘               ↙
                 Pitch
                    ↓
                 Change
          /spec ⇄ /design
             ↖ /quick-change ↗
                    ↓
           Change coherence gate
                    ↓
                  /plan
                    ↓
       /implement ⇄ focused review
                    ↓
                 /review
                    ↓
             Release readiness gate
                    ↓
                  /ship
                    ↓
       Observe, evaluate, learn, compact
                    └───────────────↺
```

The named slash commands are one agent-mediated realization. A person,
workflow, service, or another agent may perform the same activities when it
preserves their contracts and authority boundaries.

Shaping is a focused Orientation activity that frames the proposed change as a
Pitch. Research and investigation are optional uncertainty-reduction routes
and may be entered from shaping or any later activity. Their evidence can
return to a revised Pitch. Change Specification and Change Design co-evolve;
`/quick-change` may produce both in one bounded response.
Implementation uses focused read-only review feedback at stable checkpoints and
may repeat increments after findings. A fresh integrated review assesses the
exact final candidate. Shipping produces new Observations and does not
terminate learning.

## Boundary

| Boundary | Definition |
| --- | --- |
| Context | A bounded software-system or Architecture change, including authorized corrective work |
| Trigger | A Signal, accepted need, issue, opportunity, possible or established Defect, or authorized change requires Orientation |
| Successful outcome | The change is dispositioned without implementation, or one exact reviewed revision undergoes its authorized final action and the resulting evidence and meaning are reconciled |
| Other termination | Declined, deferred, superseded, no change warranted, unsafe or unauthorized, evidence exhausted, or blocked on a named decision or capability |
| Inputs | Source records, Observations, Intent, Requirements, Architecture, current Implementation, Evaluations, constraints, and authority |
| Outputs | A dispositioned Pitch, Research or investigation evidence, one Change with exact Change Specification and Change Design revisions, a plan, candidate Implementation, review evidence, an external action result, and corpus disposition |
| Exclusions | Product prioritization, automatic semantic acceptance, automatic release approval, and indefinite post-release operation |

An unbounded request remains a Signal or source record. The Process does not
force every Signal into a Change or every Change into delivery.

## Activities and outcomes

| Activity | Governing question | Intermediate outcome | Ordinary next route |
| --- | --- | --- | --- |
| Shape | What bounded change may be worth defining, and what is it likely to affect? | A provisional, repository-grounded Pitch or an explicit non-change disposition | research, investigate, spec, design, human decision, or terminate |
| Research | What can authorized existing evidence tell us? | A Research Brief and evidence-backed Research Report with visible gaps | shape, spec, design, plan, or terminate |
| Investigate | What explains an observed condition or discrepancy? | A bounded diagnostic conclusion no stronger than the gathered evidence | shape, triage, research, spec, or terminate |
| Specify | What must change, why, and what semantic evidence must be possible? | Human-ratifiable Intent, Requirement, complete Architecture, and Requirement/Architecture Evaluation Protocol delta, agnostic about test realization | design or coherence review |
| Design | How should accepted meaning and required Protocols be realized? | Proportional Change Design, alternatives and comparison, Architecture realization, Evaluation realization, consequences, and unresolved technical decisions | spec or coherence review |
| Plan | How will the coherent change be implemented, reviewed, and evidenced safely? | Revision-bound sequence of architectural realization, required Protocol feedback, focused review checkpoints, exit evidence, dependencies, recovery, and handoffs | implement or return to definition |
| Implement | Can the plan be realized within accepted meaning and authority? | Candidate Implementation shaped by incremental Protocol and focused review feedback, final evidence, dispositioned findings, and material deviations | review or return to definition or plan |
| Review | Does this exact checkpoint or final candidate adequately realize the accepted change? | Focused course-correction findings or a fresh integrated result with separate Requirements, Architecture, Evaluations, Implementation, and whole-change judgments | implement, definition, ship, or terminate |
| Ship | May this exact reviewed revision undergo this named final action? | Verified merge, deployment, publication, or other external result, including partial or failed state | observe, recover, or reopen |
| Learn and compact | What did the action establish, contradict, or render obsolete? | New Observations, bounded Results, repaired provenance, and authorized refinement or compaction | close or re-enter Orientation |

Each activity follows [Running a change-realization
stage](running-change-realization-stages.md). Its output may be conversational,
host-native, or durable according to the artifact's own authority and required
lifetime. When a focused capability deliberately remains independent of Gen
Stack, the caller applying this Process owns the common stage handoff and corpus
disposition around that capability's native artifact.

Persisting an exact stage artifact is a cross-cutting representation operation,
not another activity or readiness gate in this Process. When authorized, apply
[Synchronizing change artifacts with work-item
hosts](../work-items/synchronizing-change-artifacts.md) without re-authoring the
artifact or advancing its maturity. Host-native implementation records may be
projected from an exact plan only through that separately authorized operation.

## Specification-first and design-first convergence

Specification-first work develops the outcome and obligations before exploring
the technical response. Design-first work begins from a proposed mechanism,
prototype, constraint, or response hypothesis and exposes its implied Intent,
Requirements, and Architecture assumptions.

Both routes may begin from a Pitch and must converge. A design-first proposal does not become desired
state because it is concrete. A specification-first statement does not become
implementable merely because it is normative. The second activity reconciles
the first; a material change sends the affected constituent back through its
own activity.

The resulting Change coordinates two sibling artifacts. The Change
Specification owns why and what and remains agnostic about implementation-level
Evaluations and tests. The Change Design owns how, including technical
realization of required Requirement and Architecture Protocols and optional
Implementation-conformance Evaluations. The Change binds their exact revisions
and records whether reconciliation establishes coherence.

## Readiness gates

### Change coherence

Planning may rely on the Change as coherent only when:

- the outcome, affected context, scope, and material exclusions are bounded;
- source evidence, assumptions, and decisions are distinguishable;
- every affected Requirement and Architecture authority has an exact
  disposition and the complete before/after meaning is ratified by its human
  authority;
- no architecture-significant responsibility, boundary, interaction, state,
  quality, decision, or view obligation is left for implementation to infer;
- exact Requirement-satisfaction and Architecture-realization Evaluation
  Protocol identities, targets, claims, semantic coverage, judgment, and
  evidence expectations are ratified without prescribing test realization;
- the Change Design is proportional and does not contradict accepted meaning;
- the Design maps accepted Architecture and every required Protocol to a
  concrete technical realization;
- material risks, unknowns, and recovery concerns are visible; and
- no blocking product, Requirement, durable Architecture, or Protocol-semantic
  decision has been delegated to Design, planning, or implementation.

### Implementation readiness

Implementation may rely on the plan when it is bound to an exact coherent
Change and exact Change Specification and Change Design revisions and identifies affected Implementation Units,
dependencies, sequence, Evaluation or testing work, migration, observability,
rollback, recovery, proportional Architecture, Requirements, Evaluations, and
Implementation review checkpoints, final integrated review handoff, and
remaining authorized local choices. An exploratory plan may exist earlier but
must not claim this readiness.

### Release readiness

Shipping may proceed only for the exact reviewed revision and named action.
Applicable Requirement-satisfaction, Architecture-realization, Design-
conformance, Implementation-conformance, evidence, operational, recovery,
corpus, and authority conditions remain separately visible. A review
recommendation does not confer release authority.

## Authority and roles

| Role | Responsibility without implied authority transfer |
| --- | --- |
| Process steward | Maintains this Process definition and its review triggers |
| Meaning authority | Accepts or rejects Intent, Requirements, durable Architecture, and architecture-significant decisions |
| Mutation authority | Authorizes bounded local or external changes |
| Research owner | Accepts a Research Brief and report without transferring accountability to a worker |
| Investigator | Gathers and interprets bounded diagnostic evidence without authorizing correction |
| Implementer | Realizes accepted inputs and delegated local choices |
| Reviewer or evaluator | Produces bounded findings or evidence without making an ungranted release decision |
| Release authority | Authorizes one exact final action and target |
| Executor | Performs the authorized mutation and verifies persisted state |

One person or agent may perform several roles, but execution, confidence, or
artifact polish does not transfer their authorities.

## Work items and artifacts

Operational Incident Records, Defect Reports, and Changes retain their
independent identities. A Change classified as Bugfix remains separate from
every source Defect Report. Investigation is activity within a conversation or
appropriate case record. Host-native tasks may realize the plan. Evaluation
Protocols own durable assessment contracts; Executions and Results remain
bound to exact realized revisions and conditions.

A Pitch is a transient shaping artifact and not another Gen Stack work-item
role, governed concept type, Change Specification, or acceptance record. When it is
persisted in a host, that container preserves its source and disposition but
does not acquire any of those roles automatically.

The Process does not convert tickets from one semantic type to another. It
links sources, Changes, their artifact revisions, tasks, Implementation
revisions, Results, and decisions while each retains its lifecycle.

## Gen Stack corpus participation

Every activity considers the applicable accepted corpus when one is validly
adopted. Each stage reports one or more truthful dispositions:

- `no-impact`;
- `consulted`;
- `candidate-gap`;
- `accepted-semantic-delta`;
- `representation-maintenance`;
- `realization-or-evidence-update`; or
- `compaction-opportunity`.

Shaping, research, and investigation may expose anticipated impact or gaps but
do not turn a Pitch or evidence into accepted meaning. Change Specification and Change Design develop candidates and may encode
explicitly ratified meaning. Planning and implementation consume accepted
meaning and expose drift. Review checks cross-stack coherence. Shipping keeps
the exact reviewed revision and required corpus delta together. Results and
Observations return to Orientation without rewriting desired state
automatically.

Discover refinement opportunities continuously. Apply them only when bounded,
authorized, and safe at the current stabilization point. Change Specification/Change Design
convergence, completed review, and verified post-action learning are ordinary
compaction opportunities; unrelated cleanup remains separate work.

## Measures and improvement

Useful evidence includes:

- whether the intended stakeholder outcome improved;
- time spent waiting for evidence or decisions;
- material questions discovered after implementation began;
- review rework and implementation divergence;
- Evaluation gaps, escaped Defects, rollback, and reopening;
- corpus drift, duplicated authority, stale candidates, and compaction debt;
- participant attention, handoff friction, and unnecessary ceremony; and
- safe termination when no change or no authority exists.

Review the Process when these measures show recurring ambiguity or rework,
when a skill or host changes its public contract, when corpus or Evaluation
policy changes, or after an action exposes a missing route. Revise the smallest
responsible boundary or contract rather than adding a universal phase.

## Realizations and views

Focused Agent Skills may realize the named activities. Their portable
instructions own execution behavior; this document owns the recommended
Process relationship among them. Pack and skill READMEs should link here and
show only the summary their readers need. If the operating-model diagram is
repeated in a generated surface, this document remains its source and the copy
must be mechanically checked or regenerated.
