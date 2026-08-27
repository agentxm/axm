---
type: Requirement
title: Required CI passes before merge
description: AXM changes pass the repository's required deterministic checks before merge.
status: stable
tags: [ci, verification, merge]
requirement_id: AXM-REQ-0004
requirement_type: process
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/main/CONTRIBUTING.md
  - https://github.com/agentxm/axm/blob/main/contributing/guides/automated-pull-request-review.md
sources:
  - id: contributing
    resource: https://github.com/agentxm/axm/blob/main/CONTRIBUTING.md
    title: Contributing to AXM
  - id: automated-review
    resource: https://github.com/agentxm/axm/blob/main/contributing/guides/automated-pull-request-review.md
    title: Automated Pull Request Review
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
---

# Required CI passes before merge

## Requirement

Before an AXM change is merged, the AXM change process shall obtain a passing
result from every required repository CI check applicable to that change.

## Rationale

Required CI is the deterministic execution signal for formatting, linting,
type checking, builds, tests, and other repository-owned gates. Its result is
evidence for the assessed revision, not a substitute for human approval.
