---
type: Requirement
title: Output channels separate results from diagnostics
description: AXM commands present the primary result on stdout and emit
  diagnostics on stderr without corrupting it.
status: stable
tags: [cli, output-channels, machine-output]
requirement_id: AXM-REQ-0009
requirement_type: functional
requirement_lifecycle: active
subject: /architecture/surfaces/cli.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/commands/output.md
sources:
  - id: cli-output
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/commands/output.md
    title: AXM CLI output architecture
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# Output channels separate results from diagnostics

## Requirement

For every invocation, the AXM CLI shall present the invocation's primary
result on stdout and shall emit diagnostics, progress, warnings, and logs on
stderr without corrupting the primary stdout result.

## Rationale

Machine consumers and shell composition depend on stdout carrying only the
primary result, and humans depend on stderr carrying diagnostics without
disturbing it. The accepted channel contract makes that separation durable
across every command.
