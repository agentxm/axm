---
type: Domain Concept
description: The seven AgentXM extension types — skills, MCP servers, subagents, rules, hooks, knowledge, and packs — and the governing standard behind each.
tags: [extension-types, skills, mcp, subagents, rules, hooks, knowledge, packs]
status: stable
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
sources:
  - id: axm-readme
    resource: https://github.com/agentxm/axm/blob/main/README.md
    title: AXM repository README (extension types table)
  - id: schemas
    resource: https://axm.sh/schemas/
    title: AXM extension manifest JSON Schemas
---

# Extension types

The AgentXM product model defines seven canonical extension types: six leaf
types plus one container type.[^axm-readme] Each type has a singular canonical
ID (used in manifests, APIs, and persistence), a plural route segment (used in
FQNs and CLI subcommands), and a product-facing label — the exact spellings
are normative in [Identifier grammar](identifier-grammar.md).

| Type ID      | Product label | What it does                                                                                                                                                                          |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill`      | Skills        | Teaches the agent reusable capabilities or workflows. Every skill carries an upstream `SKILL.md` document; native skills additionally carry a schema-validated `skill.json` manifest. |
| `mcp-server` | MCP Servers   | Connects agents to tools and resources via the Model Context Protocol.                                                                                                                |
| `subagent`   | Subagents     | Defines specialized delegated sub-agents for task work.                                                                                                                               |
| `rule`       | Rules         | Injects managed, rule-oriented guidance into workspace instruction files governed by the top-level `instructionFiles` setting.                                                        |
| `hook`       | Hooks         | Managed agent lifecycle hooks: materializes executable hook content and merges native agent hook settings, via a `hook.json` manifest.                                                |
| `knowledge`  | Knowledge     | An isolated bundle of curated Markdown concepts (Open Knowledge Format 0.2), discoverable and readable on demand without ever being injected into agent instructions.                 |
| `pack`       | Packs         | A curated bundle referencing multiple extensions of the six leaf types. See [Pack semantics](pack-semantics.md).                                                                      |

## Governing standards

Several types implement open standards rather than AXM-proprietary formats:
Skills follow [Agent Skills](../ecosystem/agent-skills.md), MCP Servers follow
the [Model Context Protocol](../ecosystem/model-context-protocol.md), Rules
target the [AGENTS.md](../ecosystem/agents-md.md) instruction-file convention,
and Knowledge bundles use
[Open Knowledge Format](../ecosystem/open-knowledge-format.md).
Every type has a published manifest JSON Schema under
[axm.sh/schemas](https://axm.sh/schemas/); the schemas are the executable
contract and remain the system of record for manifest shape.[^schemas]

## Distinctions worth knowing

- **Extension type vs. product feature.** The technical type ID (`mcp-server`)
  and the product label ("MCP Servers") map one-to-one; only case and style
  differ.
- **Library is not a type.** Registry Libraries collect extension identities
  live; they have no version, archive, manifest, or publish step and are never
  install targets.
- **Enabled/disabled is a behavior toggle**, not identity state, and applies
  to configured entries of the types that support it — disabling keeps the
  extension installed while removing it from the agent's active surface.

[^axm-readme]: AXM repository README (extension types table).

[^schemas]: AXM extension manifest JSON Schemas.
