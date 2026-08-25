---
type: Explainer
description: How the Model Context Protocol connects AI applications to external tools, data, prompts, and workflows.
tags: [mcp, model-context-protocol, interoperability]
status: stable
generated:
  by: openai/codex
  at: 2026-08-14T00:43:46Z
sources:
  - id: introduction
    resource: https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro
    title: What is the Model Context Protocol?
  - id: architecture
    resource: https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
    title: MCP architecture overview
---

# Model Context Protocol

The Model Context Protocol (MCP) is an open standard for connecting AI
applications to external systems.[^introduction] It gives clients and servers a
common way to discover capabilities, exchange context, and request actions.

MCP uses a client-server model. An **MCP host** is the AI application. It creates
an **MCP client** for each **MCP server** it connects to. A server may run locally
over standard input and output or remotely over HTTP.[^architecture]

## What the protocol provides

MCP standardizes communication and capability discovery. Servers can expose
three central primitives:

- **tools** that perform actions;
- **resources** that provide data or context; and
- **prompts** that provide reusable interaction templates.

The protocol separates those data-layer semantics from the transport used to
carry messages. This lets different hosts and servers interoperate without
sharing an application implementation.

MCP does not dictate how an AI application uses a model or manages the context
it receives. It does not distribute or install servers, grant permission to
execute them, or make an arbitrary server safe. Authentication, authorization,
consent, process isolation, and product experience remain responsibilities of
the participating systems.

MCP is also not an agent-to-agent protocol or an editor-to-coding-agent
protocol. Those are different interoperability boundaries.

## Relationship to neighboring standards

An [Agent Skill](agent-skills.md) provides agent-readable instructions; an MCP
server provides live protocol capabilities. [Agent Plugins](agent-plugins.md)
can carry both skills and MCP server configuration in one portable plugin.

## Relationship to AgentXM

AgentXM MCP Server extensions describe MCP integrations that AXM can configure
for supported agent clients. MCP remains authoritative for protocol behavior;
AgentXM adds extension identity, distribution, workspace configuration, and
agent-specific materialization around it.

[^introduction]: MCP introduction.

[^architecture]: MCP architecture overview.
