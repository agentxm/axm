---
name: research
description: Orchestrates bounded, evidence-backed research from a Research Brief, explicit questions, or an unframed subject by composing QRSPI framing and delegated execution. Returns a consistent question-by-question report with citations, confidence, counterevidence, decision implications, and unresolved gaps. Use when asked to research, investigate, gather evidence for, or execute framed research questions. Not for requests that only ask what questions to investigate, surveys, interview guides, or a decision the caller did not authorize.
---

# Research

Orchestrate a bounded investigation and return an intelligible, manageable
report whose structure remains stable across subjects and research depth. The
calling agent owns framing handoff, delegation, acceptance, and presentation;
the `researcher` subagent performs each isolated phase.

If the current assignment declares `Phase: execute` and `Subdelegation:
prohibited`, skip **Orchestrate** and follow **Delegated execution**. This is the
terminal worker branch and must never delegate again.

## Required composition

This skill is not standalone. It requires the direct QRSPI pack siblings at:

- `.axm/extensions/@craigsmitham/skills/question/src/SKILL.md`; and
- `.axm/extensions/@craigsmitham/subagents/researcher/src/researcher.md`.

Use the host's configured `researcher` subagent mechanism. If a fresh delegated
context is unavailable, report the investigation as blocked and name that
missing capability. Do not silently execute the worker phase in the calling
context or claim procedural independence from a same-context fallback.

## Orchestrate

1. Bind the request. Record the intended decision or use, subject and boundary,
   observable context, constraints, deliberate omissions, evidence standard,
   research mode or other budget, source authority, and whether the caller asks
   only for framing. Infer a missing intended use only as allowed by the
   Question skill and label it as an assumption. Do not invent decision
   authority.
2. Classify the input:
   - a Research Brief or one or more explicit research questions is `framed`;
   - a subject, objective, problem, proposal, or originating analysis without
     explicit research questions is `unframed`.
   Preserve supplied question IDs and priority. Assign `Q1`, `Q2`, and so on
   only when explicit questions lack IDs.
3. For unframed input, read the Question skill at the canonical path above.
   Follow its binding and independent-framing rules to prepare the smallest
   input the framing worker may receive. When originating analysis exists,
   remove its hypotheses, findings, causes, diagnoses, conclusions, confidence,
   recommendations, proposed fixes, and favored alternatives; pass only the
   resulting hypothesis-neutral brief. Do not pass the original conversation,
   exclusions, or a summary of removed material.
4. For unframed input, delegate one `frame` phase to `researcher` using
   **Delegation envelope**. Require the exact Research Brief contract from the
   Question skill. Set the independence requirement to `procedurally blind`
   only when originating analysis was removed and the worker receives only the
   neutral brief in a fresh context. Validate the returned sections, stable
   question IDs, evidence-needed fields, omissions, and independence label. If
   invalid or blocked, stop without conducting research and return the failure
   visibly. For framed input, skip this phase.
5. If the caller asked only for framing or explicitly said not to conduct the
   research, return the generated Research Brief, or the supplied framed input
   when no framing phase was needed, and stop. A framing-only request should
   normally route directly to Question; when Research was explicitly activated,
   do not proceed to execution. Otherwise continue automatically without a
   ritual approval pause.
6. Delegate one `execute` phase to a fresh `researcher` context using the
   validated or supplied framed input and **Delegation envelope**. Require the
   report in `references/report-contract.md`; prohibit subdelegation and any
   external mutation.
7. Validate the returned report before presenting it: every input question has
   one dashboard status and one corresponding finding; question wording and
   IDs are preserved; material external claims have nearby citations; source
   statements, synthesis, and inference remain distinguishable; material
   counterevidence and gaps are visible; research caps are honored; and no
   unsupported recommendation or decision is introduced. A persuasive but
   malformed report is not complete.
8. Present the result. For generated framing, return the complete Research
   Brief followed by the Research report so the framing provenance, assumptions,
   concerns, and omissions remain inspectable. For supplied framing, return the
   Research report. If delegation is blocked, exhausted, invalid, or canceled,
   report completed coverage, preserved artifacts, the missing condition, and
   the smallest safe recovery action; never fabricate the absent phase.

## Delegation envelope

Give the worker one bounded assignment containing:

- **Phase:** `frame` or `execute`.
- **Accountable owner:** the calling agent.
- **Goal and priority:** the exact artifact and intended use.
- **Input and provenance:** only the neutral brief for `frame`, or only the
  complete Research Brief or explicit question set for `execute`.
- **Scope and exclusions:** subject boundary and deliberate omissions.
- **Authority:** authorized read-only source classes; no modification,
  communication, purchase, submission, or other external mutation.
- **Budget and expiry:** research depth and every supplied cap.
- **Output and acceptance:** the applicable QRSPI artifact contract and the
  checks the calling agent will apply.
- **Failure protocol:** preserve valid partial state and return a structured
  blocked, exhausted, or invalid result rather than guessing.
- **Subdelegation:** `prohibited`.

Do not pass expected conclusions, hidden grading criteria, unrelated
conversation history, or more context than the worker needs.

## Delegated execution

1. Require at least one explicit research question. Preserve supplied question
   IDs, wording, and priority; assign IDs only when the calling envelope says
   explicit questions arrived without them. Reject a subject-only input because
   framing belongs to the preceding orchestration phase.
2. Record the intended decision or use, subject and boundary, observable
   context, constraints, deliberate omissions, evidence standard, and research
   budget. Label absent material as not supplied; do not manufacture it.
3. Select `standard` depth unless the caller supplies another budget:
   - `rapid` prioritizes decision-critical questions and may leave lower
     priorities not reached;
   - `standard` investigates every question proportionately and follows
     material contradictions or second-order leads; and
   - `deep` continues through important contradictions and implications until
     further work is unlikely to change the conclusions or the budget ends.
4. Read `references/evidence-practice.md`, then plan and perform the research
   using available read-only sources and tools. Research may inspect public,
   caller-provided, repository, or other authorized evidence. Do not modify
   systems, contact people, purchase access, or perform another externally
   mutable action merely to answer a question.
5. Preserve the original questions. Add an emergent `E1`, `E2`, and so on only
   when discovered evidence raises an in-scope question that could materially
   change the intended decision or understanding. State what triggered it.
6. Read `references/report-contract.md`, then emit that report exactly. Scale
   detail to the brief, but do not remove required sections or question fields.
7. Verify before release: every input question has a dashboard status and one
   corresponding finding; material external claims have nearby citations;
   source statements, synthesis, and inference remain distinguishable; material
   counterevidence and gaps are visible; and no unsupported recommendation is
   introduced.

## Boundaries

- The orchestrator may compose framing and execution, but the execution worker
  must not silently reframe the supplied investigation.
- Never subdelegate from a delegated worker phase.
- State decision implications, but recommend or decide only when the brief
  explicitly asks and supplies the relevant authority or criteria.
- Never fill an evidence gap from memory while presenting it as researched.
- Preserve source licensing and quotation limits. Prefer paraphrase and link to
  the source rather than reproducing substantial source text.

The job succeeds when generated framing remains inspectable, every worker phase
is bounded and accepted by the calling agent, and the stable report accounts
for every input question with traceable evidence, calibrated confidence,
visible limitations, and actionable remaining uncertainty.
