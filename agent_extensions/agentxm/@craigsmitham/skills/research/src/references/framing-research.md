# Framing bounded research

Frame the smallest set of evidence-seeking questions most likely to improve the
intended decision or understanding. Do not assume the subject is defective.

## Bind the frame

Record the subject, boundary, intended use, observable context, constraints,
supplied limits, and requested question count. Default to three through six
questions. Infer a missing intended use only when the subject is sufficiently
bounded, and label the inference as an assumption. Ask one precise question
only when ambiguity would materially change the frame.

## Preserve independence

Originating analysis includes a hypothesis, diagnosis, suspected cause,
conclusion, recommendation, favored alternative, or proposed solution. When it
exists, frame from hypothesis-neutral input containing only:

- the subject and boundary;
- directly observable conditions and outcomes;
- relevant population, environment, and timeframe;
- the intended use; and
- authoritative constraints and neutral terminology.

Exclude causes, conclusions, confidence, recommendations, proposed fixes, and
details selected because they support one explanation. Generate questions in a
fresh context that receives none of the removed material.

Use `procedurally blind` only when the fresh framing context received solely
hypothesis-neutral input. Otherwise use `ordinary`. Never claim blindness from
neutral wording or same-context reframing.

## Select and form questions

Consider the concerns that materially affect the intended use, including value
and outcomes, assumptions and explanatory models, affected people, feasibility
and dependencies, alternatives and tradeoffs, failure modes, consequences, and
evidence sufficiency.

Prioritize questions by importance, uncertainty, decision leverage,
consequences of error, and expected information gain. Prefer questions that
test a central claim, distinguish plausible explanations or alternatives,
surface consequential constraints or effects, or establish what evidence would
justify an answer.

Reject generic, overlapping, loaded, or unanswerable questions. Cover promise
and peril proportionately and use symmetric causal wording.

## Research Brief contract

Return fewer than 600 words in this shape:

```markdown
# Research Brief

## Context

- **Intended use:** supplied value or a labeled assumption
- **Subject and boundary:**
- **Observable context:**
- **Constraints:** supplied value or `None supplied`
- **Assumptions:** consequential assumptions or `None identified`
- **Independence status:** `ordinary` or `procedurally blind`

## Research questions

| ID | Research question | Why it matters | Evidence needed |
| --- | --- | --- | --- |

## Deliberate omissions

Up to three plausible concerns omitted as lower value, each with a short reason,
or `None`.
```

Use stable `Q1`, `Q2`, and so on in priority order. `Evidence needed` names an
observation, comparison, source, measurement, or disconfirming evidence; it
must not answer the question.

Before returning a procedurally blind brief, verify that its wording,
specificity, and order do not reveal the originating analysis. Framing does not
answer questions, gather evidence, create an interview instrument, recommend a
decision, or produce an implementation plan.
