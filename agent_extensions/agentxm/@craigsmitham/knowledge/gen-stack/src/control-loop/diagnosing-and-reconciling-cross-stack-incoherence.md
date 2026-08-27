---
type: Guide
title: Diagnosing and reconciling cross-stack incoherence
description: Use when a change, Evaluation Result, operational Observation, review, or replacement exposes a possible gap or contradiction among Intent, Architecture, Requirements, Implementation, Evaluations, or operation; diagnose without presuming which source is wrong and coordinate the smallest authorized repair and re-evaluation.
tags: [cross-stack-incoherence, drift, diagnosis, reconciliation, ooda, evaluations, requirements, architecture, implementation, operations]
status: draft
sources:
  - id: ooda-control-loop
    resource: ooda-control-loop.md
    title: OODA as the Gen Stack control loop
  - id: evaluation-as-bounded-evidence
    resource: ../evaluations/evaluation-as-bounded-evidence.md
    title: Evaluation as bounded evidence
  - id: candidate-architecture-and-requirements
    resource: ../architecture/developing-candidate-architecture-and-requirements.md
    title: Developing candidate Architecture and Requirements
  - id: requirement-impact
    resource: analyzing-requirement-impact.md
    title: Analyzing Requirement impact
generated:
  by: codex/gpt-5
  at: 2026-08-26T23:13:16Z
---

# Diagnosing and reconciling cross-stack incoherence

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it discusses a
> profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns that representation.
> This Guide supports action and adds neither semantic authority nor
> profile-conformance rules.

Use this guide when evidence suggests that two or more parts of the Gen Stack
may disagree, cannot be related confidently, or never became coherent. Use
[OODA as the Gen Stack control loop](ooda-control-loop.md) for the general
adaptive model; this Guide applies it to one bounded diagnosis and repair.

Do not apply it to every Signal. Select it only when a material cross-stack
disagreement must be understood before choosing what to preserve,
investigate, or change.

## Goal and boundary

Diagnose without presuming which source is wrong. Use Evaluations and other
evidence to distinguish repair hypotheses, route each accepted repair to its
proper authority, reconcile affected relationships, and re-evaluate the exact
changed state.

This Guide uses **cross-stack incoherence** descriptively for a consequential
gap, contradiction, or unsupported relationship among Intent, Architecture,
Requirements, Implementation, Evaluations, operation, and Provenance. It does
not introduce a governed concept or glossary term. **Drift** is one cause;
missing or incorrectly specified meaning may have been incoherent from the
beginning.

Each part retains its own authority:

| Part | What it establishes |
| --- | --- |
| Intent | Human-oriented outcomes, motivations, constraints, and context |
| Architecture | Durable subjects, responsibilities, boundaries, relationships, decisions, and responses |
| Requirement | One accepted obligation on one eligible Architecture subject |
| Implementation | What currently exists in machine-consumed artifacts |
| Evaluation Protocol | One bounded assessment claim, its criteria authority, method, conditions, and evidence lifecycle |
| Evaluation Result or operational Observation | Bounded evidence about what was assessed, perceived, or happened |

No part is generally the correct side of a disagreement. Implementation may
embody an important outcome that Requirements failed to specify. A Requirement
may correctly expose an Implementation defect. Production may reveal that both
are incomplete. An Evaluation may discriminate among those explanations, or
its own criteria, coverage, method, execution, or evidence may be defective.

While accepted meaning remains in force, preserve its authority. Evidence that
another representation better reflects Intent supports a repair hypothesis; it
does not silently revise Architecture or a Requirement.

## Representation

Keep the diagnosis in the conversation, review, work item, incident, or other
native surface that owns the current Orientation. Do not create a governed
“drift” concept, a second normative account, or a standing reconciliation
ledger.

Present only the Signal and scope, material claims and evidence, neutral
statement of incoherence, competing repair hypotheses, Evaluation state,
recommendation, authority and blocking status, authorized reconciliation, and
closure evidence.

## 1. Bind the Signal and affected scope

State what drew attention, the smallest affected behavior or responsibility,
and the next action the diagnosis must support. Name the relevant
Implementation revision, operating window, proposed change, or replacement
boundary when known.

Do not inventory the whole repository merely because any part could be wrong.
Expand only when evidence implicates another authority, dependency, boundary,
Evaluation, or operating condition.

## 2. Inventory the material sources

Gather only sources capable of changing the diagnosis:

- applicable Intent and its maturity;
- accepted Architecture, Requirements, decisions, contracts, and policies;
- relevant Implementation Units, interfaces, data, dependencies, and behavior;
- Evaluation Protocols, Executions, Results, and coverage projections;
- operational observations, incidents, external changes, and experienced
  maintainer knowledge; and
- Provenance explaining why a claim, behavior, criterion, or decision exists.

For each material source, preserve identity, revision or observation window,
availability, authority, maturity, confidence, and contradictions. A recent,
executable, or passing source does not thereby outrank the others.

## 3. State the incoherence neutrally

Describe the minimum disagreement the evidence establishes:

```text
Requirement R requires three attempts.
Implementation revision I performs four.
Evaluation Protocol P assesses two as acceptable.
The available evidence does not yet establish the authorized repair.
```

Classify the observation without choosing its cause: missing,
underdeveloped, misplaced, disputed, stale or contradicted, possible
non-satisfaction, insufficient evidence, or unresolved. Preserve `unknown`
rather than letting the newest or most executable source win.

## 4. Develop competing repair hypotheses

Consider only locations implicated by evidence; several may need repair:

| Possible location | Diagnostic question |
| --- | --- |
| Intent | Has human direction changed, conflicted, or remained ambiguous? |
| Architecture | Is a subject, responsibility, boundary, relationship, decision, or response missing, misplaced, or stale? |
| Requirement | Is an obligation missing, incorrectly expressed, wrongly placed, disputed, or obsolete? |
| Implementation | Does realized state fail otherwise coherent accepted meaning? |
| Evaluation Protocol | Is its role, target, criteria authority, method, threshold, condition, or evidence lifecycle wrong or insufficient? |
| Evaluation Execution or Result | Was the wrong revision, input, environment, evaluator, sample, or window bound, or did the harness fail? |
| Operation or environment | Did reality expose a hidden dependency, invalid assumption, or knowledge trapped in Implementation? |
| No repair | Are different representations legitimately distinct and still coherent? |

Use [Developing candidate Architecture and
Requirements](/architecture/developing-candidate-architecture-and-requirements.md)
when evidence implicates architectural or Requirement meaning. When a work
item may change desired state, apply [Analyzing Requirement
impact](analyzing-requirement-impact.md) before specifying the change.

## 5. Use Evaluations to discriminate

Evaluations make repair hypotheses observable, but are not presumed correct.
Inspect the complete assessment chain:

1. **Claim and role:** Is the Protocol asking the needed Requirement-
   satisfaction, Architecture-realization, or Implementation-conformance
   question?
2. **Criteria authority:** Does each criterion come from the authority the
   Protocol claims to assess?
3. **Target and coverage:** Is the correct subject in scope? Keep eligibility
   distinct from a decision that coverage is required.
4. **Method adequacy:** Can the cases, sampling, analysis, review, measurement,
   or operational window expose the disagreement and its important blind
   spots?
5. **Execution binding:** Does the Execution identify the exact Protocol and
   Implementation revisions, inputs or observations, evaluator, environment,
   and attempt or window?
6. **Evidence state:** Keep coverage (`defined` or `uncovered`), evidence
   (`absent`, `stale`, `current`, `skipped`, or `harness-error`), and outcome
   (`pass`, `fail`, or `unknown`) separate.

A missing Protocol is not a pass. An incorrect or insufficient Protocol does
not make the Implementation correct. A failed Evaluation does not identify the
artifact that must change. When current Evaluations cannot discriminate,
improve or add the smallest justified assessment, gather other evidence, or
preserve `unknown`.

Use [Designing Evaluation
Protocols](/evaluations/designing-evaluation-protocols.md) for an accepted
assessment-contract change. Executable Cases, Executions, and Results remain
with the repository's evaluation workflow.

## 6. Decide and reconcile at the proper owners

Recommend the smallest repair supported by evidence, with its uncertainty,
consequences, authority, and blocking status. Changed Intent, Architecture,
Requirements, Implementation, and Evaluation Protocols retain separate
decision and mutation authority. An operational Observation or Evaluation
Result remains evidence even when it motivates an accepted change.

A gap is **blocking** only when it prevents the dependent action from being
truthful or safe. Missing conservation meaning, a disputed public contract or
data owner, or inadequate evidence for a high-consequence decision may block.
A non-blocking gap may remain visible while independently authorized work
proceeds.

After acceptance and mutation authority:

- change each fact only at its canonical owner;
- update affected subjects, relationships, realization links, Protocol
  targets, and evidence bindings coherently;
- preserve historical Requirements, Protocols, Executions, and Results with
  the revisions and conditions they actually assessed; and
- leave unrelated candidates, observations, and unknowns at their actual
  maturity.

“Smallest” does not mean forcing a multi-authority problem into one artifact.

## 7. Re-evaluate and close honestly

Apply the affected Protocols to the repaired exact revisions and conditions,
or record why execution remains unavailable. New Results may support the
repair hypothesis, contradict it, or leave it unknown.

Close the bounded diagnosis as coherent for the declared scope and evidence
window; awaiting current evidence; partially reconciled with named gaps;
deferred with authority and a reconsideration trigger; no repair required; or
unresolved with the blocked action and next discriminating evidence named.

Do not treat work-item closure, a passing local test, corpus conformance, or
one successful deployment as proof of general cross-stack coherence.

## Compact working form

```text
Signal and affected scope:
Observed incoherence:
Material claims and evidence:
Competing repair hypotheses:
Evaluation coverage, evidence state, and outcome:
Discriminating evidence needed:
Recommendation and remaining uncertainty:
Applicable authority:
Blocking status: blocking | non-blocking
Authorized reconciliation:
Closure evidence and residual gaps:
```

## Final check

- The diagnosis did not presume a defective layer.
- Authority, realized state, assessment, evidence, and decision stayed distinct.
- Missing, incorrect, insufficient, stale, or failed Evaluations did not become
  passes or implementation conclusions.
- Proposed changes name their canonical owners and authorities.
- Historical evidence remains bound to what it actually assessed.
- Closure states the bounded claim and residual unknowns honestly.

## Related

- [OODA as the Gen Stack control loop](ooda-control-loop.md)
- [Analyzing Requirement impact](analyzing-requirement-impact.md)
- [Developing candidate Architecture and
  Requirements](/architecture/developing-candidate-architecture-and-requirements.md)
- [Evaluation as bounded
  evidence](/evaluations/evaluation-as-bounded-evidence.md)
- [Designing Evaluation
  Protocols](/evaluations/designing-evaluation-protocols.md)
- [Bounded regeneration](/implementation/bounded-regeneration.md)
