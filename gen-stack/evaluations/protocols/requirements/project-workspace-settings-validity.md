---
type: Evaluation Protocol
title: Project workspace settings validity
description: Assesses whether project-workspace-backed operations require valid
  project and user settings before work begins.
status: stable
tags: [workspace, settings, validation, requirement-satisfaction]
protocol_id: AXM-EVAL-REQ-PROJECT-WORKSPACE-SETTINGS-VALIDITY
protocol_lifecycle: active
evaluation_role: requirement-satisfaction
requirements:
  - AXM-REQ-0020
generated: { by: codex/gpt-5.6, at: "2026-08-28T22:23:10Z" }
---

# Project workspace settings validity

## Claim

Every project-workspace-backed CLI operation begins only after both project and
user settings have loaded under the accepted missing-file semantics and every
present source has validated. An unreadable, malformed, or schema-invalid
source prevents the operation from beginning, produces an actionable
diagnostic naming the owning file and fault, and leaves workspace state
unchanged. Non-workspace encounters remain outside this prerequisite.

## Assessment

Use repository-native core and CLI tests with isolated project and user homes.
Exercise both settings owners across unreadable I/O, malformed JSON, and
schema-invalid values, plus missing and valid controls. Sample read-only,
diagnostic, preview, ordinary mutation, and force-capable operation families in
human and machine output modes. Observe whether command work begins, capture
the diagnostic channels, compare before/after workspace manifests, correct the
source directly, and rerun the original command. Include version and help as
non-workspace negative controls.

The executable Cases live with the workspace service, CLI runtime, and CLI
end-to-end suites. Each Execution records the exact selected Cases,
Implementation revision, Protocol revision, environment, runner, and attempt
time.

## Judgment

`pass` requires every selected invalid-source Case to end before command work
or mutation, identify the exact owning path and bounded fault class, preserve
the typed cause at the application boundary, provide direct-correction
guidance, and keep machine stdout valid and separate from stderr diagnostics.
Valid and missing-source controls must retain their accepted behavior,
Force-like command controls (including `--accept-warnings` and `--reinstall`)
must not bypass the prerequisite, non-workspace controls must not be
gated, and direct correction must restore the original operation without AXM
rewriting the invalid file.

`fail` follows from any contrary observation. The outcome remains `unknown`
when operation classification, pre-operation execution, state preservation,
diagnostic identity, direct recovery, or exact Implementation provenance
cannot be established. Missing, skipped, stale, or harness-error evidence is
not a pass.

## Evidence and lifecycle

Repository-native evidence is produced by the focused core workspace-service,
CLI runtime, and CLI end-to-end test targets. Refresh the evidence whenever the
settings schema or read model, settings error translation or rendering,
workspace command wiring, sampled command fixtures, Requirement, or this
Protocol changes. Retire this Protocol only when AXM-REQ-0020 is retired or
replaced; preserve this identity and its last applicable target and evidence
route.
