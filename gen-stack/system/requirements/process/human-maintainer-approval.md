---
type: Requirement
title: Human maintainers approve changes
description: AXM changes receive authoritative human maintainer approval before merge.
status: stable
tags: [maintainer-review, approval, merge]
requirement_id: AXM-REQ-0005
requirement_type: process
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/main/contributing/guides/automated-pull-request-review.md
sources:
  - id: automated-review
    resource: https://github.com/agentxm/axm/blob/main/contributing/guides/automated-pull-request-review.md
    title: Automated Pull Request Review
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
---

# Human maintainers approve changes

## Requirement

Before an AXM change is merged, the AXM change process shall obtain approval
from a human AXM maintainer.

## Rationale

Maintainer approval is the authoritative semantic review route for repository
changes. Automated review may provide advisory evidence but cannot approve,
merge, or replace the human decision.
