## 0.12.2 (2026-05-25)

### 🩹 Fixes

- Publish the `mcps` registry segment rename in the shared kernel. ([9f7df489](https://github.com/agentxm/axm/commit/9f7df489))

### ❤️ Thank You

- Craig Smitham

## 0.12.1 (2026-05-21)

### 🚀 Features

- Move agent instruction-file drift checks and repairs into `axm lint` and `axm lint --fix`; remove `axm agents instructions doctor` and `axm agents instructions sync`.

### 🩹 Fixes

- Rename context files extension type to context. ([09334bd9](https://github.com/agentxm/axm/commit/09334bd9))

### ❤️ Thank You

- Craig Smitham

## 0.12.0 (2026-05-19)

### 🚀 Features

- Add CLI support for agent instruction file management and curated lists. ([c9e2a393](https://github.com/agentxm/axm/commit/c9e2a393))

### ❤️ Thank You

- Craig Smitham

## 0.11.3 (2026-05-19)

### 🩹 Fixes

- Complete skills, subagents, and commands capability data for codex, cursor, gemini-cli, github-copilot, and windsurf; clarify standard vs bridged support semantics in the catalog schema. ([8ce55559](https://github.com/agentxm/axm/commit/8ce55559))

### ❤️ Thank You

- Claude Opus 4.7 (1M context)
- Craig Smitham

## 0.11.2 (2026-05-16)

### 🩹 Fixes

- Add managed file banners to rendered AXM artifacts. ([9f836c4d](https://github.com/agentxm/axm/commit/9f836c4d))

### ❤️ Thank You

- Craig Smitham

## 0.11.1 (2026-05-16)

### 🩹 Fixes

- Fix pack publish help text and add contextual help-topic footers. ([c3936bd8](https://github.com/agentxm/axm/commit/c3936bd8))

### ❤️ Thank You

- Craig Smitham

## 0.11.0 (2026-05-16)

### 🚀 Features

- Add universal agent skill targeting, publish lint gates, CLI help topic refinements, upgrade behavior improvements, and telemetry error classification. ([05aa56bc](https://github.com/agentxm/axm/commit/05aa56bc))

### ❤️ Thank You

- Craig Smitham

## 0.10.1 (2026-05-16)

### 🩹 Fixes

- Update registry discovery contracts and CLI suggested actions. ([dbd5869a](https://github.com/agentxm/axm/commit/dbd5869a))

### ❤️ Thank You

- Craig Smitham

## 0.10.0 (2026-05-15)

### 🚀 Features

- Add package extension help, publish links, companion version ranges, and universal skill artifact handling ([3e55c4eb](https://github.com/agentxm/axm/commit/3e55c4eb))

### ❤️ Thank You

- Craig Smitham

## 0.9.0 (2026-05-14)

### 🚀 Features

- Add npm-style repository and bugs manifest metadata support. ([340981b8](https://github.com/agentxm/axm/commit/340981b8))

### ❤️ Thank You

- Craig Smitham

## 0.8.0 (2026-05-14)

### 🚀 Features

- Add companion package examples, axm-link dev tooling, subagent dependency publishing, and CLI error handling refinements. ([ede2520f](https://github.com/agentxm/axm/commit/ede2520f))

### ❤️ Thank You

- Craig Smitham

## 0.7.4 (2026-05-13)

### 🩹 Fixes

- Improve AXM interactive output, login handling, and Node runtime compatibility. ([72eb1046](https://github.com/agentxm/axm/commit/72eb1046))

### ❤️ Thank You

- Craig Smitham

## 0.7.3 (2026-05-12)

### 🩹 Fixes

- Keep the publish lint entrypoint free of workspace lint config side effects. ([b32f36dd](https://github.com/agentxm/axm/commit/b32f36dd))

### ❤️ Thank You

- Craig Smitham

## 0.7.2 (2026-05-12)

### 🩹 Fixes

- Add a publish-focused lint entrypoint so registry consumers avoid the workspace lint barrel. ([06bdcb18](https://github.com/agentxm/axm/commit/06bdcb18))

### ❤️ Thank You

- Craig Smitham

## 0.7.1 (2026-05-12)

### 🩹 Fixes

- Release package-manager upgrade support, Windows install updates, and CI-stable lint fix verification. ([230cfd40](https://github.com/agentxm/axm/commit/230cfd40))

### ❤️ Thank You

- Craig Smitham

## 0.7.0 (2026-05-12)

### 🚀 Features

- Add package-manager upgrade support and update Windows install behavior. ([9fa6fc50](https://github.com/agentxm/axm/commit/9fa6fc50))

### ❤️ Thank You

- Craig Smitham

## 0.6.2 (2026-05-12)

### 🩹 Fixes

- Build release binaries on native CI runners. ([dc6c07f8](https://github.com/agentxm/axm/commit/dc6c07f8))

### ❤️ Thank You

- Craig Smitham

## 0.6.1 (2026-05-12)

### 🩹 Fixes

- Consolidate CLI auth endpoints and PKCE login flow. ([d185a689](https://github.com/agentxm/axm/commit/d185a689))

### ❤️ Thank You

- Craig Smitham

## 0.6.0 (2026-05-12)

### 🚀 Features

- Add settings ignore configuration and companion package guidance. ([834c8a60](https://github.com/agentxm/axm/commit/834c8a60))

### ❤️ Thank You

- Craig Smitham

## 0.5.3 (2026-05-11)

### 🩹 Fixes

- Refine CLI parsing, setup guidance, and help documentation. ([86a6b715](https://github.com/agentxm/axm/commit/86a6b715))

### ❤️ Thank You

- Craig Smitham

## 0.5.2 (2026-05-09)

### 🩹 Fixes

- Publish shared kernel updates for AgentXM consumers ([6257ec7f](https://github.com/agentxm/axm/commit/6257ec7f))

### ❤️ Thank You

- Craig Smitham

## 0.5.1 (2026-05-09)

### 🩹 Fixes

- Update Effect dependencies to beta.64 ([172f0fcc](https://github.com/agentxm/axm/commit/172f0fcc))

### ❤️ Thank You

- Craig Smitham

## Unreleased

### 🚀 Features

- Model the universal skills directory as an always-on `universal` materialization
  target. Existing workspaces populate `.agents/skills/` on the next sync.

### Breaking Changes

- Pack manifests are now named `pack.json` and use
  `https://axm.sh/schemas/pack.schema.json`; previous pack manifest
  filenames/schema URLs are no longer supported.
- Command frontmatter now renders verbatim. AXM no longer translates portable
  field names such as `argumentHint` to `argument-hint` or `allowedTools` to
  `allowed-tools`; write the target agent's native key, or use
  `agentOverrides.<agent-id>` for per-agent shape changes.
- Command `agentOverrides` now use RFC 7396 merge-patch semantics, matching
  subagents: objects merge recursively, `null` deletes keys, arrays replace
  wholesale, and primitive values replace.
- Windows script installs now use `%USERPROFILE%\.axm\bin\axm.exe`. Users with
  a prior `%LOCALAPPDATA%\axm\` install should re-run the install script, then
  remove the old directory and PATH entry manually.

## 0.5.0 (2026-05-06)

### 🚀 Features

- Add extension view and version commands, owner-based settings, and AXM naming updates ([4e01c0f4](https://github.com/agentxm/axm/commit/4e01c0f4))

### ❤️ Thank You

- Craig Smitham

## 0.4.5 (2026-04-24)

### 🩹 Fixes

- Ship `install.cmd` from `@agentxm/client-core` so `axm.sh` can host the Windows ([01567596](https://github.com/agentxm/axm/commit/01567596))
  CMD installer, and refresh the managed `@agentxm/skills/axm` guidance for the
  current CLI surface and failure-handling/accessibility rules.

### ❤️ Thank You

- Craig Smitham

## 0.4.4 (2026-04-24)

### 🩹 Fixes

- Fix skill-content vs package-root accessor mismatch in lint engine ([#3](https://github.com/agentxm/axm/pull/3))

### ❤️ Thank You

- Claude Opus 4.7 (1M context)
- Craig Smitham

## 0.4.3 (2026-04-24)

### 🩹 Fixes

- Ship package metadata and published package docs for axm CLI artifacts ([a5b705d5](https://github.com/agentxm/axm/commit/a5b705d5))

### ❤️ Thank You

- Craig Smitham

## 0.4.2 (2026-04-24)

### 🩹 Fixes

- Publish persistent-install guidance in @agentxm/client-core site content. ([327fdf19](https://github.com/agentxm/axm/commit/327fdf19))

### ❤️ Thank You

- Craig Smitham

## 0.4.1 (2026-04-24)

### 🩹 Fixes

- Ship install.ps1 in @agentxm/client-core for axm.sh public route ([d6156416](https://github.com/agentxm/axm/commit/d6156416))

### ❤️ Thank You

- Craig Smitham

## 0.4.0 (2026-04-23)

### 🚀 Features

- Rename install.md to lowercase and align the public install URL ([c56377df](https://github.com/agentxm/axm/commit/c56377df))

### ❤️ Thank You

- Craig Smitham

## 0.3.3 (2026-04-23)

### 🩹 Fixes

- Refine lint workflows, add prune, and polish CLI help output. ([6bb0fe9c](https://github.com/agentxm/axm/commit/6bb0fe9c))

### ❤️ Thank You

- Craig Smitham

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
