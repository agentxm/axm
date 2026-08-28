---
type: Requirement
title: Dual TypeScript alias retained until exit
description: The AXM repository toolchain keeps the dual TypeScript alias and
  is not collapsed to a single typescript dependency until the exit condition
  recorded in the TypeScript dual-alias decision is met.
status: stable
tags: [typescript, toolchain, dual-alias]
requirement_id: AXM-REQ-0019
requirement_type: constraint
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - /architecture/decisions/typescript-dual-alias.md
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/AGENTS.md
sources:
  - id: typescript-dual-alias-decision
    resource: /architecture/decisions/typescript-dual-alias.md
    title: Dual TypeScript alias toolchain
  - id: repository-instructions
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/AGENTS.md
    title: AXM repository instructions
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# Dual TypeScript alias retained until exit

## Requirement

Until the exit condition recorded in the TypeScript dual-alias Architecture
Decision Record is met, the AXM System shall not collapse its dual TypeScript
alias — `tsc` as the native TypeScript 7 compiler and `require("typescript")`
as the TypeScript 6 compatibility package — to a single `typescript`
dependency.

## Rationale

The dual alias keeps type checking on the native TypeScript 7 compiler with
enforced Effect diagnostics while TypeScript-6-API consumers such as
typescript-eslint and in-process Nx executors keep a working compiler API.
Collapsing early would forfeit one side or break the other; the companion
[Dual TypeScript alias toolchain](/architecture/decisions/typescript-dual-alias.md)
decision owns the choice, rationale, and exit condition.
