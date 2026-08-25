---
name: question
description: Frames fast, concern-aware research by turning a subject or hypothesis-neutral brief into a compact Research Brief with prioritized, evidence-seeking questions. Use when asked to frame research, generate research questions, plan an independent investigation, blind-check prior findings, or invoke question or qrspi. Not for answering the questions, conducting the research, or writing surveys or interview guides.
---

# Question

Frame the smallest set of research questions most likely to improve an
important decision or understanding. Treat risk as consequential uncertainty,
including uncertainty about truth, value, context, feasibility, quality,
dependencies, opportunity, tradeoffs, consequences, and failure. Do not assume
the subject is defective.

Always return questions. A brief, a handoff, or a description of what you would
have asked is not a completed result.

## Frame

1. Bind the subject, boundary, intended decision or use, lifecycle stage,
   stakeholders, constraints, effort budget, and requested question count.
   Default to five through eight questions. Infer a missing intended use and
   label it an assumption. Never ask the caller to choose a framing mode; ask
   one precise question only when the subject itself is ambiguous enough to
   change the priorities.
2. Decide whether the input contains originating analysis: a hypothesis,
   finding, diagnosis, suspected cause, preferred explanation, or proposed
   solution. If it does not, go to step 4. If it does, step 3 is required even
   when the caller did not ask for an independent check.
3. Isolate, then generate. Follow **Independent framing** below.
4. Select three through six concerns that materially affect the intended use,
   then generate and prioritize candidate questions by importance, uncertainty,
   decision leverage, consequences of error or delay, dependency leverage,
   option value, and information gained relative to effort.
5. Compose the Research Brief and apply the release checks.

## Independent framing

Blindness is a property of the context, not of neutral wording. Never call a
same-context result blind.

**Write a hypothesis-neutral brief** containing only the neutral subject or
system boundary, directly observable conditions and outcomes, relevant
population and environment and timeframe, the decision the research must
support, authoritative constraints, and the neutral terminology needed to
locate evidence.

Exclude suspected and established causes, causal narratives, findings,
diagnoses, conclusions, confidence levels, recommendations, proposed fixes,
favored alternatives, and any detail selected because it supports a hypothesis.
Do not single out an actor, component, or mechanism unless it is indispensable
to the neutral boundary.

**Generate from that brief in an isolated context** — a subagent, sub-session,
or other fresh context that receives the neutral brief and this file and
nothing else from the calling conversation. Do not pass the originating
material, the exclusions, or a summary of what was removed. Relay the result
without adding substantive content or reordering it to match the originating
analysis. Report independence as `procedurally blind`.

**If no isolation mechanism is available,** generate from the neutral brief in
the current context anyway, report independence as `hypothesis-neutral, not
procedurally blind`, and state the limitation in one line. Degrade the label,
never the deliverable.

## Select concerns

Characterize the subject — claim, opportunity, problem, proposal, decision,
product, system, process, event, policy, or design — and whether the
investigation primarily asks what is true, valuable, feasible, effective,
preferable, or risky. Derive concerns from that characterization. Selection
prompts, not a checklist:

- purpose, needs, value, and desired outcomes;
- assumptions, definitions, and explanatory models;
- stakeholders, incentives, and distribution of effects;
- feasibility, dependencies, constraints, and lifecycle economics;
- alternatives, tradeoffs, timing, and reversibility; and
- failure modes, unintended consequences, and evidence sufficiency.

Retain only concerns whose answers could materially improve the intended use.

## Form questions

Prefer questions that test a central value, truth, or outcome; expose a
frame-changing assumption; distinguish among plausible explanations or
alternatives; reveal consequential constraints or effects; surface a materially
affected but neglected perspective; or establish what evidence would justify a
conclusion.

Reject questions that are generic, overlapping, loaded, unanswerable with
plausible evidence, or present only for coverage. Cover promise and peril in
proportion to the subject; do not force a failure-oriented question into every
frame. Avoid numerical risk scores unless the caller supplies an anchored
scale.

Prefer symmetric causal questions. Instead of `Did connection-pool exhaustion
cause the latency change?`, ask `What conditions coincided with the latency
change, and what evidence distinguishes among application, dependency,
resource, workload, and environmental explanations?`

## Research Brief

Default to fewer than 700 words. Return these sections in order.

**# Research Brief**

**## Research context** — compact bullets for **Intended decision or use**,
**Subject and boundary**, **Observable context**, **Constraints** (`None
supplied` when absent), **Consequential assumptions** (`None identified` when
absent), and **Independence status** (`ordinary`, `procedurally blind`, or
`hypothesis-neutral, not procedurally blind`).

**## Relevant concerns** — the three through six selected concerns, one
sentence each on material relevance.

**## Priority research questions** — five through eight rows unless the caller
set another limit, with stable IDs `Q1`, `Q2`, and so on in priority order:

| ID | Priority | Research question | Concern | Why the answer matters | Evidence needed |
| --- | --- | --- | --- | --- | --- |

`Evidence needed` names the observation, comparison, source, measurement, or
disconfirming evidence that could answer the question. It must not answer it.

**## Deliberate omissions** — up to three plausible concerns excluded as low
relevance, with a short reason each. In blind mode, never refer to removed
originating material.

Before releasing, ask whether a competent researcher could infer an originating
hypothesis from any question's wording, specificity, ordering, or emphasis.
Rewrite or remove any question that could reveal it.

## Boundaries

- Frame the research; do not answer the questions or gather the evidence.
- Do not produce a survey, interview guide, test plan, or implementation plan
  unless separately requested.
- Do not manufacture comprehensive coverage. Name material omissions so the
  caller can challenge the prioritization.
- If neutral facts are insufficient, name the missing input rather than infer
  hidden originating material.
