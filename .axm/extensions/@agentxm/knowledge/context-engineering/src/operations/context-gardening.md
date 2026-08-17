---
type: Playbook
title: Context gardening
description: How observed work drives authority repair, routing, pruning, promotion, and retirement.
tags: [context-gardening, maintenance, pruning, freshness, discovery, authority]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-09T22:12:38Z }
verified:
  - by: codex/gpt-5.6
    at: 2026-08-09T22:13:44Z
stale_after: 2027-02-09
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: cursor-improvement
    resource: https://cursor.com/blog/continually-improving-agent-harness
    title: Cursor — Continually improving our agent harness
---

# Context gardening

**Context gardening** continually cultivates a context system from observed
work. It keeps useful information discoverable, removes stale or distracting
material, repairs weak routes, and assigns recurring guidance to the surface
that expresses it most truthfully.

Anthropic describes context engineering as iterative curation over changing
information rather than one-time prompt writing.[^anthropic-context]

## Observe before changing

Use evidence from representative tasks:

- repeated rediscovery of an existing fact or workflow;
- recurring wrong or stale guidance;
- unnecessary broad loading or excessive tool results;
- contradictions among intent, implementation, checks, and runtime state;
- missing routes, broken destinations, or misleading metadata;
- compaction or handoff loss; and
- feedback that does not expose a recovery path.

A single surprising run may be noise. Repetition or consequence determines the
urgency of a durable intervention.

## Finding classes

| Class      | Meaning                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| Missing    | Required context or route does not exist                                                    |
| Hidden     | Useful context exists but likely entry points cannot discover it                            |
| Mis-scoped | Guidance loads more broadly or narrowly than its authority                                  |
| Duplicated | Several surfaces restate one claim without a canonical owner                                |
| Stale      | Plausible context no longer matches its source or environment                               |
| Unowned    | No one can decide whether to revise, retain, or retire it                                   |
| Wrong form | A prompt, instruction, skill, document, tool, check, or task record owns the concern poorly |
| Excessive  | Context cost exceeds its demonstrated decision value                                        |
| Untrusted  | Content carries more authority than its provenance warrants                                 |

## Cultivation moves

| Move     | Purpose                                                              |
| -------- | -------------------------------------------------------------------- |
| Add      | Supply a missing invariant, route, observation, or recovery signal   |
| Clarify  | Make scope, authority, provenance, freshness, or selection explicit  |
| Relocate | Move content to the nearest truthful owner                           |
| Route    | Add a compact trigger or index instead of copying depth              |
| Prune    | Remove duplication, obsolete detail, and low-value context           |
| Promote  | Replace recurring prose with a skill, tool, check, schema, or policy |
| Retire   | Mark superseded context and remove it from active selection          |
| Verify   | Test discovery, use, cost, and outcome on representative work        |

Prefer subtraction and routing to accretion. Cursor similarly describes using
observed failures to improve the responsible harness surface and then measure
the result.[^cursor-improvement]

## Completion

Re-trace representative tasks and establish that the intended source is now
discoverable at the right depth, its authority and freshness are legible, the
context cost is proportionate, and verification or recovery remains available.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents

[^cursor-improvement]: Cursor — Continually improving our agent harness
