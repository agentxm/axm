---
type: Explanation
title: Instruction files
description: How persistent scoped guidance supplies invariants and routes without becoming a universal manual.
tags: [instruction-files, persistent-context, scope, routing, progressive-disclosure]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-09T20:48:38Z }
verified:
  - by: codex/gpt-5.6
    at: 2026-08-09T22:13:44Z
stale_after: 2027-02-09
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: context-files-evaluation
    resource: https://arxiv.org/abs/2602.11988
    title: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
---

# Instruction files

An **instruction file** is persistent feedforward context that a harness loads
for a scope without requiring the caller to restate it for every task. “File” is
a common storage form; the informational role is the defining property.

Persistent context is expensive because its cost is paid before the exact task
is known. Ask:

> Must the agent know this throughout the scope, or does it need a reliable
> route only when a narrower situation occurs?

Keep the former concise. Put the latter behind progressive disclosure.

## Appropriate content

| Responsibility     | Typical content                                                      |
| ------------------ | -------------------------------------------------------------------- |
| Invariants         | Stable safety, compatibility, authority, or quality constraints      |
| Operating facts    | Non-obvious environment facts that change the next action            |
| Working agreements | Stable collaboration, evidence, and handoff expectations             |
| Discovery routes   | Conditions for loading a procedure, reference, tool, or domain guide |

Instruction files should not absorb background explanation, exhaustive
reference, task backlogs, or long procedures.

## Scope and composition

- broad scopes own only genuinely broad guidance;
- narrow scopes own their differences rather than copying parents;
- repeated content has one authoritative owner;
- precedence and overrides remain inspectable; and
- representative entry points can reveal the effective instruction set.

## Guidance versus enforcement

Instructions influence reasoning. Reusable workflows belong in skills or
guides, details in knowledge, external capabilities in tools, and mechanically
decidable properties in checks, schemas, or policy engines. The instruction
surface may route to those owners.

A repository study found context files could increase work and cost without a
significant success improvement, reinforcing evaluation rather than
accretion.[^context-files-evaluation]

[^context-files-evaluation]: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
