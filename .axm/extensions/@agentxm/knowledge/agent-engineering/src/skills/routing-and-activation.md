---
type: Explanation
title: Routing and activation
description: How metadata becomes a behavioral selection contract for implicit and explicit invocation.
tags: [agent-skills, routing, activation, description, discovery]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: openai-build-skills
    resource: https://learn.chatgpt.com/docs/build-skills
    title: OpenAI — Build skills
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
---

# Routing and activation

Before activation, a host commonly exposes only a skill's name and description.
The description is therefore executable routing behavior, not catalog prose.
OpenAI and Anthropic both emphasize describing what the skill does and when it
should be used.[^openai-build-skills][^anthropic-best-practices]

## Routing contract

A useful description contains:

1. **Capability** — the outcome or job the skill performs.
2. **Positive triggers** — verbs, artifacts, file types, tools, and domain terms
   likely to appear in real requests.
3. **Negative boundary when needed** — a plausible adjacent task that would
   otherwise over-match.

Put all selection information in metadata; the body cannot repair a missed
activation because it has not loaded yet. Do not accumulate exclusions for
neighbors that are unlikely to collide: every extra clause consumes discovery
attention and can make the route less legible.

## Distinct surfaces

- Model-facing descriptions optimize selection.
- Human-facing registry descriptions optimize discovery and trust.
- Explicit invocation bypasses routing but does not prove implicit selection.
- Host invocation policy may permit, suppress, or isolate implicit loading.

## Failure classes

| Failure               | Evidence                                                      | Likely correction                                           |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Miss                  | Clear positive does not select the skill                      | Add recognizable capability or trigger language             |
| False positive        | Adjacent negative selects the skill                           | Narrow capability or add a negative boundary                |
| Collision             | Several skills plausibly match                                | Differentiate responsibility, artifacts, or lifecycle stage |
| Keyword stuffing      | Description selects broadly but destination cannot fulfill it | Align metadata with actual capability                       |
| Explicit-only success | Manual invocation works, implicit does not                    | Fix routing; do not bloat the body                          |

[^openai-build-skills]: OpenAI — Build skills

[^anthropic-best-practices]: Anthropic — Skill authoring best practices
