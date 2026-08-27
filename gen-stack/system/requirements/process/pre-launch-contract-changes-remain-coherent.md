---
type: Requirement
title: Pre-launch contract changes remain coherent
description: Pre-launch contract changes establish one current contract without
  compatibility-only paths.
status: stable
tags: [pre-launch, contracts, compatibility]
requirement_id: AXM-REQ-0006
requirement_type: process
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/main/AGENTS.md
sources:
  - id: repository-instructions
    resource: https://github.com/agentxm/axm/blob/main/AGENTS.md
    title: AXM repository instructions
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
---

# Pre-launch contract changes remain coherent

## Requirement

While AXM remains pre-launch, every contract-changing AXM change shall
establish one coherent current contract across affected producers, consumers,
tests, fixtures, documentation, and generated artifacts without retaining
compatibility-only paths.

## Rationale

AXM's pre-launch lifecycle permits clean breaking change. Updating the complete
contract and removing superseded paths avoids parallel behavior and migration
machinery before public compatibility commitments exist.
