---
type: Requirement
title: Public artifacts protect private context
description: Changes keep private coordination, customer, and confidential material out of
  the public AXM repository.
status: stable
tags: [public-repository, privacy, change-process]
requirement_id: AXM-REQ-0002
requirement_type: process
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/main/CONTRIBUTING.md
sources:
  - id: contributing
    resource: https://github.com/agentxm/axm/blob/main/CONTRIBUTING.md
    title: Contributing to AXM
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
---

# Public artifacts protect private context

## Requirement

Every AXM change shall keep private tracker context, private repository links,
customer details, unreleased internal plans, credentials, and private
screenshots out of public repository artifacts.

## Rationale

AXM is public. Its branches, commits, issues, pull requests, documentation,
release notes, and screenshots must remain usable without exposing private or
confidential context.
