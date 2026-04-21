## 0.3.2 (2026-04-21)

### 🩹 Fixes

- Refresh generated public schemas from source ([468ce476](https://github.com/agentxm/axm/commit/468ce476))

### ❤️ Thank You

- Craig Smitham

## 0.3.1 (2026-04-21)

### 🩹 Fixes

- Honor AXM_USER_HOME in user-scope workspaces ([48bef952](https://github.com/agentxm/axm/commit/48bef952))

### ❤️ Thank You

- Craig Smitham

## 0.3.0 (2026-04-21)

### 🚀 Features

- Lint engine + axm lint command ([2d7f6954](https://github.com/agentxm/axm/commit/2d7f6954))

### ❤️ Thank You

- Craig Smitham

## Unreleased (2026-04-21)

### 🚀 Features

- # Lint engine + `axm lint` command (shared kernel + CLI)

  ## Breaking changes
  - **`axm doctor` removed.** Replaced by `axm lint`. The new command
    evaluates the same workspace invariants (plus per-extension rules) and
    produces structured `LintFinding` values with rule ids, severities, and
    messages. Running the old name now fails with an unknown-command error —
    there is no deprecation shim. Migration: `axm doctor` → `axm lint`
    (`--json` for machine output, `--strict` to fail on warnings,
    `--scope user` to lint the user-scope workspace).
  - **`axm sync` removed.** Replaced by `axm lint --fix`. Autofixable findings
    declare a per-extension `Operation` suggestion; `--fix` collects those,
    feeds them through `resolvePlan` / `applyPlan`, and applies
    non-interactively. Running the old name now fails with an unknown-command
    error. Migration: `axm sync` → `axm lint --fix` (preview with `axm lint`
    alone first).
  - **`WorkspaceSyncBlocker`, `WorkspaceDoctorDiagnosticCode`, and the
    `settings-validation` doctor primitives removed** alongside the CLI
    surfaces. The code paths under
    `packages/core/src/unstable/workspace/doctor/` and
    `packages/core/src/unstable/workspace/sync-workspace.ts` are deleted.
    Consumers should migrate to the rule-based API under
    `@agentxm/client-core/unstable/lint`.

  ## New public surface
  - `@agentxm/client-core/unstable/lint` ships the rule primitives
    (`LintRule<C>`, `LintFinding`, `Severity`), the pure evaluator
    (`evaluateContexts`, `collectFixOperations`), three static rule catalogs
    (`skillRules` — five rules, `packRules` — three rules, `workspaceRules`
    — thirteen rules), rule-context types (`SkillRuleContext`,
    `PackRuleContext`, `WorkspaceRuleContext`), narrow accessors
    (`SkillFileAccessor`, `PackFileAccessor`, `WorkspaceLintAccessor`), VFT-
    and platform-backed accessor implementations, `WorkspaceIndex`, and the
    `LintConfig` schema surfaced under `settings.lint.rules`.
  - Plan pipeline primitives (`Plan`, `resolvePlan`, `applyPlan`, the
    `OperationHandler` registry) are hoisted to a stable kernel export path so
    registry publish and `axm lint` share the same autofix backbone.
  - `.axm/settings.json` now accepts `lint.rules` with exact rule-id keys
    mapped to `off | info | warn | error`. Workspace overrides affect
    `axm lint` only; the registry publish gate stays platform-canonical.
    Weakening a platform-canonical `error` in `skill/*` or `pack/*` surfaces
    a drift banner on `axm lint` output.
  - `axm lint [--fix] [--scope <project|user>] [--strict] [--json] [<path>]`.
    `--json` is a global flag, not a command-local flag. `--scope user`
    resolves `$AXM_USER_HOME`, falling back to `$HOME/.axm/` (XDG Base
    Directory integration is deferred).

  ## Internal
  - Five v1 skill rules: `skill/skill-md-present`,
    `skill/manifest-present`, `skill/frontmatter-parseable`,
    `skill/manifest-schema-valid`, `skill/manifest-keys-recognized`.
  - Three v1 pack rules: `pack/manifest-present`,
    `pack/manifest-schema-valid`, `pack/manifest-keys-recognized`.
  - Thirteen v1 workspace rules across three families (foundation 5, skills
    install 5, packs install 3) with a determinism harness asserting every
    autofixing rule converges to zero findings after `applyPlan`.

## 0.2.0 (2026-04-18)

### 🚀 Features

- # doctor check/finding model + settings-validation decoupling ([21fc0223](https://github.com/agentxm/axm/commit/21fc0223))

  ## Breaking changes
  - **`axm doctor` JSON shape is new.** Output is now a `{checks, findings, summary}` structure grouped around user-facing "checks" that emit "findings". The previous flat diagnostics list and the top-level `canSync`, `failed`, and `warned` fields are gone. See the public schema in `packages/cli/src/root/doctor.ts` (`DoctorDataSchema`) and the new public types in `@agentxm/client-core/unstable/workspace`: `Check`, `Finding`, `Action`, `FindingSubject`, `CheckStatus`, `FindingSeverity`, `ReportSummary`, `WorkspaceDoctorReport`.
  - **`WorkspaceSyncBlocker.code` is replaced** by `SettingsEntryBlocker.reason`, a `SettingsEntryBlockerReason` union: `"entry-malformed" | "source-not-found" | "source-multiple-matches" | "source-resolution-failed" | "source-timeout"`. The previous SCREAMING_SNAKE codes from `WorkspaceDoctorDiagnosticCode` (`SKILL_SOURCE_UNRESOLVABLE`, `PACK_ENTRY_INVALID`, etc.) are gone. Blocker reasons are now generic failure reasons; the extension type is captured in `FindingSubject.kind`.
  - **`WorkspaceSyncBlocker.subject` format changed** from e.g. `"skill:name"` to the kind-prefixed `"extension:skill:name"` (flattened from the new `FindingSubject { kind, ref }` pair). The type is still `string`.
  - **`axm doctor` command scope is intentionally reduced on `main` until AXM-203/204/205/206 land.** Doctor currently runs only the `workspace-ready` check with four findings (`directory-missing`, `settings-missing`, `settings-unparseable`, `settings-schema-invalid`). Sub-issues restore functional equivalence with the pre-refactor diagnostics.

  ## New public surface
  - `@agentxm/client-core/unstable/workspace` now exports the check/finding model types and `diagnoseWorkspaceDoctor`.
  - `@agentxm/client-core/unstable/workspace` also exports the new `settings-validation` primitives: `detectSettingsEntryBlockers`, `detectLockfileBlockers`, `SettingsEntryBlocker`, `SettingsEntryBlockerReason`, `LockfileBlocker`, `LockfileBlockerReason`. Per-type configured entry resolvers (`resolveConfiguredSkill`, `resolveConfiguredCommand`, etc.) are exported from the `configured-entry-resolution` module.
  - `sync.ts` no longer imports from `doctor`. Both sync and the future `extensions-installed` doctor check consume `detectSettingsEntryBlockers` from the shared `settings-validation` module.

  ## Internal
  - New internal abstraction `CheckDef` / `DiagnosticDef` + `defineCheck` helper for authoring doctor checks, plus a dependency-cascading runner with skip semantics and stable registration-order output.

### ❤️ Thank You

- Claude Opus 4.6 (1M context)
- Craig Smitham

## 0.1.5 (2026-04-10)

### 🩹 Fixes

- Publish current shared-kernel export surface for semver consumers and unblock agentxm-internal from packed-local mode. ([91fbf7c0](https://github.com/agentxm/axm/commit/91fbf7c0))

### ❤️ Thank You

- Craig Smitham

## 0.1.4 (2026-04-01)

### 🩹 Fixes

- Add schema-backed JSON output contracts ([2e77ca8d](https://github.com/agentxm/axm/commit/2e77ca8d))

### ❤️ Thank You

- Craig Smitham

## 0.1.3 (2026-04-01)

### 🩹 Fixes

- Strengthen release formatting guardrails and standardize formatting checks ([064cbcc1](https://github.com/agentxm/axm/commit/064cbcc1))

### ❤️ Thank You

- Craig Smitham

## 0.1.2 (2026-04-01)

### 🩹 Fixes

- Fix trusted publishing and tighten auth/update behavior in automation ([f4f1a131](https://github.com/agentxm/axm/commit/f4f1a131))

### ❤️ Thank You

- Craig Smitham

## 0.1.1 (2026-04-01)

### 🩹 Fixes

- Fix installer publishing and show update notices for agent sessions ([fa535e3a](https://github.com/agentxm/axm/commit/fa535e3a))

### ❤️ Thank You

- Craig Smitham

## 0.1.0 (2026-04-01)

### 🚀 Features

- Add self-upgrade command and startup update checks ([51921362](https://github.com/agentxm/axm/commit/51921362))

### ❤️ Thank You

- Craig Smitham

## 0.0.44 (2026-03-31)

### 🩹 Fixes

- Raise scripts test timeout for release tooling ([02e3f528](https://github.com/agentxm/axm/commit/02e3f528))

### ❤️ Thank You

- Craig Smitham

## 0.0.43 (2026-03-31)

### 🩹 Fixes

- Route release workflow scripts through Nx targets ([f345da8b](https://github.com/agentxm/axm/commit/f345da8b))

### ❤️ Thank You

- Craig Smitham

## 0.0.42 (2026-03-31)

### 🩹 Fixes

- Metadata-only patch release to validate release workflow. ([29f49642](https://github.com/agentxm/axm/commit/29f49642))

### ❤️ Thank You

- Craig Smitham

## 0.0.41 (2026-03-31)

### 🩹 Fixes

- Fix release validation by restoring installer verification dependencies and hardening the flaky opencode MCP sync test. ([9e98cd87](https://github.com/agentxm/axm/commit/9e98cd87))

### ❤️ Thank You

- Craig Smitham

## 0.0.40 (2026-03-31)

### 🩹 Fixes

- Fix Windows installer verification and align the release follow-up with CI formatting checks. ([b8c9f84e](https://github.com/agentxm/axm/commit/b8c9f84e))

### ❤️ Thank You

- Craig Smitham

## 0.0.39 (2026-03-31)

### 🩹 Fixes

- Fix installer verification on Windows and skip unnecessary local compile steps. ([ff516d6e](https://github.com/agentxm/axm/commit/ff516d6e))

### ❤️ Thank You

- Craig Smitham

## 0.0.38 (2026-03-31)

### 🩹 Fixes

- Improve release workflow status, gating, and local toolchain setup. ([d18ff954](https://github.com/agentxm/axm/commit/d18ff954))

### ❤️ Thank You

- Craig Smitham

## 0.0.37 (2026-03-31)

### 🩹 Fixes

- Refine release guidance and fix cli-self-upgrade design gaps. ([1975bebd](https://github.com/agentxm/axm/commit/1975bebd))

### ❤️ Thank You

- Craig Smitham

## 0.0.36 (2026-03-31)

### 🩹 Fixes

- Make Binary Smoke depend explicitly on the shared utils build and document the release recovery learnings. ([6732f7e6](https://github.com/agentxm/axm/commit/6732f7e6))

### ❤️ Thank You

- Craig Smitham

## 0.0.35 (2026-03-31)

### 🩹 Fixes

- Fix release tooling bootstrap in clean checkouts and document release process friction. ([d8e83363](https://github.com/agentxm/axm/commit/d8e83363))

### ❤️ Thank You

- Craig Smitham

## 0.0.34 (2026-03-31)

### 🩹 Fixes

- CI and release workflow maintenance updates. ([c55824af](https://github.com/agentxm/axm/commit/c55824af))

### ❤️ Thank You

- Craig Smitham

## 0.0.33 (2026-03-31)

### 🩹 Fixes

- Fix binary smoke CI and complete patch release ([7391b8f6](https://github.com/agentxm/axm/commit/7391b8f6))

### ❤️ Thank You

- Craig Smitham

## 0.0.32 (2026-03-31)

### 🩹 Fixes

- Format e2e boundary scripts and complete patch release ([65a2d870](https://github.com/agentxm/axm/commit/65a2d870))

### ❤️ Thank You

- Craig Smitham

## 0.0.31 (2026-03-31)

### 🩹 Fixes

- Release tooling, verification, and contributor docs improvements ([937a42c6](https://github.com/agentxm/axm/commit/937a42c6))

### ❤️ Thank You

- Craig Smitham
