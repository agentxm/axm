---
type: Comparison
description: How AWS Agent Registry's enterprise catalog and governance for agent resources overlap with AgentXM.
tags: [comparisons, aws, agent-registry, agent-skills, governance]
status: stable
stale_after: 2026-11-13
generated:
  by: openai/codex
  at: 2026-08-14T01:00:04Z
sources:
  - id: overview
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry.html
    title: AWS Agent Registry overview
  - id: concepts
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-concepts.html
    title: AWS Agent Registry concepts and terminology
  - id: search
    resource: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-searching.html
    title: Searching AWS Agent Registry
---

# AWS Agent Registry

AWS Agent Registry is a managed discovery service for agents, MCP servers,
tools, Agent Skills, and custom resources. It provides registries, versioned
records, approval workflows, access control, and keyword and semantic search;
people and agents can also query it through an MCP endpoint.[^overview][^search]

The product is in public preview as of August 2026.[^concepts]

## Overlap with AgentXM

Both products provide identity, versions, discovery, visibility controls, and
governance for multiple kinds of reusable agent resource. Both recognize MCP
and Agent Skills rather than limiting the catalog to one proprietary agent
runtime.

## Different boundary

AWS documents a skill registry record primarily as descriptive metadata and
Markdown, with optional package or repository access information. The record
can describe where usable skill content lives without requiring the registry
itself to be the artifact's package manager.[^concepts]

An AgentXM extension version includes the immutable archive distributed by the
AgentXM registry. AXM then resolves that version into local canonical content,
records its source and trust, and reconciles workspace configuration and agent
outputs.

AWS Agent Registry is therefore closest to an enterprise catalog and governance
control plane. AgentXM joins registry distribution to a local extension manager
and desired-state model.

[^overview]: AWS Agent Registry overview.

[^concepts]: AWS Agent Registry concepts and terminology.

[^search]: Searching AWS Agent Registry.
