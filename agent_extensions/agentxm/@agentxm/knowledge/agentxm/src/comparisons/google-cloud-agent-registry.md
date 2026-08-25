---
type: Comparison
description: How Google Cloud Agent Registry's managed catalog and standalone skill governance overlap with AgentXM.
tags: [comparisons, google-cloud, agent-registry, agent-skills, governance]
status: stable
stale_after: 2026-11-13
generated:
  by: openai/codex
  at: 2026-08-14T01:00:04Z
sources:
  - id: overview
    resource: https://docs.cloud.google.com/agent-registry/overview
    title: Google Cloud Agent Registry overview
  - id: releases
    resource: https://docs.cloud.google.com/agent-registry/release-notes
    title: Google Cloud Agent Registry release notes
  - id: revisions
    resource: https://docs.cloud.google.com/agent-registry/manage-skill-revisions
    title: Manage skill revisions
---

# Google Cloud Agent Registry

Google Cloud Agent Registry is a managed catalog for agents, MCP servers,
tools, endpoints, and standalone Agent Skills within Google Cloud. It supports
discovery and governance across those resources.[^overview]

The registry reached general availability in June 2026. Standalone skill
governance entered Preview in July 2026, adding ZIP package validation,
immutable skill revisions, lifecycle controls, publisher information, access
policies, downloads, and semantic search.[^releases][^revisions]

## Overlap with AgentXM

Both products treat a standalone skill as more than a repository folder. They
provide a registry identity, a versioned package, discovery, controlled access,
and a way to retrieve the packaged content.

Both also span more than Agent Skills: Google catalogs agents and MCP resources,
while AgentXM manages multiple portable extension types.

## Different boundary

Google Cloud Agent Registry is a cloud governance and inventory surface. Its
authority is organized through Google Cloud projects, locations, IAM, and
supported Google runtimes.

AgentXM combines a public extension registry with AXM's local, cross-agent
workspace management. AXM resolves configured sources and versions, records
trust, manages dependencies, and materializes each extension into the forms
expected by locally configured agents.

The strongest overlap is registry distribution and governance. The strongest
difference is Google Cloud control-plane integration versus AgentXM's portable
extension and local desired-state boundary.

[^overview]: Google Cloud Agent Registry overview.

[^releases]: Google Cloud Agent Registry release notes.

[^revisions]: Manage skill revisions.
