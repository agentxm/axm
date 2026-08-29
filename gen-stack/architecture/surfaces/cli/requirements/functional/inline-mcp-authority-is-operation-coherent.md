---
type: Requirement
title: Inline MCP authority is operation-coherent
description: Inline MCP configuration remains structurally distinct from sourced extension content and participates only in operations that can honor that authority.
status: stable
tags: [cli, mcp, workspace, authority, reconciliation]
requirement_id: AXM-REQ-0021
requirement_type: functional
requirement_lifecycle: active
subject: /architecture/surfaces/cli.md
sources:
  - id: mcp-server-architecture
    resource: https://github.com/agentxm/axm/blob/08c4711937f08ba4d392269a32b9d724118255bf/docs/architecture/extensions/mcp-servers.md
    title: AXM MCP server architecture
  - id: sync-architecture
    resource: https://github.com/agentxm/axm/blob/08c4711937f08ba4d392269a32b9d724118255bf/docs/architecture/commands/sync.md
    title: AXM sync architecture
generated: { by: codex/gpt-5.6, at: "2026-08-29T02:36:00Z" }
---

# Inline MCP authority is operation-coherent

## Requirement

The AXM CLI shall represent an inline MCP server as authoritative workspace
configuration rather than as an extension source. Its encoded `axm.json` entry
shall remain a command or URL object without a fabricated source. Install and
update shall not source-resolve that entry and shall report it as not applicable
without preventing applicable siblings from proceeding. Sync shall reconcile
the entry into supported agent configuration. Invalid entries lacking exactly
one source, command, or URL shall be rejected before planning.

## Rationale

Source acquisition, authored configuration, and native projection are different
authority relationships. Preserving that distinction prevents misleading
lookups and diagnostics, keeps the workspace file natural to author, and gives
each operation a stable, explainable responsibility.
