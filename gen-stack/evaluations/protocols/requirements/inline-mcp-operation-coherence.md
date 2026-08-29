---
type: Evaluation Protocol
title: Inline MCP operation coherence
description: Assesses structural inline MCP authority and command-specific behavior.
status: stable
tags: [mcp, workspace, authority, requirement-satisfaction]
protocol_id: AXM-EVAL-REQ-INLINE-MCP-OPERATION-COHERENCE
protocol_lifecycle: active
evaluation_role: requirement-satisfaction
requirements:
  - AXM-REQ-0021
generated: { by: codex/gpt-5.6, at: "2026-08-29T02:36:00Z" }
---

# Inline MCP operation coherence

## Claim

AXM preserves command and URL inline MCP entries in their authored JSON form,
models them without a source locator, skips source acquisition during install
and update, and reconciles them only through sync.

## Assessment

Use repository-native schema, desired-state, install, update, sync, and source
resolution tests. Exercise sourced, inline command, inline URL, mixed, disabled,
and invalid entries. Inspect decoded authority, encoded JSON, planned units,
resolver calls, sibling progress, diagnostics, native projections, lock state,
and workspace configuration before and after each operation.

## Judgment

`pass` requires round-trip JSON stability; no fabricated inline source or lock
row; rejection of missing or multiple transport authorities; explicit skipped
install and update units without source lookup; continued planning of valid
siblings; sync-owned projection; and diagnostics that retain application error
detail and the requested extension family. `fail` follows from any contrary
observation. Missing, stale, skipped, or unbound evidence yields `unknown`.

## Evidence and lifecycle

Evidence comes from focused core and CLI repository targets and records the
Implementation and Protocol revisions. Refresh it whenever MCP settings,
desired-state authority, install/update/sync collection, source diagnostics, or
structured operation output changes. Retire this Protocol only with
AXM-REQ-0021.
