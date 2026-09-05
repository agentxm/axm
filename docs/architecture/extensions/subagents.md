---
type: Architecture
status: stable
description: How AXM represents portable subagents and renders them into agent-specific delegated-agent surfaces.
depends-on:
  - ./overview.md
  - ./targeting.md
---

# Subagents

A Subagent is a reusable delegated-agent profile that AXM adapts to the native
subagent surface of each configured agent.

## Responsibilities

AXM keeps one portable canonical definition and renders the native profile
format each supported agent requires. Where an agent lacks a native subagent
surface, AXM may use a declared capability-preserving fallback whose behavior
remains understandable to the user.

## Non-responsibilities

AXM does not schedule delegation, choose when a parent agent delegates, define
an industry subagent standard, or promise equivalence when a target cannot
represent the profile. Agent-specific output is not canonical content.

## State and realization

Canonical subagent content owns identity, instructions, and portable
configuration. Native Markdown, JSON, TOML, or other agent formats are derived
projections. A fallback projection remains a realization of the Subagent; it
does not change the extension's type to Skill.

## Ownership and coexistence

The native ownership unit is one profile file or one named entry, as defined by
the target adapter. Profiles with distinct native identities can coexist. An
unowned file or entry at the required identity is a collision; a shared format
without a stable entry boundary is unsupported.

AXM may rewrite or remove only a profile it can trace to the desired Subagent.
Name or path alone is not ownership evidence. A Skill fallback follows the
Skill directory ownership rules rather than acquiring weaker Subagent rules.

## Invariants

- All target renderers derive from the same canonical subagent meaning.
- Agent-specific overrides are bounded enhancements, not separate authorities.
- A fallback is used only when its semantic limits are explicit and accepted
  by the architecture.
- Unowned native profiles are preserved; only profiles occupying a required
  identity are collisions.
- Activation removes projections while retaining desired and canonical state.

## Testing strategy

Golden and behavior tests prove deterministic rendering across native formats,
bounded overrides, independent foreign profiles, same-identity collisions,
ownership evidence, explicit fallback behavior, unsupported capabilities,
activation, safe removal, and round-trip lifecycle invariants.
