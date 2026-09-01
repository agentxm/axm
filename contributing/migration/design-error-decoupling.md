# Design 3e — Decoupling `app-error` from kernel/integration/feature-destined modules

Read-only analysis of `/home/exedev/Code/agentxm/wt/axm-pkg-arch` (branch under CI; no edits made).
Target constraint (docs/architecture/package-architecture.md:233,243): lower packages never import
`AppError`; features return typed failures; `axm.sh` owns mapping typed failures to `AppError`,
exit codes, and output.

---

## 1. Inventory

### 1.1 Headline numbers

- 157 non-test files in `packages/extension-management/src` import `app-error` (198 incl. tests).
- 103 non-test files in `packages/cli/src` import it (121 incl. tests) — legal in the target
  (the CLI owns it), so the decoupling problem is the 157, minus the CLI-destined modules.
- 1 specification imports it: `specifications/cli/exit-codes-match-published-reference.spec.ts`
  (imports `ExitCodeDefinitions` — stays legal; app-error becomes a CLI-package export).
- Import surface is almost entirely the barrel: 190 imports of `app-error/index.js`, 7 of
  `app-error.js`, 6 of `app-error/conversions.js`, 2 of `app-error/secret-redaction.js`.

### 1.2 Per-module inventory (non-test files / `makeAppError` call sites / code vocabulary used)

Destination key: **KS** = workspace-state, **KO** = workspace-operations, **KE** = extension-workspace,
**IS** = extension-sources, **IA** = agent-integration, **IR** = registry-client, **F** = feature,
**CLI** = axm.sh (allowed to keep AppError).

| Module                                                                  | Dest              | Files | Call sites | Codes used                                                              | Dominant patterns                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------- | ----- | ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workspace                                                               | KS/KO             | 23    | 94         | internal 44, validation 31, not_found 8, conflict 7, usage 1, network 1 | `Effect.mapError(makeAppError)` IO wraps; **`WorkspaceService` interface types nearly every method `Effect<_, AppError>`** (service-interface.ts:283–483); `restorationIncompleteToAppError` conversion precedent (transaction.ts:125); code-branching `error.code === "validation"` (service.ts:438)                     |
| source-resolution                                                       | IS                | 31    | 94         | validation 68, network 12, not_found 6, internal 5, conflict 3          | construction as Effect failure in parse/resolve; `failure.code === "not_found"` fallback branch (resolve-identifier.ts:433, providers/registry/host-provider.ts:331)                                                                                                                                                      |
| extensions                                                              | KE                | 10    | 56         | internal 25, validation 21, conflict 7                                  | IO/materialization wraps; `cause instanceof AppError ? cause : wrap` (import-native-package.ts:43)                                                                                                                                                                                                                        |
| packs                                                                   | KE+F              | 8     | 54         | validation 19, conflict 13, internal 11, usage 6                        | construction; `recover:`/`cmd:` suggestions in operations                                                                                                                                                                                                                                                                 |
| auth                                                                    | F (registry-auth) | 11    | 48         | auth 35, auth_expired 4, validation 3, conflict 3, auth_denied 2, …     | richest metadata: `status: "pending-human"`, `blockedOn`, `action` (open-url), `recover:` ×5 in auth-client.ts; uses `errAuthRequired`/`errAuthTokenRequired` builders                                                                                                                                                    |
| mcps                                                                    | KE+F              | 8     | 48         | internal 16, conflict 13, validation 11, usage 3, not_found 5           | construction; `error instanceof AppError` passthrough (config-writer.ts:299)                                                                                                                                                                                                                                              |
| registry                                                                | IR                | 12    | 44         | internal 22, validation 9, network 4, …                                 | **problem-details→AppError translation with request/response/requestPolicy metadata + registry-supplied suggestions** (translate.ts, failure-mapping.ts:94)                                                                                                                                                               |
| agents                                                                  | IA                | 8     | 43         | internal 27, validation 8, conflict 8                                   | IO wraps around native-surface writes                                                                                                                                                                                                                                                                                     |
| knowledge                                                               | KE (manager)      | 3     | 29         | validation 12, internal 11, unavailable 3                               | construction; `cause instanceof AppError` (manager.ts:470)                                                                                                                                                                                                                                                                |
| skills                                                                  | KE+F              | 8     | 28         | internal 11, validation 11                                              | ops construction; imports `errInstallFailed`                                                                                                                                                                                                                                                                              |
| hooks                                                                   | KE                | 3     | 28         | validation 20, internal 8                                               | construction                                                                                                                                                                                                                                                                                                              |
| subagents                                                               | KE                | 3     | 25         | internal 14, validation 7                                               | construction; `subagentContentErrorToAppError` conversion consumer                                                                                                                                                                                                                                                        |
| utils                                                                   | (splits)          | 4     | 13         | internal 12                                                             | atomic-write/IO helpers taking `mapError` callbacks                                                                                                                                                                                                                                                                       |
| version-resolution                                                      | CLI               | 1     | 13         | mixed                                                                   | stays with app-error — no work                                                                                                                                                                                                                                                                                            |
| plan                                                                    | KO                | 5     | 11         | conflict 5, internal 4                                                  | **structural embedding: `JobStepResult.error: AppError`, step `run: Effect<_, AppError, R>` (plan.ts:196,214,226); `PlanRiskCondition.blocked.errorCode: AppErrorCodeSchema` (plan.ts:83); stale-candidate detected by `failure.code === "conflict" && failure.detail === STALE_CANDIDATE_DETAIL` (resolve-plan.ts:862)** |
| projection                                                              | KE                | 4     | 10         | conflict 4, validation 3, internal 3                                    | construction                                                                                                                                                                                                                                                                                                              |
| lockfile                                                                | KS                | 2     | 9          | validation 6, internal 3                                                | construction as Effect failure                                                                                                                                                                                                                                                                                            |
| rules                                                                   | KE                | 1     | 9          | validation 6, internal 3                                                | construction                                                                                                                                                                                                                                                                                                              |
| sources                                                                 | IS                | 3     | 6          | conflict 3, validation 2                                                | construction                                                                                                                                                                                                                                                                                                              |
| settings                                                                | KS                | 1     | 3          | internal 3                                                              | `Effect.mapError` IO wraps (settings.ts:190,201,270)                                                                                                                                                                                                                                                                      |
| install-meta, git, discover, publish, lint, workflows, cli-*, telemetry | mixed             | ~14   | ~12        | —                                                                       | lint imports only `type AppError` (workspace-context.ts:69); workflows constructs a few; cli-* are CLI-destined                                                                                                                                                                                                           |
| schema, toml, yaml, extension-types                                     | KS/KE             | 0     | 0          | —                                                                       | **already clean**                                                                                                                                                                                                                                                                                                         |

Symbol demand (global): `makeAppError` 152 imports, `type AppError` 81, `AppError` (value, for
`instanceof`/catch) 43, `ExitCode` 8, redaction helpers 12 (all in CLI-destined modules except
`cli-renderer`), `exitCodeFor` 4, err* builders 6, conversions 5. Outside CLI-destined modules the
demand is essentially only: construct, type the channel, and occasionally inspect `.code`/`instanceof`.

### 1.3 Dominant usage patterns (ranked by frequency)

1. **IO/decode wrap**: `Effect.mapError((cause) => makeAppError({ code: "internal"|"validation", detail, cause }))`.
   ~60% of sites. Detail strings are simple templates over local facts (paths, names).
2. **Typed-channel annotation**: `Effect<_, AppError>` on service interfaces and helpers
   (workspace service-interface is the biggest single surface).
3. **Guard/validation failure with suggestion**: `makeAppError({ code: "validation"|"conflict", detail, recover, cmd })`
   — ~30 sites carry `recover:`/`suggestions:` composed from feature context (auth 8, registry 7,
   workspace 5, packs 4, mcps 3, source-resolution 3, skills 2, …).
4. **Structural embedding** in plan data (`JobStepResult.error`) and serialized schemas
   (`PlanRiskCondition.errorCode`, CLI machine-output unit `code`/`causeCode` fields reading
   `unit.error.code` — packages/cli/src/operation-output.ts:456–479).
5. **Behavioral inspection**: `instanceof AppError` passthroughs and `.code ===` branches
   (7 non-CLI sites, listed in §6 — the riskiest conversions).

---

## 2. The `app-error` module and today's CLI boundary

`packages/extension-management/src/unstable/app-error/`:

- **`app-error.ts`** — `ExitCode` (0–16 + reserved), `ExitCodeDefinitions` (canonical published
  meanings; pinned by the exit-codes spec), 16-value snake_case `AppErrorCode` vocabulary 1:1 with
  exit codes via `exitCodeFor`, `AppErrorCodeSchema` (`Schema.Literals`), per-code default
  titles/details/suggestions (`defaultTitleFor`/`defaultDetailFor`/`defaultSuggestionsFor` +
  `effectiveSuggestionsFor`), `errorClassForAppErrorCode` (internal/user/external — telemetry),
  `AppErrorMetadata` (request/response/requestPolicy — registry transport shaped),
  `AppErrorAction` (open-url device-flow action), and `AppError extends Data.TaggedError` with
  `{ code, title, detail, metadata?, status?, retryable?, blockedOn?, action?, suggestions?, cause }`.
  `makeAppError` fills defaults and folds `recover`/`cmd` sugar into `suggestions`.
- **`builders.ts`** — five semantic builders (`errAuthRequired`, `errAuthTokenRequired`,
  `errPublishConflict`, `errInstallFailed`, `errRegistryPublishRejected`) plus the `BC`
  suggestion sugar. Suggestion text (login command, token URL) lives here.
- **`conversions.ts`** — the existing precedent: `fqnInvalidErrorToAppError`,
  `frontmatterParseFailureToAppError`, `subagentContentErrorToAppError` translate contract-package
  tagged errors (`FqnInvalidError` from extension-model, `FrontmatterParseFailure`/
  `SubagentContentError` from registry-protocol) into AppError **at the app-error layer**, keeping
  the contract packages free of CLI error concerns. This is exactly the pattern to scale up.
- **`render.ts` / `cause-chain.ts` / `secret-redaction.ts`** — human rendering (`Next:` block),
  serialized cause chains, and secret redaction. Only CLI-destined modules import these.

CLI boundary today (`cli-runtime/handle-error.ts`): `classifyError` branches on
`isEffectCliExit` → `instanceof AppError` (→ `exitCodeFor(code)` + `renderAppErrorChannels`)
→ `CliError` (usage) → wrap-anything-else as `internal`. `renderAppErrorChannels` is the single
source for text-vs-json channel output; the JSON envelope (`cli-runtime/json-envelope.ts`,
`JsonErrorEnvelopeSchema`) serializes code/title/detail/cause/metadata/status/retryable/
blockedOn/action/suggestions with redaction. Machine operation output additionally reads
`unit.error.code` and `serializeErrorCauseChain(unit.error.cause)` per unit
(packages/cli/src/operation-output.ts:456–479) and its unit schema uses `AppErrorCodeSchema`.

Also relevant: typed-error precedents already inside the tree —
`workspace/read-model/errors.ts` (per-source `SettingsIoError/ParseError/DecodeError`,
`Lockfile*`, unions `SettingsReadError`/`LockfileReadError`) converted at the service boundary by
`contextCellErrorToAppError` (workspace/service.ts:448–454), and
`WorkspaceRestorationIncomplete` (transaction.ts:96) with `restorationIncompleteToAppError` and
`surfaceRestorationIncomplete` beside it. The design below generalizes what these already do.

---

## 3. Target error architecture

### 3.1 Ownership rules

1. **Each kernel/integration/feature package owns a tagged-error family** in an `errors.ts` beside
   its operations (module-level `errors.ts` files now; they become part of the package root export
   at extraction). Errors are `Schema.TaggedError` (Effect v4) when they must serialize (anything
   that can appear inside plan/step data or machine output) and `Data.TaggedError` when they are
   channel-only. Fields are **domain facts**, not presentation: `path`, `name`, `version`,
   `expected`, `actual`, `issues`, `cause`.
2. **Error unions compose upward through `E`**: kernels export unions
   (`SettingsError = SettingsIoError | SettingsWriteError | …`); features union what they surface
   (`InstallError = SourceResolutionError | LockfileError | MaterializationError | …`) and keep
   them in the Effect error channel through orchestration (per repo Effect rules: never `orDie`
   expected failures). A feature does not re-wrap a kernel error it merely propagates; it wraps
   only when it adds decision context.
3. **The CLI owns the AppError envelope**: code→exit-code mapping, default titles/details,
   redaction, human and machine rendering, and the conversion from every package's error union to
   AppError. `AppError`, `ExitCode`, render/redaction all move to `axm.sh` with the rest of the
   CLI-destined modules.
4. **User-facing hint text tiering** (resolves the "recovery hints need feature knowledge" tension):
   - **Tier 1 — CLI defaults**: per-code defaults stay in app-error (unchanged).
   - **Tier 2 — conversion templates (the default home for today's `recover:`/`suggestions:`
     text)**: the per-package conversion module in the CLI renders suggestions from the error's
     typed fields (e.g. `LockfileValidationError.path` → "Delete axm-lock.yaml and re-run axm sync").
     Most of the ~30 in-module suggestion sites become this.
   - **Tier 3 — error-carried display data**: allowed only where the text/action is produced by
     runtime knowledge the CLI cannot reconstruct from fields: device-flow verification
     URL/code/expiry (typed fields on `DeviceAuthorizationPending`, rendered by the CLI into the
     `action`/`suggestions` shapes), registry problem-details-supplied suggestions (already
     external display data; carried as `ReadonlyArray<SuggestedAction>`), snapshot-dir recovery
     paths. This is legitimate because **`SuggestedAction` is a contract type in
     `@agentxm/registry-protocol/unstable/suggested-action`** — below every layer — and there is
     precedent (`SubagentContentError.detail/suggestion` in registry-protocol). Rule of thumb:
     carry _facts and externally-supplied display data_; never carry AppError codes, titles, or
     exit semantics.
5. **The snake_case category vocabulary is split from AppError.** `PlanRiskCondition.blocked.errorCode`
   and step-failure categories are part of serialized plan/machine data, so the kernel needs the
   vocabulary without the envelope. `workspace-operations` owns
   `OperationErrorCategory` (`Schema.Literals` over the identical 16 strings, or the subset the
   kernel can emit) and the CLI asserts at compile time that every category is an `AppErrorCode`
   (`satisfies`-check in the conversion module). Identical strings ⇒ byte-identical machine output.

### 3.2 The plan/step-result decoupling (the one structural change)

`JobStepResult.error: AppError` and `run: Effect<_, AppError, R>` make the kernel define feature
error types. Making `Plan` generic in `E` was considered and rejected: the generic would thread
through `Plan`, jobs, steps, journals, outcomes, operation-resolution, and every feature handler,
and machine output needs one uniform serialized shape anyway. Instead, `workspace-operations` owns
a serializable step failure:

```ts
// plan/errors.ts  (→ @agentxm/workspace-operations)
export class StepFailure extends Schema.TaggedError("StepFailure")<{
  readonly category: OperationErrorCategory; // same strings as AppErrorCode
  readonly detail: string; // user-facing sentence, owned by the step author
  readonly suggestions?: ReadonlyArray<SuggestedAction>; // Tier-3 only
  readonly cause?: unknown; // typed feature error or raw cause
}> {}
```

- Steps become `run: Effect<JobStepResult<Output>, StepFailure, R>`; `JobStepResult.error: StepFailure`.
- Feature operation handlers construct `StepFailure` from their own typed errors (they own the
  category choice and detail sentence — matching today, where the same feature code chose the
  AppError code and detail; strings preserved verbatim).
- The CLI reads `unit.error.category` where it read `unit.error.code` and keeps
  `serializeErrorCauseChain(unit.error.cause)`; the machine-output unit schema keeps the same
  literal set. Terminal failures pass through `stepFailureToAppError` (a 1:1 field map), so
  envelope, exit code, and suggestions are unchanged.
- The stale-candidate string sniff (resolve-plan.ts:862) is replaced by a dedicated
  `StaleExecutionCandidate` tagged error, with its conversion producing exactly
  `code: "conflict", detail: STALE_CANDIDATE_DETAIL` for output parity.

### 3.3 One conversion pattern

**A single dispatcher at the CLI boundary, built from per-package conversion modules that live
with app-error** (today `app-error/conversions/<package>.ts` beside the existing `conversions.ts`;
they travel to `axm.sh` when app-error moves — the doc's "CLI-local … error mapping stays in the
application package"). Not per-feature modules scattered in command handlers, and not methods on
the errors themselves.

```ts
// app-error/conversions/workspace-state.ts
export const settingsWriteErrorToAppError = (e: SettingsWriteError): AppError => …;
export const workspaceStateErrorToAppError = Match.type<WorkspaceStateError>().pipe(
  Match.tagsExhaustive({ SettingsIoError: …, SettingsWriteError: …, LockfileValidationError: …, … }),
);

// app-error/conversions/index.ts — the one dispatcher
export const toAppError = (error: KnownFailure): AppError => …tag-dispatch…;
// KnownFailure = union of every package's exported error union; exhaustive Match keeps it honest.
```

Usage sites of the dispatcher, in order of preference:

1. **`classifyError`** gains one branch before the `instanceof AppError` check:
   `if (isKnownFailure(error)) return classify(toAppError(error))`. This is the terminal safety
   net and makes "handler forgot to map" produce correct output instead of exit 10.
2. **Command handlers** map at their boundary (`Effect.mapError(toAppError)`) when they need an
   `AppError` channel for existing plumbing; during migration this is also the compatibility shim
   inside not-yet-decoupled callers (§4).
3. **Never inside kernels/integrations/features** — after a module's wave, it imports neither
   `AppError` nor the conversions.

Existing `errAuth*`/`errPublishConflict`/`errInstallFailed` builders dissolve: their call sites
fail with typed errors (`AuthTokenMissing`, `PublishVersionConflict`, `InstallValidationFailed`)
and the builders' bodies become the conversion-module templates, preserving text.

---

## 4. Feasibility of the cheaper intermediate: waves scheduled per extraction stage

Correct premise: while every module lives inside `@agentxm/extension-management`, an app-error
import violates nothing enforceable — the boundary only exists once a module is extracted
(`@nx/enforce-module-boundaries` + package `exports` then reject it mechanically). Therefore:

- **No big-bang decoupling.** Each wave decouples exactly the modules the next extraction stage
  (migration shape steps 3→6, package-architecture.md:627) will move, immediately before that
  extraction.
- **Green invariant per wave**: a wave changes module X's failure types; every still-coupled
  caller of X (living in the same package) appends `Effect.mapError(toAppError)` (or widens its
  channel to `AppError | XError` where it just propagates) at the exact call sites; the CLI
  dispatcher already knows X's union. Typecheck forces visiting every caller; output is preserved
  because conversions reproduce today's strings. Later waves then delete those interim `mapError`s
  as the callers get their own typed errors.
- **Cost ordering works in our favor**: the kernel-destined modules (wave 1) have the highest
  fan-in, and their consumers are exactly the feature/CLI modules that remain coupled until later
  waves — so the interim-shim trick is always available.

### Wave plan (each wave = one or a few PRs, repo green throughout)

**Wave 0 — enablers (before any decoupling; small, pure-additive).**

1. Add `OperationErrorCategory` in `plan/` (identical literals; `satisfies` parity check against
   `AppErrorCodes` living beside the CLI conversion).
2. Add `app-error/conversions/` directory convention + `toAppError` dispatcher + `isKnownFailure`,
   seeded with the three existing conversions and `restorationIncompleteToAppError` /
   `contextCellErrorToAppError` relocated/registered.
3. Add the `classifyError` known-failure branch + tests mirroring `handle-error.internal.test.ts`.
4. Blast radius: ~8 files, no behavior change (nothing fails with typed errors at the top yet).

**Wave 1 — kernel-destined modules (before extraction step 3: workspace-state,
workspace-operations, extension-workspace).** Modules: schema, settings, lockfile, plan,
workspace (incl. transaction), extensions, projection, hooks, rules, subagents, mcps (manager/
config-writer/inspection), skills (manager/materialization/candidate), packs (manager/expansion/
dependency-resolution/resolved-dependency), knowledge (manager/discovery/package-inspection),
toml, yaml, extension-types. schema/toml/yaml/extension-types are already clean. Detailed design in §5.

**Wave 2 — integration-destined modules (before extraction step 4).**

- `sources`, `source-resolution`, `git` → `SourceError` family (`SourceSyntaxInvalid`,
  `SourceNotResolvable`, `SourceHostNotConfigured`, `GitOperationFailed`, `SourceNetworkFailure`
  with retry facts). Replace the two `.code === "not_found"` fallback branches with tag checks.
- `agents` → `AgentIntegrationError` family (`AgentSurfaceWriteFailed`, `AgentConfigInvalid`, …).
- `registry` → `RegistryClientError` family: `RegistryRequestFailed` carrying the **entire current
  `AppErrorMetadata` shape as typed fields** (request/response/requestPolicy — the shape is
  registry-born anyway; it stays in the integration and the CLI conversion copies it into
  `AppError.metadata` verbatim), plus `RegistryProblem` carrying problem-details-derived
  category/detail/suggestions (Tier 3). `translate.ts` stops emitting AppError and emits these;
  `httpStatusToAppCode` becomes `httpStatusToCategory` over `OperationErrorCategory`.
- Blast radius: ~54 module files + ~25 caller files (workflows, publish, discover, lifecycle ops,
  CLI commands) get interim `mapError(toAppError)`.

**Wave 3 — feature-destined modules (before extraction steps 5–6, per feature slice).**

- Per-slice: lint (1 file — swap the two `AppError` type annotations for the workspace-state
  unions; nearly free), workflows + `*/operations/*` files (extension-lifecycle), publish,
  discover, auth (registry-auth — `AuthError` family with `DeviceAuthorizationPending`
  carrying typed `verificationUrl/userCode/expiresAt/resume` fields that the conversion renders
  into today's `action`+`suggestions`), knowledge query side.
- After wave 3 each feature exports its typed failure union; command handlers in `axm.sh` map via
  the dispatcher. Interim `mapError` shims from waves 1–2 inside these modules are deleted here.
- Blast radius: ~45 module files + the ~100 CLI files already importing app-error keep working
  unchanged (they already live at the boundary that owns it).

**Wave 4 — none.** `app-error`, `cli-*`, `telemetry`, `install-meta`, `install-method`,
`update-check`, `version-resolution`, `branding` move into `axm.sh` with app-error; their imports
are legal. `utils` splits: its `mapError`-callback helpers (writeFileAtomic etc.) are already
error-agnostic (caller supplies the mapper) — they just stop defaulting to AppError.

---

## 5. Wave 1 concrete design

### 5.1 New error modules

| File (today)                                                                                                    | Family (→ package)                                          | Members (representative)                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace/read-model/errors.ts` (exists; extend)                                                               | `WorkspaceStateError` (→ workspace-state)                   | existing `Settings*`/`Lockfile*` read errors + new `SettingsWriteError { path, step: "mkdir"\|"encode"\|"write"\|"rename", cause }`, `LockfileWriteError`, `LockfileValidationError { path, issues }`, `WorkspaceLayoutError`, `WorkspaceNotInitialized { dir }`, `LockedEntryInvalid { name, reason }` |
| `plan/errors.ts` (new)                                                                                          | `PlanError` (→ workspace-operations)                        | `OperationErrorCategory` + `StepFailure` (§3.2), `StaleExecutionCandidate`, `CandidateFingerprintFailed { target, cause }`, `PlanReadinessBlocked`                                                                                                                                                      |
| `workspace/transaction.ts` (extend in place)                                                                    | (→ workspace-operations)                                    | keep `WorkspaceRestorationIncomplete`; add `WorkspaceTransactionFailed { phase, detail, cause }` replacing the internal `transactionError` helper; `TransitionLockUnavailable`                                                                                                                          |
| `extensions/errors.ts` (new)                                                                                    | `ExtensionWorkspaceError` (→ extension-workspace)           | `PackageMaterializationFailed { fqn?, path, cause }`, `MaterializedTreeInvalid`, `NativeImportFailed`, `CreatePreflightFailed { reason }`                                                                                                                                                               |
| `projection/errors.ts`, `hooks/errors.ts`, `rules/errors.ts`, `subagents/errors.ts` (new)                       | folded into `ExtensionWorkspaceError` union at package root | `ProjectionConflict { path, owner }`, `ManagedRegionViolation`, `HookDefinitionInvalid { name, issues }`, `RuleDefinitionInvalid`, `SubagentDefinitionInvalid`                                                                                                                                          |
| `mcps/errors.ts`, `skills/errors.ts`, `packs/errors.ts`, `knowledge/errors.ts` (new; manager-side members only) | ditto                                                       | `McpConfigWriteFailed`, `SkillMaterializationFailed`, `PackDependencyCycle { chain }`, `PackMemberMissing`, `KnowledgeIndexUnavailable`                                                                                                                                                                 |

Granularity rule: one tagged error per _distinct caller decision or distinct user message_, not per
`makeAppError` call site. The 44 `internal` IO wraps in workspace collapse into ~6 IO-shaped errors
parameterized by path/step; the conversion reproduces each site's detail template from fields. Where
a today-string interpolates something not worth a field, keep a `detail: string` field populated by
the kernel (Tier-3-lite: a fact-sentence, no code/title/exit semantics) — used sparingly, it keeps
byte-for-byte parity cheap without exploding the taxonomy.

New conversion modules: `app-error/conversions/workspace-state.ts`,
`app-error/conversions/workspace-operations.ts`, `app-error/conversions/extension-workspace.ts`,
each exporting per-tag converters + a `Match.tagsExhaustive` union converter, registered in the
wave-0 dispatcher.

### 5.2 `WorkspaceService` interface retyping

`workspace/service-interface.ts` is the single highest-leverage edit: ~40 method signatures move
from `Effect<_, AppError>` to precise unions (`Effect<LockfileState, LockfileReadError>`,
`Effect<void, SettingsWriteError | WorkspaceLayoutError>`, …). Its ~40 consumer files are
feature/CLI-destined and still co-resident: each call site appends `Effect.mapError(toAppError)`
(or nothing, where the caller only `Effect.orDie`s / already handles). The
`runExclusive`-style combinators keep `E` generic (they already do:
service-interface.ts:190 threads `E`).

### 5.3 Before/after sketches

**(a) Settings write failure** — `settings/settings.ts:188–196` (today):

```ts
yield *
  fs
    .makeDirectory(settingsDir, { recursive: true })
    .pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create directory: ${settingsDir}`,
          cause: error,
        }),
      ),
    );
```

After (kernel):

```ts
// settings/errors.ts (→ workspace-state root)
export class SettingsWriteError extends Schema.TaggedError("SettingsWriteError")<{
  readonly path: string;
  readonly step: "mkdir" | "encode" | "write-temp" | "rename";
  readonly cause: unknown;
}> {}

// settings/settings.ts
yield *
  fs
    .makeDirectory(settingsDir, { recursive: true })
    .pipe(
      Effect.mapError(
        (cause) => new SettingsWriteError({ path: settingsDir, step: "mkdir", cause }),
      ),
    );
```

CLI conversion (`app-error/conversions/workspace-state.ts`), preserving each site's exact string:

```ts
export const settingsWriteErrorToAppError = (e: SettingsWriteError): AppError =>
  makeAppError({
    code: "internal",
    detail: Match.value(e.step).pipe(
      Match.when("mkdir", () => `Failed to create directory: ${e.path}`),
      Match.when("encode", () => `Failed to encode settings: ${causeMessage(e.cause)}`),
      Match.when("write-temp", () => `Failed to write settings temp file: ${e.path}`),
      Match.when("rename", () => `Failed to atomically replace settings file: ${e.path}`),
      Match.exhaustive,
    ),
    cause: e.cause,
  });
```

(The `writeFileAtomic` helper in `utils` already takes a `mapError` callback — the kernel passes a
`SettingsWriteError` constructor instead of `makeAppError`; the temp-path vs target-path distinction
becomes the `step` field, keeping both today's messages reproducible.)

**(b) Lockfile validation/commit conflict** — `lockfile/lockfile.ts` decode/validation sites
(`code: "validation"`) and the transaction conflict path:

```ts
// before (lockfile.ts:167ff)
Effect.mapError((error) => makeAppError({ code: "validation", detail: `Invalid lockfile at ${lockPath}: ${…}`, cause: error }))
// after
Effect.mapError((cause) => new LockfileValidationError({ path: lockPath, issues: issuesOf(cause), cause }))
```

Downstream branch fix, `workspace/service.ts:438` (today sniffs the AppError code):

```ts
// before:  if (error.code === "validation") return Effect.succeed("invalid" as const);
// after:
Effect.catchTag("LockfileValidationError", () => Effect.succeed("invalid" as const));
```

Conversion emits `code: "validation"` with the same detail template. The restoration-conflict path
already has the typed error; `restorationIncompleteToAppError` moves into
`conversions/workspace-operations.ts` unchanged (same strings, incl. snapshot-dir suggestion —
Tier 3 via the `snapshotDir` field), and `surfaceRestorationIncomplete` (transaction.ts:151)
is deleted; callers keep `WorkspaceRestorationIncomplete` in `E` and the CLI converts.

**(c) Plan readiness / stale candidate** — `plan/apply-plan.ts:143,162` and
`resolve-plan.ts:489–499,862`:

```ts
// before (apply-plan.ts)
error: makeAppError({ code: "conflict", detail: message }),
// after
error: new StepFailure({ category: "conflict", detail: message }),

// before (resolve-plan.ts stale detection)
const staleCandidate = failure.code === "conflict" && failure.detail === STALE_CANDIDATE_DETAIL;
// after — resolve-plan fails/marks with the dedicated error:
return yield* new StaleExecutionCandidate({ candidate: candidatePlan.name });
…
const staleCandidate = failure._tag === "StaleExecutionCandidate";
```

Conversion: `staleExecutionCandidateToAppError` returns
`makeAppError({ code: "conflict", detail: STALE_CANDIDATE_DETAIL })` — the constant moves next to
the error, output byte-identical. `PlanRiskConditionSchema.blocked.errorCode` switches to
`OperationErrorCategorySchema` (identical literal set ⇒ identical serialized JSON);
`packages/cli/src/operation-output.ts` keeps its own `AppErrorCodeSchema` fields and reads
`unit.error.category` — with the parity `satisfies` check making divergence a compile error.

### 5.4 Keeping the pinned specs and tests green

- `specifications/cli/exit-codes-match-published-reference.spec.ts` — reads `ExitCodeDefinitions`
  - the help topic only. Untouched by wave 1 (and stays valid through the app-error move to
    `axm.sh`, updating only its import path at that extraction).
- `specifications/cli/machine-errors-use-the-stable-envelope.spec.ts` — drives `handleInstall` and
  `classifyError(failure, "json")`. The install handler sits in the CLI layer; after wave 1/2 its
  failure is either already an AppError (handler-mapped) or a known typed failure that
  `classifyError`'s wave-0 branch converts. Envelope schema untouched. Add one spec-adjacent unit
  test asserting `classifyError(new SourceNotResolvable(…), "json")` produces the same envelope as
  today's `makeAppError` equivalent (golden-pair test) to pin the dispatcher.
- `cli-runtime/handle-error.internal.test.ts`, `json-envelope.internal.test.ts`,
  `machine-output-document.internal.test.ts`, `packages/cli/src/machine-output-contracts.*` — all
  operate on AppError/envelopes at the CLI layer; unchanged in wave 1 except
  operation-output's `unit.error.code` → `unit.error.category` rename with same values.
- Module internal tests that assert `makeAppError` failures (e.g.
  `workspace/transaction.internal.test.ts`, `auth/*.internal.test.ts`) are updated in the same
  wave to assert the typed error tags/fields instead — strictly stronger assertions; the
  string-level pinning migrates to conversion-module tests (one table-driven test per conversion
  module asserting exact code/detail/suggestions per tag ⇒ the byte-for-byte contract lives in
  one reviewable place).

### 5.5 Wave-1 execution order (each step green)

1. `plan/errors.ts` + `StepFailure` + retype `JobStepResult`/steps + `operation-resolution`/
   `apply-plan`/CLI operation-output rename (one PR; largest single step, ~25 files).
2. `workspace-state` families: settings, lockfile, locked-entries, layout, read-model extension +
   `WorkspaceService` interface retyping + interim `mapError(toAppError)` in consumers (~45 files).
3. transaction/transition-lock typed errors (~6 files).
4. extension-workspace families module-by-module (extensions → projection → hooks/rules/subagents
   → mcps/skills/packs managers → knowledge manager), ~5–12 files each, independent PRs.

---

## 6. Blast radius and risk register

| Wave | Module files touched                                             | Consumer files touched (interim shims/signature ripples)                | Test files | Total est. |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- | ---------- |
| 0    | ~8 new/edited                                                    | 0                                                                       | ~3         | ~11        |
| 1    | ~66 (kernel modules non-test importers) + ~10 clean-module edits | ~45 (workspace-service consumers, plan consumers, CLI operation-output) | ~35        | **~150**   |
| 2    | ~54                                                              | ~25                                                                     | ~25        | **~105**   |
| 3    | ~45                                                              | ~15 (CLI handlers swap to dispatcher; delete interim shims)             | ~20        | **~80**    |
| 4    | 0 (moves happen as part of extractions)                          | —                                                                       | —          | —          |

Riskiest conversions (rich context constructed deep, or behavior keyed on AppError shape):

1. **`registry/translate.ts` + `failure-mapping.ts` (wave 2)** — builds AppError with full
   request/response/requestPolicy metadata, retry-after suggestions, and registry-problem-supplied
   suggestion arrays, deep inside transport code. Mitigation: the typed `RegistryRequestFailed`
   carries the metadata shape 1:1 (it is registry-born data, not CLI presentation), conversion is a
   field copy; golden-pair tests over recorded problem-details fixtures.
2. **Auth device/loopback flows (wave 3)** — `status: "pending-human"`, `blockedOn`, `action`
   (open-url with code/expiry/resume), agent-oriented suggestions built mid-flow
   (auth-client.ts ×5 `recover:`). These fields drive agent automation, not just text. Mitigation:
   `DeviceAuthorizationPending` carries every action field typed; conversion emits identical
   envelope; the existing auth internal tests already assert envelope fields.
3. **Plan step-failure rework (wave 1 step 1)** — structural change to serialized data consumed by
   machine-output contracts and Allure-visible journals; the `category` parity check plus
   `machine-output-contracts.internal.test.ts` are the guardrails.
4. **Code-sniffing branches** — service.ts:438, resolve-plan.ts:862, resolve-identifier.ts:433,
   host-provider.ts:331, plus `instanceof AppError` passthroughs (config-writer.ts:299,
   import-native-package.ts:43, knowledge/manager.ts:470, registry/failure-mapping.ts:94,
   transaction.ts:113 `firstCauseLine`). Each is a behavior dependency that must become a tag
   check in the same PR as its producer's retyping — flagged individually for implementers; a
   repo-wide grep for `\.code ===` and `instanceof AppError` outside CLI-destined modules is the
   wave exit criterion.
5. **Detail-string parity at ~720 `makeAppError` sites** — mechanical but voluminous. Mitigation:
   collapse per §5.1 granularity rule; table-driven conversion tests; where a string is
   genuinely one-off, the fact-sentence `detail` field carries it verbatim from the kernel.

Open items for the implementing agents (decided here, listed for visibility):

- `utils` split: atomic-write helpers stay error-generic (caller-supplied mapper) — no `utils`
  error family needed.
- `test-helpers.ts` at unstable root imports AppError for assertions; it follows the CLI-destined
  set (test support for the boundary), not a wave-1 item.
- `errorClassForAppErrorCode` (telemetry classification) stays CLI-side; telemetry is CLI-destined.
- The `cli-renderer` import of `redactSensitiveValue` is CLI-destined; no action.
