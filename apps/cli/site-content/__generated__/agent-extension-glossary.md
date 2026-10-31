# Agent Extension Glossary

Shared vocabulary for using, explaining, and engineering agent extensions.
These definitions build on the public AgentXM vocabulary and remain under
review.[^agentxm-model][^agentxm-types][^agentxm-naming] Product schemas and
external standards retain authority over their executable and protocol contracts.

## Foundation

### Agent

An AI system that can select and carry out actions toward a goal using the
context, tools, and permissions available to it.

### Open agent

In this glossary, an open agent is an agent that supports third-party
extensibility through open standards and documented interfaces, enabling
extensions to be developed, shared, and managed across compatible agents.
This usage builds on the portability and interoperability provided by standards
such as Agent Skills, MCP, and AGENTS.md.[^agent-skills-standard][^mcp-standard][^agent-instructions-format]

Tools such as AXM use these capabilities to configure agents' harnesses and
manage portable extensions. Here, “open” describes extensibility and
interoperability; it does not require open-source software or open model weights.
Portability depends on the extension types and capabilities each agent supports.

### Harness

The software and configuration surrounding an AI model that enable and shape
its operation as an agent. This includes how instructions, context, tools,
permissions, and feedback are provided and coordinated.[^harness-anatomy]

Agent extensions provide reusable components for configuring and extending an
agent's harness. Harness engineering involves composing, evaluating, and improving
that setup to make the agent more effective and reliable.[^user-harness][^harness-primitives]

### Coding agent

An agent designed to perform software-development tasks, such as exploring a
codebase, changing code, running tests, and investigating failures.

### Bot

A type of AI agent with a persistent identity and context that people can message
to delegate tasks or ongoing responsibilities. It can work between conversations,
respond to events, and proactively provide updates or request input.

More broadly, “bot” can also refer to automated software that does not use AI.

### AI Desktop Assistant

A type of AI agent designed for general-purpose knowledge work through a
conversational desktop application. It can use a person's files, data, and
connected services to research, analyze, create artifacts, and carry out
multi-step tasks, with capabilities extended through skills and tool connections.

These terms describe overlapping capabilities and ways of interacting with
software; a single product can fit more than one description.

### Agent Extension

A package managed by an Agent Extension Manager, giving skills, knowledge
bundles, and other extension types a consistent way to be distributed, installed,
and maintained.

### Agent instructions

Guidance an agent reads to understand how it should behave and work, commonly
stored in files such as [AGENTS.md](https://agents.md/) or `CLAUDE.md`.
Agent instructions are not an extension type; their files may contain both
authored guidance and content injected by Rule extensions.

## Extension types

### Agent Skill

Reusable, task-specific instructions and supporting resources that teach an
agent a capability or workflow. Agent Skills follow the
[Agent Skills standard](https://agentskills.io/), with `SKILL.md` as the entry point.
See [skills](https://axm.sh/docs/skills).

### Knowledge bundle

A collection of curated knowledge that an agent can discover and consult when
needed. AXM knowledge bundles use
[Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
for their Markdown concepts. See [knowledge](https://axm.sh/docs/knowledge).

### Extension pack

A collection of references to extensions that can be distributed and installed
together. Each included extension retains its own identity.
See [packs](https://axm.sh/docs/packs).

### Subagent

An agent assigned a delegated task or specialized role by another agent.
A subagent extension provides the role's definition, including instructions,
tools, and context as supported by the application running it.
See [subagents](https://axm.sh/docs/subagents).

### MCP server (connection)

An MCP server exposes tools, resources, or prompts through the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/). The extension configures an agent application's connection to that
server; the connection configuration and server software are separate artifacts.
See [MCP servers](https://axm.sh/docs/mcp-servers).

### Rule

An extension type that injects a reusable rule or instruction into agent
instruction files, such as [AGENTS.md](https://agents.md/). The Agent Extension
Manager manages the Rule extension and its injected content.
See [rules](https://axm.sh/docs/rules).

### Hook

An action configured to run when a particular event occurs in an agent's
workflow. A hook extension supplies the configuration and executable behavior
supported by the application. See [hooks](https://axm.sh/docs/hooks).

## Tools and services

### Agent Extension Manager

A tool for managing the lifecycle of agent extensions. **AXM** is the Agent
Extension Manager CLI, invoked as `axm`; its website and documentation are at
[axm.sh](https://axm.sh).

### Agent Extension Registry

A service for publishing, discovering, and distributing versioned agent
extensions. AgentXM's registry provides the machine-facing distribution
service used by AXM and other clients.

### Agent Extension Marketplace

A website where people discover, evaluate, and obtain agent extensions.
AgentXM's marketplace presents extensions and their supporting information
through a human-facing experience.

### agentxm.ai

The website and web application for **AgentXM**, the platform for discovering,
creating, sharing, and using agent extensions. It provides access to the
Agent Extension Marketplace and management of registry resources.

[^agentxm-model]: The AgentXM product model, `@agentxm/knowledge/agentxm@1.4.0#domain/extension-model`.

[^agentxm-types]: Extension types, `@agentxm/knowledge/agentxm@1.4.0#domain/extension-types`.

[^agentxm-naming]: AXM and AgentXM naming, `@agentxm/knowledge/agentxm@1.4.0#domain/naming`.

[^harness-anatomy]: Vivek Trivedy, [The Anatomy of an Agent Harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness), LangChain.

[^user-harness]: Birgitta Böckeler, [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html).

[^harness-primitives]: Anthropic, [Harness Primitives for Long-Running Claude Agents](https://github.com/anthropics/cwc-long-running-agents).

[^agent-skills-standard]: [Agent Skills Overview](https://agentskills.io/home).

[^mcp-standard]: [What is the Model Context Protocol (MCP)?](https://modelcontextprotocol.io/docs/getting-started/intro).

[^agent-instructions-format]: [AGENTS.md](https://agents.md/).

---

Source: [Agent Extension Glossary](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md), @agentxm, [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Snapshot: `@agentxm/knowledge/agent-extension-engineering@0.2.0#glossary`.

[axm-glossary-source]: https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md "Generated by cli:generate:glossary; Snapshot: @agentxm/knowledge/agent-extension-engineering@0.2.0#glossary; Source SHA-256: 420016c2a86a7fcc5e01b3197148224d912189b03f2a6898773035c55824d870"
