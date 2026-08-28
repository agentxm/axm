---
type: Requirement
title: Machine mode never prompts
description: The AXM CLI never prompts for interactive input while operating in
  machine output mode.
status: stable
tags: [cli, machine-output, interaction]
requirement_id: AXM-REQ-0008
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

# Machine mode never prompts

## Requirement

While operating in machine output mode, the AXM CLI shall not prompt for
interactive input.

## Rationale

Machine output serves non-interactive consumers that cannot answer prompts; a
prompt in machine mode would hang automation or corrupt the machine document.
Interactive decisions must arrive as explicit inputs instead.
