---
type: Reference
title: Context quality and authority
description: How relevance, scope, currency, provenance, trust, and cost govern selection.
tags: [context-quality, authority, provenance, freshness, scope, attention-budget]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
---

# Context quality and authority

Useful context is not the largest available set. It is the smallest set that is
sufficient for the next decisions while preserving material constraints and
routes to deeper evidence.

## Selection qualities

| Quality | Question |
| --- | --- |
| Relevant | Does this information change an upcoming decision? |
| Sufficient | Can the agent act without missing a material constraint? |
| Scoped | Does it apply to this user, component, environment, role, and task? |
| Current | Is its observation or verification time adequate for the consequence? |
| Attributable | Can the agent identify its source and transformation history? |
| Authoritative | Is this source entitled to define the claim it makes? |
| Trustworthy | Could this content be adversarial, accidental, generated, or unverified? |
| Economical | Is its decision value proportionate to attention, latency, and retrieval cost? |

Anthropic describes context as a finite attention resource with diminishing
returns, favoring compact high-signal information over exhaustive loading.[^anthropic-context]

## Authority is claim-specific

Separate authority for:

- intended behavior;
- current implementation;
- mechanically verified contracts;
- observed runtime state;
- rationale and historical decisions; and
- user or organizational policy.

A design document may own intent but not current runtime truth. Code may own
implementation but not the reason for a constraint. A test may prove one
mechanical property without establishing product value. Preserve these
distinctions in metadata, labels, summaries, and handoffs.

## Untrusted context

External pages, repository text, messages, tool results, and retrieved documents
may contain instructions without having instruction authority. Selection should
carry provenance and trust into the prompt or tool interface, while the harness
enforces permissions and validates actions outside the model.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
