---
__default__: minor
---

# doctor check/finding model + settings-validation decoupling

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
