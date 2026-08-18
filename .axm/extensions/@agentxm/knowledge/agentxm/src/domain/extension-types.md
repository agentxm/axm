---
type: Domain Concept
description: The nine AgentXM extension types — skills, commands, MCP servers, subagents, context files, rules, hooks, knowledge, and packs — and the governing standard behind each.
tags: [extension-types, skills, commands, mcp, subagents, rules, hooks, knowledge, packs]
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

The AgentXM extension model defines nine canonical extension types: eight leaf
types plus one container type.[^axm-readme] Each type has a singular canonical
ID (used in manifests, APIs, and persistence), a plural route segment (used in
FQNs and CLI subcommands), and a product-facing label — the exact spellings
are normative in [Identifier grammar](identifier-grammar.md).

| Type ID      | Product label | What it does                                                                                                                                                                          |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill`      | Skills        | Teaches the agent reusable capabilities or workflows. Every skill carries an upstream `SKILL.md` document; native skills additionally carry a schema-validated `skill.json` manifest. |
| `command`    | Commands      | User-invokable command / stored-prompt workflow surface.                                                                                                                              |
| `mcp-server` | MCP Servers   | Connects agents to tools and resources via the Model Context Protocol.                                                                                                                |
| `subagent`   | Subagents     | Defines specialized delegated sub-agents for task work.                                                                                                                               |
| `files`      | Context Files | Declaratively materializes content bytes into a workspace. It has no agent-compatibility surface and is not the semantic home for instruction files or rules.                         |
| `rule`       | Rules         | Injects managed, rule-oriented guidance into workspace instruction files when the workspace's top-level `instructionFiles` capability is enabled.                                     |
| `hook`       | Hooks         | Managed agent lifecycle hooks: materializes executable package bodies and merges native agent hook settings, via a `hook.json` manifest.                                              |
| `knowledge`  | Knowledge     | An isolated bundle of curated Markdown concepts (Open Knowledge Format 0.2), discoverable and readable on demand without ever being injected into agent instructions.                 |
| `pack`       | Packs         | A curated bundle referencing multiple extensions of the eight leaf types. See [Pack semantics](pack-semantics.md).                                                                    |

## Governing standards

Several types implement open standards rather than AXM-proprietary formats:
Skills follow the Agent Skills format ([agentskills.io](https://agentskills.io)),
MCP Servers follow the [Model Context Protocol](https://modelcontextprotocol.io),
Rules target the [AGENTS.md](https://agents.md) instruction-file convention,
and Knowledge bundles use [Open Knowledge Format 0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
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
