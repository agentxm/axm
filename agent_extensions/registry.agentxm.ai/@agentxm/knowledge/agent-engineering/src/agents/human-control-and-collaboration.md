---
type: Explanation
title: Human control and collaboration
description: Makes oversight, approvals, intervention, explanation, and responsibility usable throughout a run.
tags: [human-in-the-loop, oversight, approvals, intervention, transparency, mental-models, collaboration]
status: stable
sources:
  - id: hai-guidelines
    resource: https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/publications/
    title: Microsoft — Guidelines for human-AI interaction
  - id: pair-mental-models
    resource: https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/
    title: Google PAIR — Mental models
  - id: anthropic-trust
    resource: https://www.anthropic.com/research/trustworthy-agents
    title: Anthropic — Building and evaluating trustworthy agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Human control and collaboration

Human oversight is a control relationship, not a checkbox. The responsible
person must be able to form an accurate mental model, see consequential state,
intervene at meaningful times, and remain accountable for deployment choices.
Design the interaction so the person's model of capability and limits tracks
the deployed system rather than an anthropomorphic impression.[^pair-mental-models]

## Design across the run

| Moment | Human need |
| --- | --- |
| Before | Understand capability, limits, authority, uncertainty, and expected involvement |
| During | See progress and material decisions; approve, redirect, pause, or stop |
| At handoff | Receive outcome, evidence, unresolved uncertainty, effects, and next obligations |
| After | Correct state or memory, contest an outcome, review impact, and improve or withdraw the system |

Approval is meaningful only when the reviewer has enough context, time,
authority, and a real alternative to approval. Do not ask a person to approve a
large opaque action bundle or rely on alert fatigue as supervision.

Represent plans, decisions, sources, uncertainty, and effects at the level
needed for collaboration. This does not require disclosure of hidden
chain-of-thought. Use concise rationales, evidence links, previews, diffs,
receipts, and explicit questions.

Human-AI interaction guidance emphasizes setting expectations, supporting
efficient correction and dismissal, explaining relevant behavior, and updating
users when the system changes.[^hai-guidelines] Trustworthy-agent design adds
human control, transparency, privacy, and secure interaction as distinct
requirements.[^anthropic-trust]

[^hai-guidelines]: Microsoft — Guidelines for human-AI interaction
[^pair-mental-models]: Google PAIR — Mental models
[^anthropic-trust]: Anthropic — Building and evaluating trustworthy agents
