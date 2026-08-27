---
type: Requirement
title: Public AXM remains independent of private implementation
description: AXM depends on private AgentXM responsibilities only through public-safe
  contracts and packages.
status: stable
tags: [public-boundary, dependency-direction, privacy]
requirement_id: AXM-REQ-0001
requirement_type: constraint
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/main/docs/architecture/overview.md
sources:
  - id: axm-architecture-overview
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/overview.md
    title: AXM overview
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
---

# Public AXM remains independent of private implementation

## Requirement

The AXM System shall remain independent of private AgentXM repository source,
paths, and documentation, interacting with private platform responsibilities
only through published contracts and OSS-safe packages.

## Rationale

AXM is a public system whose consumers and contributors cannot depend on
private implementation context. The boundary prevents private coupling and
keeps cross-repository behavior governed by public contracts.
