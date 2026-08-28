---
type: Requirement
title: Releases publish through the canonical workflow
description: AXM releases publish only through the repository's canonical
  automated release workflow from a release commit that completed required CI,
  never manually.
status: stable
tags: [release, ci, provenance]
requirement_id: AXM-REQ-0018
requirement_type: process
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/contributing/guides/releasing.md
sources:
  - id: releasing-guide
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/contributing/guides/releasing.md
    title: AXM releasing guide
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# Releases publish through the canonical workflow

## Requirement

AXM releases shall be published only through the repository's canonical
automated release workflow, from a release commit that has completed required
CI; no release shall be published manually.

## Rationale

Publishing only from the canonical automated workflow, from a CI-completed
release commit, is what makes every released artifact attributable to a
validated revision with provenance; a manual publish would bypass the
artifact, validation, and provenance chain. The Local Preview Publish is a
distinct guide-owned iteration facility that never produces a release, so it
sits outside this obligation by definition rather than as an exception.
Recovery reruns of the publish workflow via `workflow_dispatch` with an
existing release tag remain within the canonical workflow.
