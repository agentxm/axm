---
type: Requirement
title: Project workspace settings are valid before operations begin
description: Every project-workspace-backed CLI operation begins only after
  both project and user settings are readable and valid.
status: stable
tags: [cli, workspace, settings, validation, fail-fast]
requirement_id: AXM-REQ-0020
requirement_type: functional
requirement_lifecycle: active
subject: /architecture/surfaces/cli.md
sources:
  - id: workspace-settings
    resource: https://github.com/agentxm/axm/blob/4db7b4ce74eec1b9fc839ea8da3e4e3e027e2ee4/docs/architecture/workspace/settings.md
    title: AXM workspace settings architecture
  - id: workspace-execution
    resource: https://github.com/agentxm/axm/blob/4db7b4ce74eec1b9fc839ea8da3e4e3e027e2ee4/docs/architecture/workspace/execution.md
    title: AXM workspace execution architecture
generated: { by: codex/gpt-5.6, at: "2026-08-28T22:23:10Z" }
relationships:
  is-addressed-by-adr:
    - /architecture/decisions/project-workspace-settings-validity-prerequisite.md
---

# Project workspace settings are valid before operations begin

## Requirement

For every CLI invocation that requires project workspace construction, the AXM
CLI shall load both the project and user settings sources under their documented
missing-file semantics and validate every present source before the selected
operation begins. If either present source is unreadable, malformed, or
schema-invalid, the CLI shall end the invocation before producing an operation
result or changing workspace state and shall identify the owning file and fault
for direct correction.

## Rationale

Project operations combine project choices with valid machine-local defaults
and policy. Treating either invalid source as absent would make the effective
workspace depend on hidden degraded-state rules and could allow inspection,
planning, or mutation from an incomplete configuration. One shared
construction prerequisite keeps the resulting workspace deterministic while
preserving absence as a distinct, supported state.
