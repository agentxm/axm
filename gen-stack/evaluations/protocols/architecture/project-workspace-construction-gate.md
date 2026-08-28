---
type: Evaluation Protocol
title: Project workspace construction gate
description: Assesses the shared settings-validity gate before
  project-workspace-backed command execution.
status: stable
tags: [workspace, construction, settings, architecture-realization]
protocol_id: AXM-EVAL-ARCH-PROJECT-WORKSPACE-CONSTRUCTION-GATE
protocol_lifecycle: active
evaluation_role: architecture-realization
architecture_authorities:
  - /architecture/surfaces/cli.md
  - /architecture/decisions/project-workspace-settings-validity-prerequisite.md
generated: { by: codex/gpt-5.6, at: "2026-08-28T22:23:10Z" }
---

# Project workspace construction gate

## Claim

AXM realizes one shared project-workspace-construction gate before snapshot
creation, fact and desired-state derivation, closure selection, inspection,
planning, preview, or mutation. Both settings sources participate under the
accepted missing-file and validation rules. Closure-local isolation begins
only after construction succeeds, and non-workspace encounters do not depend
on the gate.

## Assessment

Inspect and exercise the workspace Layer and command boundary through
repository-native tests. Use both project- and user-source failures during
Layer construction, a sentinel command effect that records whether evaluation
began, representative project-workspace-backed end-to-end commands, and
non-workspace controls. Confirm the Layer reads both sources before resolving
layouts or returning workspace services and that successful construction still
uses the existing closure-local planning and mutation model.

Each Execution binds the exact selected Cases, Architecture and Protocol
revisions, Implementation revision, environment, runner, and attempt time.

## Judgment

`pass` requires both settings failure paths to converge before the selected
command effect is evaluated or workspace state changes, every sampled
workspace-backed command to pass through that boundary, non-workspace controls
to remain independent, and post-construction closure behavior to remain
unchanged. `fail` follows if any workspace-backed path bypasses the gate, a
non-workspace encounter is unnecessarily coupled to it, or closure isolation
is used as a substitute for failed construction.

The outcome remains `unknown` when command classification, gate placement,
path coverage, post-construction behavior, or exact revision binding cannot be
established. Missing, skipped, stale, or harness-error evidence is not a pass.

## Evidence and lifecycle

Repository-native evidence is produced by focused workspace-service, CLI
runtime, and CLI end-to-end test targets. Refresh it whenever `withWorkspace`,
workspace Layer composition, settings-source read order or defaulting, command
provision, sampled workspace commands, the targeted Architecture, or this
Protocol changes. Retire this Protocol only when both targeted authorities no
longer make the claim; preserve this identity and its last applicable targets
and evidence route.
