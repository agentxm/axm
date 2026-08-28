---
type: Requirement
title: Content changes require established authority
description: AXM changes workspace content only with established authority over the
  smallest independently changeable unit.
status: stable
tags: [workspace, ownership, content-authority]
requirement_id: AXM-REQ-0010
requirement_type: functional
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/workspace/overview.md
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
sources:
  - id: architecture-principles
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
    title: AXM architecture principles
  - resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/workspace/overview.md
    title: Former workspace overview architecture
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# Content changes require established authority

## Requirement

The AXM System shall change workspace content only when it establishes
authority over the smallest independently changeable unit of that content; a
familiar path, a matching name, or matching bytes shall not establish that
authority.

## Rationale

Path, name, or byte familiarity is observation, not ownership, and mutating on
observation alone can destroy user-authored or third-party content without
violating any narrower rule. The accepted ownership principle makes
established authority over the smallest independently changeable unit the only
permission to change workspace content. Authority is established on the
surface being changed; it does not transfer merely because the same name or
content appears on another surface.
