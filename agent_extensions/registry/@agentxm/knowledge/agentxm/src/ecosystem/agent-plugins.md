---
type: Explainer
description: How Agent Plugins combines portable agent components while leaving installation, permissions, and client behavior to implementers.
tags: [agent-plugins, plugins, interoperability]
status: stable
stale_after: 2026-11-14
generated:
  by: openai/codex
  at: 2026-08-14T00:43:46Z
sources:
  - id: overview
    resource: https://agent-plugins.org/
    title: Agent Plugins
  - id: specification
    resource: https://agent-plugins.org/specification
    title: Agent Plugins specification
---

# Agent Plugins

Agent Plugins is an open, vendor-neutral format for arranging reusable agent
components into one portable plugin.[^overview] Its version 1.0.0 specification
is currently a working draft.[^specification]

A plugin is a directory with a required `plugin.json` manifest. Its portable
core can contain [Agent Skills](agent-skills.md) and
[MCP](model-context-protocol.md) server configuration in fixed locations.
Reverse-domain extension namespaces allow a client to add its own behavior
without changing the portable core.

## What the format provides

Agent Plugins defines an interoperability floor: a client can discover known
component types in a predictable layout and ignore unsupported optional
components. The component standards retain their own meaning inside the plugin;
Agent Plugins does not redefine Agent Skills or MCP.

The format does not define plugin distribution, installation, permissions,
sandboxing, user experience, or every component an agent client may support.
Clients remain responsible for those decisions and for the behavior of their
own extension namespaces.

## Relationship to AgentXM

An Agent Plugin is not an AgentXM extension, extension archive, or pack.
AgentXM extensions have independent registry identities and types; an AgentXM
pack composes references to those extensions rather than combining their files
into a plugin directory.

Agent Plugins is nevertheless important interoperability context because it
combines two standards AgentXM supports. Any future import, export, or
conformance relationship must preserve this distinction and be established as
an explicit product capability rather than inferred from similar terminology.

[^overview]: Agent Plugins overview.

[^specification]: Agent Plugins specification.
