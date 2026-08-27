---
type: Requirement
title: Changes land through pull requests
description: AXM changes use the repository pull-request workflow rather than direct main
  mutation.
status: stable
tags: [pull-requests, change-process, main]
requirement_id: AXM-REQ-0003
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

# Changes land through pull requests

## Requirement

Every change to the AXM System shall land through a pull request rather than a
direct commit or push to `main`.

## Rationale

The pull-request boundary supplies the stable review, CI, public-context, and
change-history surface used to assure AXM changes.
