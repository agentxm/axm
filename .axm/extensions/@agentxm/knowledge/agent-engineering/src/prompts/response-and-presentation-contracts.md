---
type: Reference
title: Response and presentation contracts
description: How answer shape, relative order, identifiers, emphasis, uniqueness, and handoff become explicit output obligations.
tags:
  [
    response-contract,
    presentation,
    answer-shape,
    ordering,
    identifiers,
    structured-output,
    decision-support,
  ]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-16T01:39:08Z }
stale_after: 2027-02-14
sources:
  - id: prompt-report
    resource: https://arxiv.org/abs/2406.06608
    title: The Prompt Report — A Systematic Survey of Prompting Techniques
  - id: google-prompting
    resource: https://ai.google.dev/gemini-api/docs/prompting-strategies
    title: Google — Prompt design strategies
  - id: ipdas
    resource: https://www.bmj.com/content/393/bmj-2025-088116
    title: Updated International Patient Decision Aid Standards, version 5.0
  - id: advice-timing
    resource: https://arxiv.org/abs/2205.09696
    title: Who Goes First? Influences of Human-AI Workflow on Decision Making in Clinical Imaging
---

# Response and presentation contracts

A response contract defines what a model must return. A presentation contract
adds relative order, labels, emphasis, uniqueness, and the final interaction
handoff when those properties affect interpretation or downstream use.

The Prompt Report calls attention to answer shape, answer space, and extraction
as design decisions rather than incidental formatting.[^prompt-report] Define:

- required and optional sections;
- field names and permitted values;
- relative order when sequencing changes meaning;
- the identifier scheme for enumerated items a reply, later turn, or durable
  record must refer to;
- repetition or uniqueness constraints;
- length and compression priorities;
- uncertainty, refusal, and missing-evidence forms;
- citations or provenance requirements; and
- the final status, choice request, or machine handoff.

Use deterministic structured-output or schema validation when syntax must be
enforced. Google recommends native structured output for complex schemas rather
than relying only on natural-language formatting instructions.[^google-prompting]

## Literal and fillable parts of an output template

An output template shown to the model is not an input template assembled from
variables; it is a shape the response must reproduce. It still mixes tokens the
contract fixes with slots the response fills, and it must state which is which.
A template presented without that distinction is read as an illustration, and a
nearby instruction to adapt detail or depth is read as license to vary the fixed
tokens too.

Identifier schemes are the common casualty. Whether items are labeled `A, B, C`,
`1, 2, 3`, or by name is arbitrary in isolation but contractual in use: the
reply, the ledger entry, the downstream artifact, and any sibling surface must
name the same item the same way. Fix the scheme once, mark it literal, and keep
it stable across the surfaces that share a referent. Where a rendering layer
imposes its own labels, define the mapping rather than leaving both schemes
visible.

## Decision-support presentation

When a model compares alternatives, recommends one, and leaves authority with a
human, use this default sequence:

1. Decision question and proposed status.
2. Evidence, criteria, constraints, and affected boundaries.
3. Every viable option in parallel structure and comparable detail.
4. Material exclusions and their evidence-based reason.
5. One recommendation after the complete neutral comparison.
6. An explicit choice, revision, deferral, or evidence request without repeating
   the recommendation.

Balanced decision aids make the decision and relevant alternatives explicit and
present benefits and harms comparably.[^ipdas] Human-AI studies also show that
advice timing can change anchoring and reliance.[^advice-timing] For high-stakes
or preference-sensitive decisions, consider eliciting priorities or a
provisional view before revealing the recommendation.

Grade contractual structure directly. Semantic completeness does not excuse an
invalid order, duplicate recommendation, omitted choice request, or misleading
visual emphasis.

[^prompt-report]: The Prompt Report — A Systematic Survey of Prompting Techniques

[^google-prompting]: Google — Prompt design strategies

[^ipdas]: Updated International Patient Decision Aid Standards, version 5.0

[^advice-timing]: Who Goes First? Influences of Human-AI Workflow on Decision Making in Clinical Imaging
