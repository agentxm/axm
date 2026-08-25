---
type: How-to guide
title: How to design agent-mediated user experience
description: How to make a user-facing agent workflow legible, actionable, and authority-aware across openings, progress, questions, gates, and closeouts.
tags: [agent-mediated-ux, human-agent-interaction, user-experience, workflows, progress, questions, approvals, interaction-surfaces, round-trips, register]
status: stable
sources:
  - id: qualitymd-agent-mediated-ux
    resource: https://github.com/qualitymd/quality.md/blob/f0c50e2faa8fb36e1faed62dce2dbfebee5d5511/docs/guides/agent-mediated-ux.md
    title: QUALITY.md — Designing agent-mediated UX
    author: human:craigsmitham
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
---

# How to design agent-mediated user experience

Use this guide when a person experiences a product, workflow, or task through
an agent's messages and artifacts. **Agent-mediated user experience** is the
human-facing sequence of openings, progress updates, questions, choices,
confirmations, results, and handoffs through which the work becomes
understandable and controllable.[^qualitymd-agent-mediated-ux]

The goal is not a uniform transcript. It is an interaction in which the person
can quickly tell:

- what state the work is in;
- whether anything needs attention;
- what action or answer is being requested;
- what the agent recommends and why; and
- what will happen after the person responds.

## Locate the design responsibility

Agent-mediated UX crosses several system surfaces without erasing their
ownership:

| Concern | Responsible surface |
| --- | --- |
| The sequence of user-visible states, questions, decisions, and handoffs | Agent, skill, or workflow behavior |
| The semantic fields, order, labels, and stable identifiers in one response | Prompt and presentation contract |
| Rendering assistant text, a picker, a confirmation control, or a review surface | Harness interaction interface |
| Permission enforcement and tool authorization | Harness authority boundary |
| Whether oversight and intervention are meaningful | Human-control policy |

The workflow should therefore specify interaction intent and fallback behavior
without pretending to own a host's widgets. The harness should render the
available interface without silently inventing the workflow's authority or
decision policy.

## Make pre-activation surfaces consistent

The experience begins before the workflow activates. Keep these surfaces
aligned without duplicating their prose:

| Surface | Primary reader and job |
| --- | --- |
| Model-facing route | Helps the agent select the right capability from a realistic request |
| Human-facing catalog metadata | Helps a person understand what the capability does before selecting it |
| Default prompt or starter | Gives a person a concrete, editable way to begin |
| Runtime opening | Confirms the actual target, scope, and next meaningful transition |

All four should describe the same underlying job and boundaries. They need not
use identical words, and none should promise authority, supported hosts, or
outcomes that the portable workflow does not provide.

## Present task state, not implementation protocol

Translate internal execution into concepts the person can use. Ordinary
progress should report the current phase or result, meaningful scope or
coverage, whether attention is needed, produced artifacts, and the next
user-relevant transition.

Do not routinely narrate schema inspection, payload construction, worker
dispatch, concurrency controls, serialized receipts, retry loops, or hidden
reasoning. Surface an implementation detail when it changes a decision or is
needed to recover, but state the task-level consequence first.

This boundary is progressive disclosure rather than secrecy. A healthy run
usually needs concise task state; a failed run may need the exact failed
operation, error category, preserved state, and recovery action.

## Design the intent before the rendering

Classify each interaction by what the person must do:

| Intent | Fit-for-purpose rendering |
| --- | --- |
| Choose one enumerated option | Single-select affordance or numbered text choices |
| Choose several enumerated options | Multi-select affordance or checklist-style text |
| Confirm or reject one consequential action | Confirmation control or explicit binary text choice |
| Inspect and approve an artifact | Plan, preview, or diff review when available |
| Review a set of produced artifacts and return judgments | Bulk review surface when available, otherwise each artifact and its identifier presented in sequence |
| Supply unconstrained context or a correction | Free text |
| Observe a long-running phase | Progress or task-state surface, with concise text state |
| Authorize a tool or permission boundary | Harness-owned authorization prompt |

Treat native interaction controls as progressive enhancement. Every required
interaction must remain understandable through ordinary assistant output when
the preferred control is absent, unavailable in a headless run, or unable to
carry the necessary explanation.[^qualitymd-agent-mediated-ux]

Keep the semantics in the message rather than relying on short widget labels.
The question, decision consequences, evidence, recommendation, and response
mapping must remain recoverable even when a host truncates labels or supplies
its own numbering. Do not show two competing identifier schemes for the same
choice.

For a small ordinary closed choice, a useful text fallback puts a supported
recommendation first and makes a short stable identifier a valid reply. For a
consequential comparison, follow the balanced ordering in
[Decision-support presentations in Agent Skills](../skills/decision-support-presentations.md)
instead of biasing the comparison by labeling an option as recommended before
the evidence is presented. Use a binary fallback only when the decision is
genuinely binary.

## Design round trips that leave the conversation

Some interactions cannot happen in the transcript. Reviewing twenty generated
artifacts, correcting a structured data set, or inspecting a rendered page is
faster in a purpose-built surface, and a workflow may legitimately produce one,
hand it over, and wait.

A round trip is complete only when the return path is designed as deliberately
as the artifact sent out. State at the emitting step:

- what the person does there, and what counts as finishing;
- how their response comes back — a written file, a pasted result, a reply in
  the conversation — and where the agent will look for it;
- what an empty or partial response means, since silence in a review surface
  usually signals approval while silence in a question does not;
- how the agent identifies the right returned artifact when the surface can
  produce several, including duplicates from repeated attempts; and
- what happens if nothing returns, so an unanswered round trip becomes a visible
  state rather than an indefinite wait.

Degrade along a ladder instead of assuming the richest surface: an interactive
local surface, then a self-contained file the person opens themselves, then the
same content presented directly in the conversation. Anthropic's Skill Creator
follows that ladder for its review step and presents results inline where no
display is available.[^anthropic-skill-creator]

A headless run, a remote session, or an unavailable viewer must still complete
the workflow. The round trip enhances the conversation; it does not replace it.

## Make the hierarchy survive the renderer

Lead an interaction block with its status, result, or primary question. Put the
requested action before supporting rationale when the user must respond. Use
short labeled blocks, parallel lists, or a compact table when several
independent facts must be compared.

Emphasis may reinforce hierarchy, but it cannot create it alone. Position,
separation, indentation, and stable labels should make the ask and response
path obvious if Markdown emphasis is removed. Keep recommendations and their
evidence adjacent to the decision they support.

Prefer direct, calm, operational language. Make terse answers acceptable.
Avoid decorative status markers, marketing language, cheerleading, and vague
reassurance.

## Calibrate vocabulary to the reader

A portable workflow does not know who invoked it. The same skill can be run by
the engineer who built the system and by someone who has never encountered its
vocabulary, and both have to understand what is being asked of them.

Read the register of the request and match it. Where a term is load-bearing and
the person's familiarity is unclear, define it in a clause rather than replacing
it with an approximation; the goal is a shared word, not a simpler one.
Anthropic's Skill Creator states this explicitly for its own audience, treating
some domain terms as safe to use plainly and others as needing evidence of
familiarity first.[^anthropic-skill-creator]

The two failures are symmetrical. Unexplained jargon makes a decision
unanswerable, and over-explanation wastes an expert's attention and reads as
condescension. Neither is solved by a fixed reading level.

## Open substantial workflows proportionately

For a substantial multi-step workflow, make the first user-visible response a
concise frame that reflects the understood intent and previews the path. State
the target, scope, expected effects, artifacts, and next decision point to the
degree they are already known.

Do not force a formal run frame onto a one-step answer or trivial action. The
test is whether early framing gives the person a useful chance to correct a
material misunderstanding or avoid a silent wait.

If discovery is required before a field can be resolved, mark it as unresolved
and later replace it with the discovered value. Do not delay all acknowledgement
until after a long read or tool sequence.

## Report progress at meaningful boundaries

Show progress when the person's mental model would otherwise drift: before a
long phase, after material tool-dependent work, before a real decision point,
or when the expected timing or path changes.

Name domain phases, outcomes, or meaningful coverage rather than internal
command counts. Do not manufacture a percentage from heterogeneous work or
turn progress into a transcript of internal planning. If nothing needs the
person's attention, say so explicitly.

When work continues outside the conversation — a long background job, a queued
external process — say so when it starts and state how the person will next
hear about it. A promised check-in that does not arrive is worse than no
promise, because they stop watching for the result themselves.

## Ask answerable questions

Ask only when the answer cannot be discovered or safely inferred and would
materially change the result, risk, authority, or cost. Do not turn an available
inspection into a user questionnaire, and do not ask for preferences that have
no effect on the work. State a consequential assumption and proceed when it is
safe and cheaper to correct than to interrupt.

A user-facing question should make these elements easy to find when they are
material:

- the question itself;
- why the answer changes the workflow;
- a recommendation supported by available evidence;
- uncertainty or confidence that could affect reliance; and
- the shortest valid response path.

Use an enumerated choice only when the plausible answers are known and
meaningfully distinct. Use free text for open cardinality, novel context, and
corrections that cannot be bounded honestly. Phrase choices in the user's
decision terms rather than exposing internal enum names.

When the agent has already inferred several related facts, present a checkpoint
that asks the person to confirm or correct the draft. Seed it with the actual
inferences and evidence gaps; do not replace specific correction opportunities
with an empty invitation to add anything else.

## Use real gates, not ritual confirmations

First derive authority from the user's request, governing policy, and harness
controls. Add a workflow gate only when consequence, unresolved intent,
preference-sensitive judgment, or an explicitly promised checkpoint requires
the person to review or decide. Do not ask again for authority that the request
already grants, and do not duplicate a permission prompt the harness will
enforce.

Keep three interaction shapes distinct:

- **Informational preview** — tells the person what happens next and does not
  request a response.
- **Review gate** — asks for correction or approval of an inferred plan or
  artifact, then waits.
- **Decision gate** — asks the authorized person to choose among consequential
  alternatives, including a non-mutating path when one is viable, then waits.

Any invitation to adjust, approve, or say that something looks good is a real
gate. After emitting it, stop until the person responds. If the workflow should
continue immediately, use an informational preview and do not imply that
feedback is being awaited.[^qualitymd-agent-mediated-ux]

A useful gate leads with the decision, makes the choices and response mapping
obvious, and includes only the rationale, completion condition, and boundary
needed to decide. Approval is not meaningful when the alternative is hidden or
the proposed effects cannot be inspected.

When a review gate asks a person to judge produced artifacts, put the artifacts
in front of them before offering an assessment of them. An assessment delivered
first anchors the review it was meant to inform, and that independent reading is
the reason the gate exists. Ordering carries this, not tone: a summary placed
ahead of the evidence has already framed it.
[Decision-support presentations in Agent Skills](../skills/decision-support-presentations.md)
applies the same constraint to recommendations among options.

## Make interruption and recovery legible

Cancellation, retry exhaustion, partial mutation, timeout, and unavailable
affordances are user-visible states, not merely implementation details. When
one occurs, report what completed, what did not, which state or artifacts were
preserved, any external effects that may already exist, and the next safe
action. Bound retries before starting an external or mutating phase so that a
failure cannot become an indefinite loop or repeated side effect.

Resources the agent created are part of that state. A background process, a
served page, a temporary workspace, or an external record opened mid-workflow
belongs either to a closeout that tears it down or to a report that names it and
says how to remove it. A cancelled run that silently leaves a bound port or an
orphaned process has left the person state they did not ask for and cannot see.

If rollback is unavailable or incomplete, say so directly. Do not label a
partially completed run as success, and do not imply that cancellation reversed
effects unless reversal was actually established.

## Close with outcome evidence

End with the outcome rather than raw command output. Name changed artifacts or
external effects, validation performed, important limitations or unresolved
gaps, boundaries of what was not done, and the next useful action when one
exists.

If validation failed or could not run, state that directly and distinguish the
intended result from the result actually established. The person should not
have to reconstruct success, partial completion, or remaining obligations from
logs.

## Apply the guidance to an Agent Skill

When an Agent Skill owns a meaningful user-facing sequence, make the interaction
contract explicit at the steps that emit it:

1. Identify the user-visible states from opening through closeout.
2. Classify every question, checkpoint, review, and approval by interaction
   intent.
3. State which surface is preferred and provide a complete ordinary-output
   fallback for required interactions.
4. Define what evidence supports recommendations and where uncertainty appears.
5. Derive gates from authority and consequence; do not add ceremonial pauses.
6. Specify the stable fields, ordering, and identifiers that affect meaning.
7. State what the agent does after each answer, refusal, correction, timeout,
   cancellation, retry exhaustion, partial effect, unreturned round trip, or
   unavailable affordance, and which agent-created resources it tears down.
8. Keep one-step or non-interactive skills proportionate; do not add progress
   theater or confirmation rituals merely to conform to this guide.

Exercise the skill on a host with its richer interaction affordances and on a
plain-text or headless path. Check that the same intent survives both, gates
actually wait, identifiers remain stable, missing affordances degrade safely,
round trips either return or fail visibly, and the closeout reports evidence
rather than merely asserting success.

## Related guidance

- [Human control and collaboration](human-control-and-collaboration.md) — when
  oversight, intervention, and approval are meaningful.
- [Action and observation interfaces](../harness/action-and-observation-interfaces.md) —
  what the harness renders and how structured interaction surfaces differ.
- [Workflow contracts](../skills/workflow-contracts.md) — how a skill defines
  inputs, authority, failures, outputs, presentation, and completion.
- [Response and presentation contracts](../prompts/response-and-presentation-contracts.md) —
  how fields, order, labels, emphasis, and final handoff become explicit.

[^qualitymd-agent-mediated-ux]: QUALITY.md — Designing agent-mediated UX
[^anthropic-skill-creator]: Anthropic — Skill Creator
