# Phase B extraction manifest — migration steps 3 and 4

Definitive, tree-verified manifest for physically extracting the six step-3/step-4
packages out of `@agentxm/extension-management`. Built from the worktree at
`71083d82e` (`git ls-files` + production-import grep of every cross-module edge),
not from the design docs' earlier snapshots. Where this manifest deviates from
[design-workspace-partition.md](design-workspace-partition.md) or
[design-error-decoupling.md](design-error-decoupling.md), the deviation is called
out with the evidence.

Bins: **WS** `@agentxm/workspace-state`, **WO** `@agentxm/workspace-operations`,
**XW** `@agentxm/extension-workspace`, **IR** `@agentxm/registry-client`,
**IS** `@agentxm/extension-sources`, **IA** `@agentxm/agent-integration`,
**RES** = stays in `@agentxm/extension-management` (residue) for steps 5–7.
All paths are relative to `packages/extension-management/src/unstable/` unless
prefixed.

## 0. Headline decisions (read first)

1. **The seven per-type managers, all `operations/` folders, and every
   lifecycle-entangled file stay in the residue at step 3.** The error-decoupling
   design assigned managers to XW, but the current tree shows
   `hooks/rules/knowledge` managers importing
   `extension-lifecycle/configured-entry-resolution.js` (`resolveConfiguredHook/
Rule/Knowledge`, `makeConfiguredReleaseAgeEvaluation`) and
   `workspace-configuration/instructions.js` (feature policy), and all managers
   importing `source-resolution` (`SourceHostProviders`, `WorkspaceCatalog`) —
   none of which a kernel may import. As residue (`layer:feature`) they legally
   import kernels, integrations, and each other. They move with the
   extension-lifecycle slice in steps 5–6. Consequences propagated below:
   `projection/invariant-facts.ts` (imports `knowledge/manager`), and
   `plan/resolve-plan.ts` (imports `hooks/manager`) also stay RES.
2. **`extension-sources` cannot be extracted under the current layer matrix.**
   `source-resolution` production code imports WS vocabulary
   (`workspace/refs/*`, `workspace/source-host-provider.js`,
   `workspace/discovery-walk.js`, `workspace/installable-types.js`,
   `settings/index.js`) and XW semantics (`extensions/manifest-package-discovery`,
   `hooks/discovery`, `rules/discovery`, the axm-skill trio via `skills/index`).
   `layer:integration → [layer:integration, layer:contract]` is enforced by
   eslint. The
   `specifications/system/architecture/package-dependencies-point-inward.spec.ts`
   specification observes the declared manifests and treats kernels and
   integrations as peers, so an integration→kernel dependency is not outward
   under it; the eslint row is the gate to amend. Extracting extension-sources
   therefore requires **amending that lint row** (§6.4, option A) or the
   K5/V-move redesign (option B) first. Steps 3, and step 4 for IR + IA, are
   unaffected.
3. **Error-decoupling debt gates each extraction.** 17 production files in the
   step-3 move set still import `app-error` (list in §0.1); ~45 in the step-4
   set. Wave-1/wave-2 completion for exactly those files is a prerequisite of the
   corresponding extraction, per design-3e §4 (decouple immediately before the
   extraction that moves the module).
4. New packages use **`src/` with intentional root exports plus `./live` and
   `./testing`** — no `unstable/*` sprawl. The AGENTS.md "Library `unstable`
   namespace" paragraph must be amended (§6.6).
5. Everything is a clean break: barrels dissolve, no re-export shims, every
   consumer re-points in the same change (pre-launch policy).

### 0.1 Prerequisite ledger (must land before the named extraction)

App-error decoupling (typed failures + CLI-side conversion, design-3e recipe):

| Gate for    | Files still importing `app-error` (production)                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS (step 3) | `workspace/accepted-canonical-ref.ts` (also `app-error/conversions`), `workspace/configured-entry-resolution/types.ts`, `workspace/configured-entry-resolution/workspace-ref.ts` (also conversions), `workspace/lock-entry-to-ref.ts`, `workspace/package-hash.ts`, `workspace/read-model/discovery/skills.ts`, `workspace/read-model/discovery/subagents.ts`, `workspace/source-host-provider.ts` |
| WO (step 3) | `workspace/operations/augment-plan.ts`, `plan/execution-candidate.ts`, `plan/operation-resolution.ts`, `plan/resolve-plan-interaction.ts`                                                                                                                                                                                                                                                          |
| XW (step 3) | `extension-workspace/coding-agent.ts`, `extension-workspace/errors.ts`, `extension-workspace/mcp-sync.ts` (also conversions), `extension-workspace/repository.ts` (also conversions), `extension-workspace/subagent-sync.ts` (also conversions)                                                                                                                                                    |
| IR (step 4) | `registry/{translate,failure-mapping,client,remote-client,local-client,admin-client,archive-cache,error-mapping,request-policy}.ts` and any other `registry/*` importer (10 files, incl. the request/response metadata design in design-3e §4 wave 2)                                                                                                                                              |
| IS (step 4) | all `source-resolution/**` importers (28 imports across ~15 files incl. every provider), `git/operations.ts`                                                                                                                                                                                                                                                                                       |
| IA (step 4) | `agents/detection.ts`                                                                                                                                                                                                                                                                                                                                                                              |

Small vocabulary moves bundled into the step-3 change (all verified single-purpose):

- `knowledge/discovery-config.ts` → WS (imported by `workspace/service-interface.ts`
  and `workspace/service.ts`; zero knowledge-module deps).
- `extensions/utils.ts` **splits**: `validatePathSafety` → WS (imported by
  `workspace/configured-entry-resolution/workspace-ref.ts`);
  `copyExtensionDirectory`, `formatCopyExtensionDirectoryFailure`, the
  `CopyExtensionDirectory*` types stay RES.
- `utils/` dissolution per §1.7.
- `agents/constants.ts` `getHome`/`getConfigHome`: IA keeps the file; WS gets a
  private copy (used by `workspace/read-model/scanners/mcp-config.ts`); XW gets a
  private copy (used by `extension-workspace/mcp-sync.ts` and `repository.ts`).
  Do not point WS/XW at IA (kernel→integration) and do not put the effectful
  helpers in extension-model (behavior budget).
- A private ~8-line `envOption` copy in WS (`read-model/discovery/skills.ts`,
  scanners) and XW (`mcp-sync.ts`, `repository.ts`); IA keeps `envOption` via its
  own copy. The canonical `utils/environment.ts` stays RES (CLI-destined).

Known moved-test fixups (tests move with their subjects; these currently import
residue modules and must be stubbed/trimmed at move time):

- `workspace/service.internal.test.ts` imports `cli-flags`/`cli-renderer`
  (partition doc correction 10) — strip or stub.
- Sweep rule: before landing each extraction, grep the moved test set for
  `app-error`, `cli-`, and residue-module imports; fix in the same change.

## 1. Source inventory per package

Tests, `__fixtures__`, `__tests__`, snapshots, and example files travel with
their subject file. "(t)" marks entries that land behind `./testing`.

### 1.1 `@agentxm/workspace-state` (kernel)

Everything under `workspace/` **except** `workspace/operations/**` and the
dissolved `workspace/index.ts`:

- Root files: `accepted-canonical-ref.ts`, `artifact-change.ts`,
  `canonical-observation.ts`, `configured-agent-outcome.ts`,
  `configured-agent-outcomes.ts`, `constants.ts`, `create-symlink.ts`,
  `desired-pack-lock.ts`, `desired-state-enabled.ts`, `desired-state-graph.ts`,
  `desired-state-problem-text.ts`, `discovery-walk.ts`, `errors.ts`,
  `extension-name.ts`, `extension-paths.ts`, `footprint-recorder.ts`,
  `installable-types.ts`, `layout.ts`, `lock-entry-to-ref.ts`,
  `lock-entry-to-source-params.ts`, `locked-entries.ts`,
  `materialized-file-target.ts`, `materialized-tree.ts`,
  `mcp-entry-semantics.ts`, `observed-installed.ts`,
  `pack-manifest-content-identity.ts`, `pack-paths.ts`, `package-hash.ts`,
  `paths.ts`, `read-model-record-readers.ts`, `read-model-record-rows.ts`,
  `read-model-record-types.ts`, `remove-if-exists.ts`, `rendered-files.ts`,
  `scope-refusal.ts`, `scope.ts`, `service-interface.ts`, `service.ts`,
  `setup-scope-support.ts`, `skill-paths.ts`, `source-host-provider.ts`,
  `source-metadata.ts`, `source-to-lock-entry.ts`, `transaction.ts`
  (the WS half: ambient context, `protectWorkspacePath`,
  `protectCreatedAncestors`, restoration types — already split from the WO
  runner), `test-stubs.ts` (t), plus all `*.internal.test.ts` /
  `records.type-test.ts` siblings.
- `workspace/refs/**` (all 10 files).
- `workspace/configured-entry-resolution/{types,workspace-ref}.ts` (+tests).
  (`resolve.ts`/`timeout.ts` already live in `extension-lifecycle/` — RES.)
- `workspace/read-model/**` (service, state, types, errors, diagnostics,
  agent-presence, agent-root-resolver, agents/, discovery/, extensions/,
  scanners/, `__fixtures__/**` (t), `__tests__/**`).
- `settings/**` (incl. `settings.example.json`, `generated-schema` test).
- `lockfile/**` (incl. `axm-lock.example.yaml`).
- `schema/**` (`index.ts`, `read-and-validate-json-file.ts`, `types.ts`).
- Moved in: `knowledge/discovery-config.ts` (+test), `validatePathSafety` (from
  `extensions/utils.ts`), `utils/path-safety.ts` (+test),
  `utils/resolve-parent-symlinks.ts` (+test, private), a private copy of
  `utils/atomic-write.ts` (+test) for `settings.ts`/`lockfile.ts` writers, the
  private `envOption` + home-dir helpers (§0.1).

Not in WS (despite living under `workspace/` history): nothing else — the
partition doc's INSP items (`extension-list`, `version-currency`) already moved
to `workspace-inspection/` (RES), and `display-plan`/`resolve-plan-interaction`
already moved to `cli-renderer/`/`plan/`.

### 1.2 `@agentxm/workspace-operations` (kernel)

- `workspace/operations/**`: `augment-plan.ts`, `load-workspace.ts` (→ `./live`),
  `scan-plan-readiness.ts`, `transaction.ts` (runner/closure half),
  `transition-lock.ts` (+tests).
- `plan/**` **except** `resolve-plan.ts` (+its test) and the dissolved
  `plan/index.ts`: `plan.ts`, `errors.ts`, `apply-plan.ts`,
  `execution-candidate.ts`, `interruption-signal.ts`, `job-step-message.ts`,
  `operation-events.ts`, `operation-journal.ts`, `operation-resolution.ts`,
  `plan-execution.ts`, `resolve-plan-interaction.ts` (port + `…Test` factory →
  testing) (+tests).
- `plan/resolve-plan.ts` stays RES: it imports `hooks/manager.js`
  (`Effect.serviceOption(HookManager)`) and `app-error` — it is the interactive
  preview/confirm/apply orchestration (`previewOrApplyPlan`), consumed by CLI
  handlers and residue operations. It moves later (either into axm.sh as
  application wiring or behind the `ConfiguredAgentOutcomesProvider` port,
  design-3f §3.3) — steps 5–6 decision, not step 3.

### 1.3 `@agentxm/extension-workspace` (kernel)

- `extension-workspace/**`: `extension-manager.ts`, `errors.ts`,
  `coding-agent.ts`, `managed-file-discovery.ts`, `mcp-sync.ts`,
  `repository.ts` (`CodingAgentRepository` service + default impl;
  `CodingAgentRepositoryLive` → `./live`), `subagent-sync.ts` (+tests; dissolve
  `index.ts`).
- `projection/**` **except** `invariant-facts.ts` (+its two tests):
  `adapters.ts`, `constraint-invariant-fact.ts`, `contributors.ts`, `errors.ts`,
  `keyed-block-adapter.ts`, `managed-region-adapter.ts`, `marker-grammar.ts`,
  `pattern-list-adapter.ts`, `planning.ts`, `units.ts` (+tests, `conformance`
  and `markers` tests included). `invariant-facts.ts` stays RES because it
  imports `knowledge/manager.js` (`KnowledgeManager` tag), `knowledge/
discovery.js`, and `toAppError`; its `WorkspaceInvariantFactsLive` is composed
  by the CLI runtime and the install harness from the residue export.
- From `extensions/`: `errors.ts`, `managed-file-banner.ts` (+test),
  `manifest-package-discovery.ts`, `agent-overrides.ts` (+test).
- From `hooks/`: `errors.ts`, `discovery.ts` (`hookPackagesInDir`, +test),
  `managed-groups.ts` (+test), `outcomes.ts` (+test).
- From `rules/`: `errors.ts`, `discovery.ts` (`rulePackagesInDir`, +test).
- From `mcps/`: `errors.ts`, `config-writer.ts`, `inspection.ts`, `metadata.ts`,
  `projection.ts`, `resolution.ts`, `shared-target.ts`, `targeting.ts`
  (+tests incl. `shared-target-catalog` and the chrome-devtools live smoke;
  `mcp.example.json` stays RES with `mcps/` residue barrel — move it only if the
  XW tests reference it; verify at implementation).
- From `subagents/`: `errors.ts`, `lock-entry-builder.ts` (+test via
  `subagent-lock-entry.internal.test.ts` in `lockfile/` — that test lives in
  lockfile/ and moves with WS; verify its imports), `managed-file.ts`,
  `paths.ts`, `rendering/**` (adapters, overrides, types, index) (+tests).
- From `skills/`: `errors.ts`, `axm-skill-candidate.ts`,
  `axm-skill-compatibility.ts`, `axm-skill-workspace-compatibility.ts` (+tests).
- From `packs/`: `errors.ts`.
- From `knowledge/`: `errors.ts`, `discovery.ts` (`KNOWLEDGE_REGION_OWNER`,
  +test), `package-inspection.ts`.
- `extension-types/**` (catalog, derive, parity/**, +tests).
- `toml/**`, `yaml/**` (codec wrappers).
- Moved in: `utils/transient-backup.ts` (+test; `TransientBackupFailed` is in
  the XW error union), private `envOption` + home-dir helper copies (§0.1).

### 1.4 `@agentxm/registry-client` (integration, step 4)

- `registry/**` including `__generated__/registry-client.ts`, `registry-url.ts`,
  `admin-client.ts`, `archive-cache.ts`, `cache-root.ts`, `client.ts`,
  `deprecation-warning.ts`, `error-mapping.ts`, `failure-mapping.ts`,
  `local-client.ts`, `remote-client.ts`, `request-policy.ts`,
  `response-body.ts`, `retry-after.ts`, `translate.ts`, `utils.ts` (+tests incl.
  `openapi-error-contract` and `registry-client-sse`).
- Moved in from `packaging/`: `axm-package-meta.ts` (+test) and `purl-match.ts`
  (+test). Rationale: `registry/{client,local-client,remote-client}.ts` import
  them; `layer:integration` may not import a feature-destined module. Their other
  consumers (`packaging/read.ts`/`reader-io.ts`/`types.ts`, `discover/`) are RES
  features that legally import `@agentxm/registry-client`. (Alternative
  considered: `@agentxm/extension-model` — both are pure schema over model types;
  acceptable, but registry-client keeps the contract surface small. Decide once,
  at step 4.)
- Moved in from `utils/`: `network.ts` (`isLoopbackAddress`), plus **private
  copies** of `computeIntegrity`, `writeFileAtomic`/`sweepStaleAtomicWriteTemps`,
  `safeChildPath`/`isPathSafe`, and `stripFileProtocol` (see §1.7 — IR may not
  import WS).
- `generate:registry-client` + `sync:registry-spec` targets,
  `specs/registry-openapi.json`, and `scripts/generate-registry-client.ts`
  (workspace-root script) re-home to this project; generated output path becomes
  `packages/registry-client/src/__generated__/registry-client.ts`.

### 1.5 `@agentxm/extension-sources` (integration, step 4 — gated by §0.2)

- `source-resolution/**`: `file-url.ts`, `index.ts` (dissolved into root),
  `package-discovery.ts`, `package-sources.ts`, `provider-interface` test,
  `providers/**` (azurerepos, bitbucket, github, gitlab, local-parser, local,
  git, git-hosting, convention-discovery, parse-provider-shorthand,
  registry/host-provider), `resolution-flow` test, `resolve-identifier.ts`,
  `resolve-source-pattern.ts`, `resolve-source.ts`, `service.ts`
  (`SourceResolution`, `SourceHostProviders` tag; `SourceHostProvidersLive` →
  `./live`), `url-fragment.ts`, `workspace-catalog.ts` (the `WorkspaceCatalog`
  port — deliberately declared here, implemented by the CLI's
  `workspace-catalog-live.ts`).
- `git/**` (`detect.ts`, `operations.ts`, `index.ts` dissolved, +tests).
- Moved in from `utils/`: a private copy of `glob.ts`
  (`expandGlobs`/`isGlobPattern`, used by `resolve-source-pattern.ts`; the
  original stays RES for `publish/publish-ignore.ts` and the CLI) and a private
  `computeIntegrity` copy (host-provider).
- Declared cross-layer needs (the §0.2 exception): imports from WS root
  (`refs/*` types, `source-host-provider` port types, `discovery-walk`,
  `installable-types`, `SourceHostConfig` from settings) and XW root
  (`manifest-package-discovery`, `hookPackagesInDir`, `rulePackagesInDir`,
  `AXM_SKILL_BUNDLED_PREVIEW_COMMAND`, `evaluateAxmSkillCandidate`,
  `formatAxmSkillCompatibilityTarget`), plus IR (legal today).

Note: `workspace/source-host-provider.ts` (the `SourceHostProvider` interface)
**stays in WS** — `workspace/configured-entry-resolution/types.ts` (WS) imports
it, so moving it to IS would create WS→IS (a cycle against IS→WS). The kernel
declares the port; the integration implements it. Acyclicity verified: no
WS/WO/XW file imports `source-resolution/**`.

### 1.6 `@agentxm/agent-integration` (integration, step 4)

- `agents/**`: `constants.ts`, `descriptor-paths.ts`, `detection.ts`
  (`AgentExecutableResolver` tag + detection functions;
  `AgentExecutableResolverLive` → `./live`), `index.ts` dissolved (+test).
- `agent-capabilities/data/agents/README.md` (data directory; nothing imports
  it — verify whether any generator reads it before moving; if orphaned, move it
  alongside agents or delete).
- Keeps a private `envOption` copy (§0.1).

### 1.7 `utils/` dissolution map

| File                                  | Destination                                                                                                                                                                                                                       | Consumers driving the decision                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `atomic-write.ts`                     | WS private copy; IR private copy (step 4); original stays RES (`install-meta`, barrel) until step 7 → axm.sh                                                                                                                      | settings, lockfile (WS); registry client/archive-cache (IR); install-meta (CLI)                                   |
| `build-zip-archive.ts`                | RES (→ extension-publish later; has app-error import — wave 3)                                                                                                                                                                    | publish/publish-ignore                                                                                            |
| `environment.ts`                      | RES (→ axm.sh at step 7); tiny private `envOption` copies in WS, XW, IA                                                                                                                                                           | auth, cli-flags, packaging, telemetry, install-method (RES); scanners (WS); mcp-sync/repository (XW); agents (IA) |
| `fs-helpers.ts` (`stripFileProtocol`) | **Recommend `@agentxm/extension-model` `unstable/sources`** (pure locator-syntax helper; one home legal for WS/XW/IR/IS/RES). Fallback: private copies per package                                                                | extensions, hooks, knowledge, rules, skills, subagents, registry, workspace discovery                             |
| `glob.ts`                             | IS private copy; original stays RES                                                                                                                                                                                               | resolve-source-pattern (IS); publish, CLI (RES)                                                                   |
| `integrity.ts` (`computeIntegrity`)   | **Recommend `@agentxm/registry-protocol`** (content-integrity vocabulary; node:crypto hashing is within the contract budget — no fs/terminal/transport). Fallback: private copies in IR, IS + stays RES for skills/extensions ops | registry ×4 (IR), host-provider (IS), extensions/package-materialization + skills ops (RES)                       |
| `network.ts`                          | IR                                                                                                                                                                                                                                | registry/utils                                                                                                    |
| `path-safety.ts`                      | WS (root-exports `isPathSafe`, `safeChildPath`); IR gets a private copy                                                                                                                                                           | workspace, mcps/extension-workspace (XW→WS), extensions/skills ops (RES→WS), registry (IR)                        |
| `resolve-parent-symlinks.ts`          | WS (private)                                                                                                                                                                                                                      | workspace/create-symlink                                                                                          |
| `transient-backup.ts`                 | XW (root-exported; error union member)                                                                                                                                                                                            | extension-workspace/errors, hooks/manager (RES→XW), mcps/config-writer (XW), app-error conversions (RES→XW type)  |
| `index.ts`                            | RES, trimmed to what remains (env, glob, zip, stripFileProtocol until the model move)                                                                                                                                             | CLI imports of `unstable/utils` (env/glob) keep working                                                           |

The contract-package moves (`stripFileProtocol`, `computeIntegrity`) are small
additions to packages whose budgets are enforced — treat each as a reviewed
contract change; if rejected, fall back to per-package private copies (the
architecture forbids a shared utils package; duplication of ≤30-line pure
helpers is the sanctioned cost).

### 1.8 Residue after step 4 (stays in `@agentxm/extension-management`)

For steps 5–6 (feature slices): `lint/**`, `packaging/**` (minus
axm-package-meta, purl-match), `publish/**`, `discover/**`, `auth/**`,
`extension-lifecycle/**`, `workspace-configuration/**`,
`workspace-inspection/**` (incl. `version-currency/`), `workspace-sync/**`,
knowledge query cluster (`knowledge/{manager,instruction-entry,
knowledge-capabilities,knowledge-capture,knowledge-graph,knowledge-index,
knowledge-projection,knowledge-query,knowledge-revision}.ts` + trimmed barrel),
per-type residue (`hooks/{manager,operations/**}`, `rules/manager`,
`mcps/{manager,operations/**}`, `skills/{manager,materialization,utils,
operations/**,react-router-portable-install test}`, `packs/{manager,expansion,
dependency-resolution,dependency-reachability,resolved-dependency,
operations/**}`, `subagents/{manager,operations/**}`),
`extensions/{operations,package-materialization,canonical-reuse,
configured-entry,create-preflight,desired-identity,fork-package,
import-native-package,marker-fqn,materializable-from-disk,source-authority,
utils(remainder),__fixtures__}`, `projection/invariant-facts.ts`,
`plan/resolve-plan.ts`, example JSON files of residue modules.

For step 7 (→ axm.sh): `app-error/**`, `cli/**`, `cli-flags/**`,
`cli-prompt/**`, `cli-renderer/**`, `cli-runtime/**`, `telemetry/**` (+ its
generate targets), `install-meta/**`, `install-method/**`, `update-check/**`,
`version-resolution/**`, `branding/**`, `test-helpers.ts`, `utils` remnants.

Flagged steps-5/6 pre-work discovered here (record, do not act now):
`lint/**` imports `workspace-configuration/instructions` (feature→feature once
lint is extracted) and `skills/utils`; `subagents/manager` needs
`extension-workspace/managed-file-discovery` (fine, kernel); the knowledge
query cluster's `KnowledgeIndexLive` is composed by runtime and specs.

## 2. Package definitions

Common shape (copy `packages/extension-model` conventions):

- `package.json`: `"version": "0.28.3"` (fixed release group), `"type":
"module"`, `"license": "FSL-1.1-MIT"`, same `homepage/bugs/author/repository`
  block (with the package's `directory`), `"sideEffects": false`,
  `"files": ["dist/src/", "!**/*.map"]`, `"publishConfig": {"access":
"public"}`, `"engines": {"node": ">=22.19.0"}`, catalog/workspace specifiers
  exactly as below (`@nx/dependency-checks` enforces agreement with imports).
- `project.json`: `projectType: "library"`, `sourceRoot: "<root>/src"`, targets
  only `build` (`@nx/js:tsc`, `main: <root>/src/index.ts`, `outputPath:
<root>/dist`, `tsConfig: <root>/tsconfig.lib.json`, `clean: true,
generatePackageJson: false`) and `nx-release-publish`
  (`@nx/js:release-publish`). Everything else (cache, `^build`, inputs
  `production`/`^production`, outputs `dist`, lint, typecheck, inferred vitest
  `test` with `test-results/{projectName}` outputs) comes from `nx.json`
  targetDefaults and plugins — do not restate.
- tsconfig trio, copied from extension-model: `tsconfig.json` (solution file
  referencing lib + spec, `ignoreDeprecations: "6.0"`), `tsconfig.lib.json`
  (extends `../../tsconfig.lib-base.json`, composite, `outDir: dist`,
  `rootDir: .`, include `src/**/*`, exclude `src/**/*.test.ts`,
  `src/**/*.type-test.ts`, `src/**/test-helpers.ts` — extend the exclude list
  with `src/**/__tests__/**`, `src/**/__fixtures__/**`, `src/testing.ts` where
  testing files would otherwise land in the lib build; note: `testing.ts` and
  `live.ts` are production exports and stay IN the lib build), and
  `tsconfig.spec.json` (extends `../../tsconfig.test-base.json`, out-tsc/vitest,
  includes tests + `vitest.config.ts`, references lib + root). `nx sync` wires
  cross-package references; run it, don't hand-edit consumers.
- `vitest.config.ts` per package:
  `makeTestReporting({ layer: "internal", suite: "<package-dir>" })`, include
  `src/**/*.internal.test.ts`, exclude `src/**/*.type-test.ts` (copy the
  extension-management exclude comment; only extension-management keeps a
  windows config).
- Exports map (root + optional live/testing; **no other subpaths**):

```jsonc
"exports": {
  ".":          { "types": "./dist/src/index.d.ts",   "default": "./dist/src/index.js" },
  "./live":     { "types": "./dist/src/live.d.ts",    "default": "./dist/src/live.js" },
  "./testing":  { "types": "./dist/src/testing.d.ts", "default": "./dist/src/testing.js" }
}
```

`src/index.ts` is the documented public-API barrel (sanctioned); `live.ts` and
`testing.ts` are small explicit files. Ship `./live`/`./testing` only where the
table below lists content — an empty live/testing file is not created.

| Package                         | dir                             | tags                                                                      | dependencies                                                                                                                                                                                                                                                 | devDependencies (beyond the standard `@effect/vitest`, `vitest`, `typescript`, `@typescript/native`)                                                                                                                        | ./live                                                                                           | ./testing                                                                                                                   |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `@agentxm/workspace-state`      | `packages/workspace-state`      | `type:lib`, `layer:kernel`, `scope:workspace-state`, `release:cli`        | `effect`, `jsonc-parser`, `semver`, `yaml` (all `catalog:`), `@agentxm/extension-model`, `@agentxm/registry-protocol` (`workspace:^`)                                                                                                                        | `@types/semver`                                                                                                                                                                                                             | —                                                                                                | `WorkspaceReadModelTest` + fixture builders/decoders/occurrences (from `read-model/__fixtures__/`), `test-stubs.ts` exports |
| `@agentxm/workspace-operations` | `packages/workspace-operations` | `type:lib`, `layer:kernel`, `scope:workspace-operations`, `release:cli`   | `effect` (`catalog:`), `proper-lockfile` (`^4.1.2`), `@agentxm/extension-model`, `@agentxm/registry-protocol`, `@agentxm/workspace-state` (`workspace:^`)                                                                                                    | `@types/proper-lockfile` (`^4.1.4`)                                                                                                                                                                                         | `layer`, `loadWorkspace`, `WorkspaceLayerOptions` (from `operations/load-workspace.ts`)          | `ResolvePlanInteractionTest`                                                                                                |
| `@agentxm/extension-workspace`  | `packages/extension-workspace`  | `type:lib`, `layer:kernel`, `scope:extension-workspace`, `release:cli`    | `effect`, `jsonc-parser`, `semver`, `yaml`, `smol-toml` (all `catalog:`; note smol-toml is currently mis-declared as a devDep in extension-management), `@agentxm/extension-model`, `@agentxm/registry-protocol`, `@agentxm/workspace-state` (`workspace:^`) | `@types/semver`                                                                                                                                                                                                             | `CodingAgentRepositoryLive`                                                                      | —                                                                                                                           |
| `@agentxm/registry-client`      | `packages/registry-client`      | `type:lib`, `layer:integration`, `scope:registry-client`, `release:cli`   | `effect`, `fflate`, `semver` (`catalog:`), `@agentxm/extension-model`, `@agentxm/registry-protocol` (`workspace:^`)                                                                                                                                          | `@types/semver`, plus the openapi toolchain devDeps that the generate target needs (`@effect/openapi-generator`, `@effect/platform-node`, `swagger2openapi`, `@types/bun` — move from extension-management with the target) | — (clients are factories over `HttpClient`/`RegistryUrl` in R; no env-backed Layer exists today) | —                                                                                                                           |
| `@agentxm/extension-sources`    | `packages/extension-sources`    | `type:lib`, `layer:integration`, `scope:extension-sources`, `release:cli` | `effect`, `semver`, `simple-git` (`catalog:`), `@agentxm/extension-model`, `@agentxm/registry-protocol`, `@agentxm/registry-client`, **`@agentxm/workspace-state`, `@agentxm/extension-workspace`** (`workspace:^`; the §0.2/§6.4 exception)                 | `@types/semver`                                                                                                                                                                                                             | `SourceHostProvidersLive` (split out of `service.ts`)                                            | —                                                                                                                           |
| `@agentxm/agent-integration`    | `packages/agent-integration`    | `type:lib`, `layer:integration`, `scope:agent-integration`, `release:cli` | `effect` (`catalog:`), `@agentxm/extension-model` (`workspace:^`)                                                                                                                                                                                            | —                                                                                                                                                                                                                           | `AgentExecutableResolverLive` (split out of `detection.ts`)                                      | —                                                                                                                           |

Notes:

- WS ships no `./live`: it defines services (`WorkspaceMutations`,
  `AgentPresenceProbe`, `AgentRootResolver`, read-model config) whose concrete
  composition lives in WO (`loadWorkspace`) and the CLI. Exception check:
  `AgentRootResolverLive` (in `read-model/agent-root-resolver.ts`) is
  deterministic Path-service wiring, not environment-backed — it may stay a root
  export; if review disagrees, WS grows a `./live` for it (then re-point
  `loadWorkspace`).
- `proper-lockfile` is used only by `workspace/operations/transition-lock.ts` →
  WO only; remove it (and `@types/proper-lockfile`) from extension-management.
- IR devDep note: `generate:registry-client` script deps move with the target.

### 2.1 Root export content (intentional, not sprawl)

**workspace-state root** = the current `workspace/index.ts` surface **minus**
the WO entries (`scanPlanReadiness`, `augmentPlanWithReconciliation`,
`runWorkspaceTransaction`/`withWorkspaceClosure`/`settleWorkspaceClosure`/
`rollbackWorkspaceClosure`, transition-lock exports, `layer`, `loadWorkspace`,
`WorkspaceLayerOptions`) and the XW entry (`ExtensionManager`,
`MaterializationObservation`), **plus** these symbols residue/CLI/XW consume
today via subpath or sibling import and the barrel does not yet export:
`removeIfExists` (remove-if-exists), `createProtectedSymlink`/create-symlink
exports, `computeSkillPathsForLayout` (+`SkillPathSource` value side),
the `*LockEntryToRef` family incl. `knowledgeLockEntryToRef`
(lock-entry-to-ref), `lockEntryToSourceParams` (lock-entry-to-source-params),
source-to-lock-entry exports, discovery-walk constants
(`DISCOVERY_MAX_DEPTH`, `DISCOVERY_SKIPPED_DIRECTORIES`, walk helpers),
materialized-file-target type, scope-refusal exports, read-model
`errors`/`types`/scoped-agents surface as consumed (`workspace/read-model/
errors.js`, `read-model/service.js` are imported directly by XW's
`axm-skill-workspace-compatibility`), settings surface (`SettingsSchema`,
`SETTINGS_KEY_ORDER`, `writeSettingsAtPath`, `SourceHostConfig`, entry types,
format-preserving-json as consumed), lockfile surface (`LockfileSchema`,
`LOCKFILE_VERSION`, entry-fields, accepted-registry-version, resolved-version,
errors), schema surface, `resolveKnowledgeDiscoveryConfig`, `isPathSafe`/
`safeChildPath`/`validatePathSafety`, and the transaction-registration API
(`protectWorkspacePath`, `protectCreatedAncestors`, `recordFootprint`,
`readFootprint`, `FootprintRecorder`, restoration types).

**workspace-operations root** = `plan/index.ts` surface minus
`previewOrApplyPlan` (RES) plus the four `workspace/operations/*` export groups
currently re-exported through `workspace/index.ts` (transaction runner +
closure functions, transition-lock, scan-plan-readiness, augment-plan) and the
`ResolvePlanInteraction`/`InterruptionSignalSource` ports.

**extension-workspace root** = `extension-workspace/index.ts` surface (minus
the Live) + projection exports minus `invariant-facts` + the per-type semantic
exports listed in §1.3 (per-type errors, discovery fns, mcps semantics,
subagents rendering/paths/lock-entry-builder/managed-file, axm-skill trio,
knowledge discovery/package-inspection, extension-types, toml/yaml codecs,
transient-backup).

**registry-client root** = `registry/index.ts` surface + `RegistryUrl` +
axm-package-meta/purl-match exports. **extension-sources root** =
`source-resolution/index.ts` surface minus the Live (service, tags,
resolveSource/resolveIdentifier/resolveSourcePattern, providers' contracts,
`WorkspaceCatalog` port, git detect/operations). **agent-integration root** =
current `agents/index.ts` surface minus the Live.

Symbols the roots must NOT export (wrong-package / deep-import-pressure flags):

- WS must not re-export `ExtensionManager`/`MaterializationObservation` (XW
  owns them; today's workspace barrel does — consumers re-point).
- WO must not export `previewOrApplyPlan` or anything from `resolve-plan.ts`.
- XW must not export `WorkspaceInvariantFactsLive`/invariant-facts (RES).
- Nothing exports `makeWorkspaceMutations` internals, `read-model-record-readers`
  internals, or atomic-write/resolve-parent-symlinks private helpers.
- Flag (accept now, revisit at steps 5–6): IS `providers/registry/
host-provider.ts` consuming the axm-skill compatibility gate from XW is
  feature-flavored policy inside an integration — candidate to lift into
  workspace-inspection/lifecycle later. Likewise `plan/resolve-plan.ts` (RES)
  reaching `hooks/manager` is the known `ConfiguredAgentOutcomesProvider` port
  gap (design-3f §3.3) — do not solve it during extraction.

## 3. Cross-package import rewrite map

### 3.1 Whole-module specifier moves

Old specifier (`@agentxm/extension-management/unstable/…` for external
consumers; `../<module>/…` relative for residue-internal) → new specifier:

| Old module                                                                                                                                                                    | New specifier                                                                                               | Step |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---- |
| `unstable/settings`, `unstable/lockfile`, `unstable/schema`                                                                                                                   | `@agentxm/workspace-state`                                                                                  | 3    |
| `unstable/workspace`                                                                                                                                                          | split — §3.2 table                                                                                          | 3    |
| `unstable/plan`                                                                                                                                                               | `@agentxm/workspace-operations` except `previewOrApplyPlan` (stays `unstable/plan`, trimmed)                | 3    |
| `unstable/extension-workspace`, `…/extension-workspace/errors`                                                                                                                | `@agentxm/extension-workspace`                                                                              | 3    |
| `unstable/extension-types`, `unstable/toml`, `unstable/yaml`                                                                                                                  | `@agentxm/extension-workspace`                                                                              | 3    |
| `unstable/projection`                                                                                                                                                         | `@agentxm/extension-workspace` except `WorkspaceInvariantFactsLive`/invariant-facts (stays, trimmed barrel) | 3    |
| `unstable/registry`                                                                                                                                                           | `@agentxm/registry-client`                                                                                  | 4    |
| `unstable/source-resolution`, `unstable/git`                                                                                                                                  | `@agentxm/extension-sources`                                                                                | 4    |
| `unstable/agents`                                                                                                                                                             | `@agentxm/agent-integration`                                                                                | 4    |
| `unstable/extensions`, `unstable/hooks`, `unstable/rules`, `unstable/mcps`, `unstable/skills`, `unstable/packs`, `unstable/subagents`, `unstable/knowledge`, `unstable/utils` | split — §3.3                                                                                                | 3/4  |

### 3.2 `unstable/workspace` symbol split (the 165 CLI imports + all residue imports)

| Symbol group (as exported by today's workspace barrel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | New home                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Refs types, `installableExtensionTypes` family, extension-paths, rendered-files, package-hash, materialized-tree, `sanitizeName`/`normalizeExtensionName`, pack-paths, pack-manifest-content-identity, `ArtifactChange*`, `ConfiguredAgentOutcome*`, mcp-entry-semantics, scope/layout/paths, record rows/types, locked-entries, desired-state graph/enabled/problem-text/pack-lock, canonical-observation, accepted-canonical-ref, `isObservedInstalled`, `resolveWorkspaceExtensionRef` + configured-entry types, source-metadata, read-model (service, inventory, discovery, AgentRootResolver, errors), `WorkspaceMutations` + every service-interface type (incl. `ExtensionTarget*`, `LockfileState`, `WorkspaceTransactionRunner`/`Capabilities`/`TransitionAcquirer` **types**), workspace errors, WS transaction half (`protectWorkspacePath`, `protectCreatedAncestors`, `readPendingClosureRestorationFailures`, `WorkspaceRestorationIncomplete`, `TransitionLockError`/`TransitionLockUnavailable` and sibling error classes, `TransitionContention`/`TransitionLockHolder` types), setup-scope-support, configured-agent-outcomes, footprint-recorder, `AgentPresenceProbe`, source-host-provider port types (`SourceHostProvider`, `FindOptions`, `NamedRegistryResolution`, `ExtensionFiles`) | `@agentxm/workspace-state`                                          |
| `scanPlanReadiness`, `augmentPlanWithReconciliation` (+result types), `runWorkspaceTransaction`, `withWorkspaceClosure`, `settleWorkspaceClosure`, `rollbackWorkspaceClosure`, `WorkspaceTransactionArgs`, transition-lock runtime (`acquireWorkspaceTransitionLock`, `heldWorkspaceTransition`, `isWorkspaceTransitionHeldByThisInvocation`, `transitionLockPath`, `TRANSITION_WAIT_BOUND_MILLIS`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `@agentxm/workspace-operations`                                     |
| `layer`, `loadWorkspace`, `WorkspaceLayerOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `@agentxm/workspace-operations/live` (composition-root import only) |
| `ExtensionManager`, `MaterializationObservation`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `@agentxm/extension-workspace`                                      |

### 3.3 Per-type barrel splits (residue keeps a trimmed `unstable/<module>` export)

| Module       | Moves to XW root                                                                                                                                                                                                                               | Stays in trimmed residue barrel                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions` | `errors` exports (incl. `SourceAuthorityBlocked`… verify which error classes live in `extensions/errors.ts`), `insertManagedFileBanner`, `managedFileFormatForPath` + banner exports, `discoverManifestPackagesInDir`, agent-overrides exports | operations, package-materialization, fork/import/create-preflight/desired-identity/canonical-reuse/configured-entry/marker-fqn/materializable-from-disk/source-authority, `copyExtensionDirectory` |
| `hooks`      | `hookPackagesInDir` (+discovery), hooks errors, managed-groups, outcomes                                                                                                                                                                       | `HookManager`(+Live), `operations/new-hook`                                                                                                                                                        |
| `rules`      | `rulePackagesInDir` (+discovery), rules errors                                                                                                                                                                                                 | `RuleManager`(+Live)                                                                                                                                                                               |
| `mcps`       | errors, config-writer, inspection, metadata, projection, resolution, shared-target, targeting                                                                                                                                                  | `McpServerManager`(+Live), `operations/*`                                                                                                                                                          |
| `skills`     | errors, axm-skill-candidate/compatibility/workspace-compatibility (incl. `AXM_SKILL_BUNDLED_PREVIEW_COMMAND`, `evaluateAxmSkillCandidate`, `formatAxmSkillCompatibilityTarget`, `AxmSkillCompatibilitySchema`)                                 | `SkillManager`(+Live), `makeAxmSkillCompatibilityPolicyLayer` (verify: if it is pure policy over XW types it may move instead — spec + runtime consume it), materialization, utils, `operations/*` |
| `packs`      | errors                                                                                                                                                                                                                                         | manager(+Live), expansion, dependency-resolution/-reachability, resolved-dependency, `operations/*`                                                                                                |
| `subagents`  | errors, rendering/**, managed-file, paths, lock-entry-builder                                                                                                                                                                                  | `SubagentManager`(+Live), `operations/*`                                                                                                                                                           |
| `knowledge`  | errors, discovery (`KNOWLEDGE_REGION_OWNER`), package-inspection; discovery-config → **WS**                                                                                                                                                    | manager(+Live), `KnowledgeIndexLive` + query/graph/index/capture/revision/projection/instruction-entry/capabilities                                                                                |
| `projection` | everything except invariant-facts                                                                                                                                                                                                              | `WorkspaceInvariantFactsLive` + invariant-facts                                                                                                                                                    |
| `utils`      | per §1.7                                                                                                                                                                                                                                       | environment, glob, build-zip-archive, fs-helpers remainder, trimmed barrel                                                                                                                         |

### 3.4 Residue-internal relative-import rewrites (counts from the edge scan)

Every residue file importing a moved file re-points to the new package root.
Largest surfaces (production imports): skills→WS 43, mcps→WS 33, subagents→WS
25, packs→WS 23, lint→WS 17, source-resolution→WS 17 (becomes IS-internal at
step 4), extensions→WS 16, workspace-configuration→WS 15, knowledge→WS 15,
hooks→WS 14, extension-lifecycle→WS 11, workspace-inspection→WS 9,
per-type→plan/WO ~70, per-type→XW ~45, cli-runtime→WS/WO/XW ~12,
app-error/conversions→ moved error types (WS/WO/XW roots) ~15. Mechanical;
typecheck + dependency-checks enforce completeness.

`extension-lifecycle/configured-entry-resolution.ts` after step 3 imports:
refs/types/accepted-canonical-ref/workspace-ref/`WorkspaceMutations` from
`@agentxm/workspace-state`; release-age from registry-protocol (already);
`SourceHostProviders`/`resolveSource` from residue `source-resolution` until
step 4, then `@agentxm/extension-sources` (feature→integration, legal).

### 3.5 CLI (`packages/cli/src`) rewrite volumes

`unstable/workspace` 165, `unstable/plan` 154 (nearly all → WO; audit each for
`previewOrApplyPlan` which stays), `unstable/extension-workspace` 50,
`unstable/source-resolution` 53, `unstable/skills` 39 (split), `unstable/
knowledge` 39 (mostly residue query cluster; discovery-config uses → WS),
`unstable/extensions` 39 (split), `unstable/registry` 32, `unstable/subagents`
30 (split), `unstable/hooks` 30 (split), `unstable/rules` 27 (split),
`unstable/mcps` 25 (split), `unstable/packs` 23 (split), `unstable/lockfile`
17, `unstable/settings` 13, `unstable/utils` 12 (env/glob — unchanged),
`unstable/agents` 5, `unstable/extension-types` 2, `unstable/git` 2.
`packages/cli/package.json` gains the six `workspace:^` deps as each lands.

The CLI currently implements many use cases directly against kernels; that is
expected until steps 5–6 thin the handlers. Do **not** tighten the
handler-bypass lint during extraction.

## 4. Interim residue plan (`@agentxm/extension-management` between steps 3 and 7)

- Tags unchanged: `type:lib`, `layer:feature`, `scope:core`, `release:cli`.
  Feature → kernel/integration/contract edges are exactly what the matrix
  allows; nothing moved may import the residue (verified for the §1 partition:
  the only moved→residue edges in the current tree are the app-error debt in
  §0.1, which the prerequisite waves remove).
- `package.json`: add `@agentxm/workspace-state`, `@agentxm/workspace-operations`,
  `@agentxm/extension-workspace` (step 3), `@agentxm/registry-client`,
  `@agentxm/extension-sources`, `@agentxm/agent-integration` (step 4), all
  `workspace:^`. Remove `proper-lockfile`/`@types/proper-lockfile` (step 3),
  `simple-git` (step 4). Keep `fflate` (build-zip-archive) even though IR also
  declares it. Keep `jsonc-parser`, `yaml`, `semver`, `packageurl-js` (packaging
  detectors), `marked`, `@napi-rs/keyring` (+ eslint `ignoredDependencies`
  entry stays). `smol-toml` devDep: moves to XW as a real dependency; delete
  here when the last residue toml consumer (subagents rendering moves at step 3)
  is gone — verify with dependency-checks.
- Exports map: delete moved entries (`./unstable/{workspace,settings,lockfile,
schema,extension-workspace,extension-workspace/errors,extension-types,toml,
yaml}` at step 3; `./unstable/{registry,source-resolution,git,agents}` at
  step 4); keep trimmed barrels for split modules (§3.3) — a trimmed barrel is
  a smaller file, not an alias layer, and dies with its module at steps 5–7.
- `project.json`: `generate:e2e-extension-matrix` (+`scripts/
generate-e2e-extension-matrix.ts`) moves to the extension-workspace project at
  step 3 (inputs: `{projectRoot}/src/extension-types/parity/**/*.ts`,
  extension-model common.ts, prettierrc; output unchanged:
  `packages/cli-e2e/src/__generated__/extension-type-matrix.ts`).
  `generate:registry-client` + `sync:registry-spec` (+`specs/
registry-openapi.json`) move to registry-client at step 4.
  `generate:telemetry-client` + `sync:telemetry-spec` stay. The residue
  `generate` noop target's dependsOn shrinks accordingly; its `build` main
  (`app-error/index.ts`) is unchanged.
- Residue vitest config unchanged (`src/**/*.internal.test.ts` still matches);
  the windows config keeps matching `workspace-configuration/
instructions.windows.test.ts`.

## 5. Live/Testing split inventory and composition updates

Files that must split (contract stays at root, `…Live` → `live.ts`, `…Test` →
`testing.ts`):

| Current file                                                                                                | Root keeps                                                             | → `./live`                    | → `./testing`                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace/operations/load-workspace.ts`                                                                    | — (whole file is composition)                                          | `layer`, `loadWorkspace`      | —                                                                                                                                                                                                                                                                                           |
| `plan/resolve-plan-interaction.ts`                                                                          | `ResolvePlanInteraction` port + vocabulary                             | —                             | `ResolvePlanInteractionTest`                                                                                                                                                                                                                                                                |
| `workspace/test-stubs.ts`, `workspace/read-model/__fixtures__/{builder,decoders,occurrences,test-layer}.ts` | —                                                                      | —                             | WS testing (incl. `WorkspaceReadModelTest`); consumed by moved WS tests and by residue `lint/catalog/workspace-fixtures/fixture-state.ts` (verify that file is test-only before it imports `/testing`; if it is imported by production lint code, that is a violation to flag, not to ship) |
| `extension-workspace/repository.ts`                                                                         | `CodingAgentRepository` service + registry-backed contract             | `CodingAgentRepositoryLive`   | —                                                                                                                                                                                                                                                                                           |
| `source-resolution/service.ts` (step 4)                                                                     | `SourceResolution`, `SourceHostProviders` tag, provider registry types | `SourceHostProvidersLive`     | —                                                                                                                                                                                                                                                                                           |
| `agents/detection.ts` (step 4)                                                                              | detection fns, `AgentExecutableResolver` tag                           | `AgentExecutableResolverLive` | —                                                                                                                                                                                                                                                                                           |

Lives that stay in the CLI (their ports move; re-point type imports only):
`cli-runtime/resolve-plan-interaction-live.ts` (port → WO),
`cli-runtime/workspace-initialization-interaction-live.ts` (port stays residue
`workspace-configuration`), `cli-runtime/auth-login-presenter-live.ts` (port
stays residue `auth`), `cli-runtime/agent-presence-live.ts` (port
`AgentPresenceProbe` → WS root; impl uses `agents/detection` — residue import
until step 4, then `@agentxm/agent-integration`),
`cli-runtime/workspace-catalog-live.ts` (port `WorkspaceCatalog` stays in
extension-sources; live imports it from residue until step 4, then
`@agentxm/extension-sources`; its workspace reads → WS root).

Manager Lives (`HookManagerLive`, `RuleManagerLive`, `KnowledgeManagerLive`,
`McpServerManagerLive`, `SkillManagerLive`, `SubagentManagerLive`,
`PackManagerLive`), `WorkspaceInvariantFactsLive`, `KnowledgeIndexLive`, and
the auth Lives stay residue exports — unchanged composition.

`packages/cli/src/runtime.ts` updates:

- Step 3: `layer as coreWorkspaceLayer` import moves from
  `…/unstable/workspace` to `@agentxm/workspace-operations/live`;
  `CodingAgentRepositoryLive` from `@agentxm/extension-workspace/live`;
  `InterruptionSignalSource`/`ResolvePlanInteraction` port types from
  `@agentxm/workspace-operations`; `AgentPresenceProbe` from
  `@agentxm/workspace-state`. The `/live` eslint carve-out already whitelists
  only `packages/cli/src/runtime.ts` — these imports are legal there and
  nowhere else.
- Step 4: `SourceHostProvidersLive` from `@agentxm/extension-sources/live`;
  `RegistryUrl` from `@agentxm/registry-client`;
  `AgentExecutableResolverLive` (where composed — runtime or harness) from
  `@agentxm/agent-integration/live`.
- First-use initialization: `loadWorkspace` (now WO live) currently invokes
  residue `workspace-configuration` initialization? **Verify at implementation**
  — design-3f §5.4/§5.5 flagged this seam; if `load-workspace.ts` still calls
  the initialization feature, that call must be inverted (an `onUninitialized`
  capability passed from the CLI) before WO can be extracted, since WO must not
  import a feature. The current tree shows `load-workspace.ts` importing only
  `workspace/{service,service-interface}` — if that holds, no work; confirm.

## 6. Ordering, verification, and enforcement/config updates

### 6.1 Ordering

1. **3.0 prerequisites** (§0.1): wave-1 error decoupling for the 17 listed
   files; the small vocabulary moves; moved-test fixups. Each lands green.
2. **3a `@agentxm/workspace-state`** — biggest fan-in first. Residue +
   specifications keep compiling because residue re-points in the same change.
3. **3b `@agentxm/workspace-operations`** (depends on WS).
4. **3c `@agentxm/extension-workspace`** (depends on WS).
5. **4a `@agentxm/agent-integration`** (independent, tiny).
6. **4b `@agentxm/registry-client`** (+ axm-package-meta/purl-match move, wave-2
   registry decoupling, generator re-home).
7. **4c `@agentxm/extension-sources`** — only after the §6.4 requirements
   change (or K5 redesign) is accepted; wave-2 sources/git decoupling first.

Each extraction is one PR-sized change: create package, `git mv` sources,
rewrite imports (residue + CLI + scripts), trim residue exports/manifest, update
enforcement lists, run gates. No intermediate dual-export state.

### 6.2 Verification per extraction

Environment: `export NX_TUI=false NX_DEFAULT_OUTPUT_STYLE=static
NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false`.

1. `pnpm install` (workspace glob `packages/*` already covers new dirs).
2. `pnpm run build` first (TS7 reports TS6305 on stale dist after moves).
3. `pnpm exec nx run <new-package>:test`, `:lint`, `:typecheck`, `:build`.
4. `pnpm run verify:workspace` (includes `nx sync:check` — project references).
5. `pnpm run verify:pr` with `--base=origin/main` semantics for working-tree
   verification (NX_HEAD ignores uncommitted work).
6. Specification suite (`pnpm exec nx run specifications:test` or via
   `pnpm run test:all`) — see §6.5 for the specs that need coordinated edits.
7. `pnpm run e2e:all` before each push batch; the compiled-binary install suite
   needs `cli:compile-host` to have produced
   `packages/cli/dist/host-bin/axm-linux-x64`.
8. `pnpm exec nx release version --dry-run` once per step to confirm the fixed
   `release:cli` group picks up the new packages at 0.28.3.
9. Runtime smoke: run the built CLI (`axm list`/`axm lint` against a fixture
   workspace or `pnpm run smoke:local`) to catch duplicated service tags —
   typecheck cannot.

### 6.3 eslint.config.mjs updates (implementation policy — editable directly)

- Timestamp backstop `files` list (line ~236): add
  `packages/workspace-state/src/**/*.ts`, `packages/workspace-operations/…`,
  `packages/extension-workspace/…` at step 3; the three integration globs at
  step 4. (Or generalize to the six + existing four explicitly; do not glob
  `packages/*` — e2e/tooling are deliberately excluded.)
- `axm-policy/no-unbounded-io` files: fix the **already-stale**
  `packages/extension-management/src/unstable/workspace/version-currency/collectors.ts`
  → `…/workspace-inspection/version-currency/collectors.ts` (silently matching
  nothing today — pre-existing bug, fix immediately); at step 4 re-point
  `registry/remote-client.ts` → `packages/registry-client/src/remote-client.ts`
  and `source-resolution/providers/convention-discovery.ts` →
  `packages/extension-sources/src/providers/convention-discovery.ts`.
- `type:e2e` and `scope:test` `notDependOnLibsWithTags` lists currently name
  `scope:core`, `scope:extension-model`, `scope:registry-protocol`: add the six
  new `scope:*` tags — or (recommended, one review) replace the scope
  enumeration with `release:cli`, which covers every product package now and in
  steps 5–6 without further edits.
- Spec-import restriction regex: **already contains all six names** (verified:
  `workspace-(state|operations|…)`, `extension-(workspace|sources|…)`,
  `agent-integration`, `registry-(client|auth)`), `/testing` excepted — no
  change.
- `@agentxm/*/live`, `/testing`, deep-import bans, `@nx/dependency-checks`:
  pattern-based, cover new packages automatically — no change.
- extension-model `allowedExternalImports` budget row: unchanged (verified) —
  unless the §1.7 `stripFileProtocol` move lands (no new externals needed).

### 6.4 Requirements-level changes (flag for the orchestrator — do NOT edit silently)

These are specifications (or accepted-requirement projections). Land each as a
reviewed requirements edit in the same change set as the extraction it enables:

1. `specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts`
   — `WORKSPACE_MANIFESTS`: step 3 adds `packages/workspace-state/package.json`,
   `packages/workspace-operations/package.json`,
   `packages/extension-workspace/package.json`; step 4 adds the three
   integration manifests. Step 4 also updates the generated-client existence
   check from `packages/extension-management/src/unstable/registry/__generated__`
   to `packages/registry-client/src/__generated__` (telemetry path unchanged
   until step 7).
2. `specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts`
   — `FORBIDDEN_PACKAGE_NAMES` gains `@agentxm/workspace-state`,
   `@agentxm/workspace-operations`, `@agentxm/extension-workspace` (step 3) and
   the three integrations (step 4); `FORBIDDEN_PROJECT_ROOTS` gains the matching
   `packages/<dir>` entries.
3. **Integration→kernel allowance for extension-sources (gates 4c).**
   `package-dependencies-point-inward.spec.ts` observes the declared package
   manifests and treats kernels and integrations as peers, so it needs no
   amendment; the eslint `layer:integration` row is what forbids the edge.
   Option A (recommended): amend the eslint row to
   `["layer:integration", "layer:kernel", "layer:contract"]`, and amend
   `docs/architecture/package-architecture.md` (layer table + the
   extension-sources row's expected inward deps) with the rationale: source
   discovery deliberately traffics in workspace refs and per-type canonical
   discovery; the kernel declares the `SourceHostProvider`/catalog ports and the
   integration implements them; direction stays inward and acyclic (kernels
   still cannot import integrations). Option B: complete the K5 inversion
   (neutral provider result types, per-type discovery injected at composition)
   before extracting — a large redesign steps 5–6 do not require. Present both;
   A is this manifest's recommendation.
4. Spec files/support importing symbols that move (eslint forbids specs from
   importing the new kernel/integration roots, so these cannot be mechanically
   re-pointed — route them through `axm.sh/specification-harness` re-exports,
   which is app code and may compose anything, or another reviewed shape):
   - Step 3: `support/reachability-fixture.ts`
     (`computePackManifestContentIdentity` → WS root);
     `settings-contract/published-settings-schema-agrees-with-accepted-input.spec.ts`
     (`SettingsSchema` → WS root; its `allCatalogRuleIds` from lint is residue,
     fine);
     `settings-contract/published-lockfile-schema-agrees-with-accepted-input.spec.ts`
     (`LockfileSchema`, `LOCKFILE_VERSION` → WS root);
     `settings-contract/saving-settings-preserves-authored-formatting.spec.ts`
     (`SettingsSchema`, `writeSettingsAtPath` → WS root);
     `support/install-harness.ts` (`CodingAgentRepositoryLive` → XW `/live`).
   - Step 4: `support/install-harness.ts` (`SourceHostProvidersLive` → IS
     `/live`); `support/setup-harness.ts` (`AgentExecutableResolver` → IA root,
     `RegistryUrl` → IR root);
     `source-resolution/locator-grammar-is-stable.spec.ts` (`resolveSource` →
     IS root — consider re-founding this spec on the contract-side
     parser/printer in extension-model, which is where the locator grammar now
     lives; that is a requirements decision).
   - Unaffected: `cli/exit-codes…` (app-error stays residue),
     `cli/machine-errors…` (cli-runtime stays), telemetry specs, manager Lives
     in `install-harness` (residue), `setup-harness`'s cli-flags/cli-renderer/
     workspace-configuration imports (residue).
5. `contributing/migration/status.md`: append each landed slice (the ledger the
   orchestrator owns).

### 6.5 Pinned specs most at risk per extraction

Step 3: the two settings-contract specs (symbol re-route, §6.4.4),
`reachability-fixture` consumers (which install/pack specs use it),
`machine-errors-use-the-stable-envelope` (drives `classifyError` — plan
`StepFailure` vocabulary is WO-bound but `classifyError` and the envelope stay
residue; risk is only via the wave-1 debt clears, which the golden-pair test in
design-3e §5.4 pins), `package-dependencies-point-inward`,
`package-dependencies-stay-acyclic`, `feature-packages-stay-peers`, and
`live-composition-stays-in-application` (must stay green — they observe
dependency direction, acyclicity, and feature isolation on the declared
manifests plus gate registration, not adjacency, so extraction passes if the
§1 partition is respected). Step 4: `locator-grammar-is-stable`, the registry error-contract
tests moving with IR (`openapi-error-contract`, `registry-client-sse` — they
move into the IR package's own suite), telemetry specs (untouched).

### 6.6 Docs/instructions/scripts updates

- `AGENTS.md` "Library `unstable` namespace" paragraph: rescope to
  extension-model, registry-protocol, and the extension-management residue;
  document the new-package convention (`src/` + root/`./live`/`./testing`
  exports, no unstable namespace). Also sweep AGENTS.md/docs references to
  moved module paths.
- `packages/cli/project.json` `generate:bundled-axm-skill` inputs:
  `…extension-management/src/unstable/skills/axm-skill-compatibility.ts` →
  `packages/extension-workspace/src/axm-skill-compatibility.ts` (step 3); update
  `packages/cli/scripts/generate-bundled-axm-skill.ts` import accordingly.
- `packages/cli/scripts/generate-type-enumerations.ts` imports
  `../../extension-management/src/unstable/extension-types/catalog.js` →
  `../../extension-workspace/src/extension-types/catalog.js` (step 3). Note:
  this file is **missing from the target's inputs** today (stale-cache bug) —
  add it while touching the target.
- `packages/cli/scripts/generate-schemas.ts`: `LockfileSchema`/`SettingsSchema`
  imports → `../../workspace-state/src/…` (step 3); `AxmPackageMetaSchema` →
  `../../registry-client/src/axm-package-meta.js` (step 4).
- `scripts/parity-ledger-check-lib.ts`: parity path →
  `packages/extension-workspace/src/extension-types/parity/exemptions.ts`
  (step 3).
- `scripts/verify-source-hygiene.tooling.test.ts`: paths reference residue
  cli-renderer/cli-prompt — unchanged until step 7.
- eslint `allow` entry `^\.\./\.\./\.\./extension-management/dist/` (cli-e2e
  subprocess fixtures): unchanged until step 7.
- `nx.json`: **no changes** (verified): vitest plugin include
  `packages/**/vitest.config.ts` and targetDefaults cover new packages;
  `release.projects: ["tag:release:cli"]` picks them up by tag; keep
  `projectsRelationship: "fixed"`.

## 7. Risk register (top 10)

1. **Layer-matrix requirements coupling (extension-sources).** The inward spec
   pins the integration allow-list; extracting IS without the reviewed change
   fails lint and the spec. Mitigation: §6.4.3 option A landed before 4c;
   sequence IR/IA first so step 4 is not all-or-nothing.
2. **Residual app-error imports in a move set.** Any missed file makes the new
   package import the residue (kernel/integration → feature; also
   package-boundary lint failure). Mitigation: §0.1 per-file ledger; exit
   criterion per extraction: `grep -r "app-error" <new-package>/src` is empty;
   design-3e's `toAppError` interim shims cover still-resident callers.
3. **Duplicated Effect service identities during moves.** Copying (rather than
   moving) a `ServiceMap.Service` class (e.g. `SourceHostProviders`,
   `WorkspaceMutations`, footprint/transaction ambient references) yields two
   incompatible tags at runtime — typecheck stays green, composition breaks.
   Mitigation: `git mv` service-defining files, never copy; runtime smoke
   (§6.2.9); single-definition rule for the transaction ambient references
   (defined in WS, consumed by WO — already the landed seam).
4. **Barrel-split mistakes.** The workspace barrel currently re-exports WO and
   XW symbols; a leftover re-export re-creates the old coupling (WS→WO/XW) and
   trips module boundaries; a missed root export breaks dozens of consumers.
   Mitigation: §2.1/§3.2 symbol tables are the checklist; dependency-checks +
   typecheck close the loop.
5. **Spec-import restriction vs moved symbols.** Specs cannot import the new
   roots; five spec/support files import symbols that move (§6.4.4). Missing
   this strands the extraction PR on red specs that may not be edited silently.
   Mitigation: pre-agree the specification-harness re-export change with the
   orchestrator; land it with 3a.
6. **Package-level cycle via lifecycle entanglement.** Moving any manager,
   `invariant-facts`, `resolve-plan`, or `extensions/operations` into a kernel
   at step 3 creates kernel→feature/integration edges (and WO↔XW pressure via
   `plan/resolve-plan → hooks/manager`). Mitigation: this manifest's RES
   assignments; verify with `pnpm exec nx graph --file=…` after each move that
   new-package edges match §2's dependency tables exactly.
7. **TS7 project-reference and stale-dist churn.** TS6305 after `git mv`;
   `nx sync` must rewrite references; out-tsc/vitest caches go stale.
   Mitigation: `pnpm run build` before typecheck, `nx sync` in-change,
   `nx reset` when caching misbehaves, `verify:workspace` gate.
8. **Release group and versioning.** Fixed group + `versionPlans: true` +
   disk resolver: a new package at the wrong version (or missing
   `nx-release-publish` target/`release:cli` tag) breaks `nx release version`.
   Mitigation: 0.28.3 everywhere, copy the extension-model release target,
   dry-run per step (§6.2.8).
9. **Generate-target inputs and caching.** Moved generators
   (`generate:e2e-extension-matrix`, `generate:registry-client`,
   `generate:bundled-axm-skill` inputs, schema/type-enumeration scripts) with
   stale input paths silently produce cache hits on wrong inputs — the existing
   `generate:type-enumerations` missing-input bug and the stale
   `no-unbounded-io` path show this failure mode is real. Mitigation: §6.6
   checklist; `nx reset` + re-run generators and diff outputs as part of each
   extraction's verification.
10. **Allure/report wiring and inferred test targets.** New packages rely on
    inferred vitest targets writing `test-results/{projectName}` via
    targetDefaults; a package whose `vitest.config.ts` forgets
    `makeTestReporting` (or reuses another suite name) silently drops results
    from the Allure aggregation. Mitigation: copy the config template with a
    unique `suite` per package; check `test-results/<project>` exists after the
    first `nx run <pkg>:test`.

Secondary watch items: eslint file-list drift (timestamp backstop and
no-unbounded-io lists silently match nothing after moves — add the path updates
to each extraction's checklist); `lint/catalog/workspace-fixtures/
fixture-state.ts` importing WS `/testing` from production-adjacent lint code
(verify test-only before step 3); `smol-toml` devDep→dep correction riding the
XW extraction; `agent-capabilities/data` orphan check before step 4.
