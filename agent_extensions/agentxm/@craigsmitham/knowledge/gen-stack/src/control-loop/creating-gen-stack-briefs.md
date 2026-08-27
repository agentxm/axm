---
type: Guide
title: Creating a Gen Stack brief
description: Use when someone asks to be briefed on a bounded part of a Gen Stack-adopted system; explain its current state through the relevant Gen Stack lenses, assess conformance and health without overstating the evidence, and present proportionate options for further action.
tags: [gen-stack, brief, explanation, current-state, orientation, conformance, coverage, coherence, health, decision-support]
status: draft
sources:
  - id: gen-stack-overview
    resource: ../overview.md
    title: How the Gen Stack operates
  - id: ooda-control-loop
    resource: ooda-control-loop.md
    title: OODA as the Gen Stack control loop
  - id: gen-stack-profile
    resource: ../profile/gen-stack-application-profile.md
    title: Gen Stack application profile
  - id: cross-stack-incoherence
    resource: diagnosing-and-reconciling-cross-stack-incoherence.md
    title: Diagnosing and reconciling cross-stack incoherence
  - id: bounded-evidence
    resource: ../evaluations/evaluation-as-bounded-evidence.md
    title: Evaluation as bounded evidence
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T00:30:00Z
---

# Creating a Gen Stack brief

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it assesses a
> profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns that representation.
> This Guide supports action and adds neither semantic authority nor
> profile-conformance rules.

Use this guide when someone asks to “brief me on” a bounded part of a system
that has adopted Gen Stack. A **Gen Stack brief** helps a curious reader
understand what currently exists, why it exists, how the relevant parts of the
stack relate, how healthy and well-supported that account is, and what they
might do next.

Example prompts include:

- “Brief me on reservation recovery.”
- “Give me a Gen Stack brief on this API boundary.”
- “Explain the current state of checkout through the Gen Stack lenses.”
- “Brief me on why this implementation and its Requirements disagree.”

## Goal and boundary

Answer the reader's actual question through only the relevant lenses across
Intent, Architecture, Requirements, Implementation, Evaluations, operation,
governance, and Provenance. Make missing, uncertain, stale, or contradictory
meaning visible. Conclude with proportionate options for changing the scope or
direction, gathering evidence, or repairing the system and its knowledge.

A Gen Stack brief is:

- a bounded, read-only Orientation product for a reader;
- an evidence-linked explanation of current state;
- a distinct assessment of conformance, coverage, coherence, realization,
  evidence, and fitness where applicable; and
- decision support, not a decision.

It is not a new governed Gen Stack concept, a substitute for canonical
documentation, a corpus-wide audit, an implementation plan, or authority to
change desired state. It may reveal that an audit, investigation, decision, or
repair is warranted, but it does not silently perform that adjacent work.

## Representation

Create the brief in the conversation, report, review, work item, or other
native surface requested by the reader. Do not add it to the adopted
`gen-stack/` corpus merely because it discusses governed concepts. Link to
canonical owners rather than copying their claims into a second authority.

Prefer a concise narrative in this logical order: question and scope, current
state, relevant lens map, conformance and health, gaps or incoherence,
confidence and unknowns, and options for further action. Omit inapplicable
lenses and sections. Add detail only when it materially helps the reader.

## 1. Bind the reader's question and scope

Restate the subject in terms a reader can recognize. Identify the decision,
understanding, or curiosity the brief should support and the smallest useful
boundary: a behavior, responsibility, Surface, Capability, Feature, C4
element, Requirement set, Implementation Unit, Evaluation route, operating
window, or relationship among them.

Name important exclusions and the as-of revision or observation window. Do not
turn a question about one part of the system into a complete stack inventory.
Expand the boundary only when evidence shows that another element materially
affects the explanation.

## 2. Establish the corpus and evidence state

Determine whether the system actually has an established, supported-profile
Gen Stack corpus. If it does, treat its accepted governed concepts as their
declared authorities and assess their representation against the applicable
OKF and profile rules. If it does not, say so plainly and use available local
sources as evidence without pretending profile adoption or conformance.

Inventory only material sources, such as accepted corpus concepts, repository
documentation, decisions, code, configuration, tests, Evaluation Protocols
and Results, telemetry, incidents, work items, and experienced maintainer
knowledge. For every load-bearing claim, preserve its source, revision or
window, authority or maturity, availability, and important limitations.

Absence is evidence about coverage, not proof that the underlying concept or
behavior does not exist. Implementation can reveal current behavior without
becoming desired-state authority. A document can express intent without being
accepted. A passing Evaluation supports only its bounded claim.

## 3. Build the relevant lens map

Use the Gen Stack as a set of lenses, not a checklist demanding equal detail:

| Lens | Reader question |
| --- | --- |
| Intent | What outcome, value, actor need, constraint, or problem gives this part purpose? |
| Architecture | Which subject owns it, and what responsibilities, boundaries, relationships, decisions, or responses shape it? |
| Requirements | What accepted obligations apply, to which exact Architecture subjects, and with what lifecycle? |
| Implementation | What realized state, units, behavior, interfaces, data, and dependencies currently exist? |
| Evaluations | What bounded claims should or do assess Requirement satisfaction, Architecture realization, or Implementation conformance? |
| Operation | What do incidents, telemetry, feedback, and real use show within the relevant window? |
| Governance and Provenance | Who or what can decide, why does the meaning exist, and how fresh and trustworthy are its sources? |

Trace only relationships supported by evidence. Do not infer Requirement
satisfaction from implementation, coverage from eligibility, realization from
structural similarity, fitness from a passing test, or acceptance from polished
documentation.

## 4. Explain the current state

Lead with a direct account of how the bounded part works and why it matters.
Then explain how the relevant elements relate across the stack. Distinguish:

- accepted desired state from candidates and hypotheses;
- documented Architecture from inferred structure;
- obligations from implementation behavior;
- governed Evaluation Protocols from executable Cases, Executions, and
  Results; and
- known facts from interpretations, contradictions, unavailable evidence, and
  unknowns.

Prefer synthesis over an artifact inventory. A reader should leave able to
describe the part of the system and understand which claims are authoritative,
realized, assessed, observed, or merely plausible.

## 5. Assess conformance and health separately

Report only the dimensions relevant to the brief. Never collapse them into a
single health score or general “Gen Stack compliant” verdict.

| Dimension | What to assess |
| --- | --- |
| OKF conformance | Whether the bounded governed corpus documents meet applicable OKF rules |
| Profile conformance | Whether applicable governed concepts and relationships meet the adopted Gen Stack profile |
| Semantic review | Whether accepted meaning is intelligible, correctly placed, and consistent with canonical Gen Stack semantics |
| Documentation coverage and fitness | Whether material current meaning can be found, trusted, and used for the reader's purpose |
| Cross-stack coherence | Whether Intent, Architecture, Requirements, Implementation, Evaluations, and operation can be related without material contradiction or unsupported inference |
| Implementation realization | Whether available evidence supports that accepted Architecture and Requirements are represented in realized state |
| Evaluation coverage | Which required bounded assessment claims have current Protocols; keep eligible candidates, required coverage, and uncovered claims distinct |
| Evaluation evidence and outcomes | Whether evidence is absent, stale, current, skipped, or a harness error, and whether each bounded outcome is pass, fail, or unknown |
| Operational fitness | What bounded operational evidence supports about behavior under relevant real conditions |

Use validators, inspection projections, dependency or code navigation, test
registries, and other harness support where they improve repeatability and
coverage determination. Bind each result to the exact corpus, revision,
configuration, environment, and tool identity. Tool output does not replace
semantic review, select which coverage is required, judge Protocol adequacy,
or authorize a release.

Use calibrated labels such as `supported`, `partially supported`, `unsupported`,
and `unknown`, always with their evidence boundary. A missing Requirement,
Protocol, Result, implementation link, or document is missing coverage—not an
automatic failure of the system behavior it would describe or assess.

## 6. Identify gaps and possible incoherence

State material gaps as reader-relevant findings rather than a list of every
missing artifact. Classify absent, underdeveloped, misplaced, disputed, stale,
contradicted, or unavailable meaning and explain its consequence.

When sources disagree, state the minimum incoherence neutrally:

```text
Accepted Requirement R constrains the retry limit to three.
Implementation revision I performs four attempts.
Protocol P assesses only whether a retry eventually succeeds.
The evidence does not yet establish whether R, I, P, or more than one requires repair.
```

Do not presume that documentation, Requirements, Implementation, tests, or
production is the defective side. If diagnosis is necessary, route to
[Diagnosing and reconciling cross-stack
incoherence](diagnosing-and-reconciling-cross-stack-incoherence.md).

For each material gap, name the evidence, reader impact, confidence, and
whether it blocks the decision or action the brief is meant to support. A gap
is not blocking merely because further improvement is possible.

## 7. Offer proportionate next options

End with a small set of distinct options selected from what the evidence
supports. Options may include:

- **Accept the bounded current state** when it is coherent and sufficiently
  supported for the reader's purpose.
- **Narrow or redirect the question** when the original scope cannot be
  answered honestly or a more consequential boundary emerged.
- **Gather discriminating evidence** through targeted source recovery,
  observation, inspection, or Evaluation.
- **Clarify or ratify meaning** when Intent, Architecture, or Requirements are
  missing, disputed, or only candidate.
- **Repair canonical knowledge** when accepted documentation is stale,
  misplaced, incomplete, or profile-nonconforming.
- **Repair Implementation or Evaluations** when evidence supports a bounded
  realized-state or assessment defect.
- **Open a bounded investigation or change** when diagnosis or coordinated
  remediation exceeds the brief.

For each useful option, state the outcome, material tradeoff, authority needed,
and the evidence that would indicate completion. Give a labeled recommendation
when the evidence supports one, preserving uncertainty and leaving the
applicable decision with its authority.

## Compact brief form

```text
Question and scope:
As-of revision or evidence window:

Current state:
Relevant Gen Stack lens map:

Conformance and health:
- Corpus and profile:
- Documentation and semantic coverage:
- Cross-stack coherence and realization:
- Evaluation coverage, evidence, and outcomes:
- Operational fitness:

Material gaps or possible incoherence:
Confidence, limitations, and unknowns:

Options for further action:
Recommendation, authority, and blocking status:
```

## Final check

- The brief answers one bounded reader question and states its as-of boundary.
- Every material claim is linked to an authority, evidence source, or explicit
  inference.
- Inapplicable lenses are omitted rather than reported as healthy or missing.
- Conformance, documentation coverage, semantic coherence, realization,
  Evaluation coverage, evidence state, outcome, and operational fitness remain
  distinct.
- Missing evidence stays missing or unknown; harness errors do not become
  passes or failures of the target.
- Possible incoherence is neutral about which authority or realization needs
  repair.
- Options are proportionate and do not imply acceptance or mutation authority.
- The brief did not become a second canonical account of the system.

## Related

- [How the Gen Stack operates](/overview.md)
- [OODA as the Gen Stack control loop](ooda-control-loop.md)
- [Diagnosing and reconciling cross-stack
  incoherence](diagnosing-and-reconciling-cross-stack-incoherence.md)
- [Evaluation as bounded
  evidence](/evaluations/evaluation-as-bounded-evidence.md)
- [Adopting Gen Stack](/adopting-gen-stack.md)
