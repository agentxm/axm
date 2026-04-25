## Table of Contents

- Context
- Goals / Non-Goals
- Architecture Overview
- Decisions
  1. Cell shape: per-source tagged errors
  2. Source independence as a tested invariant
  3. Scope-first API with subject namespaces
  4. Single `WorkspaceContext`, subject-specific extension APIs
  5. Scanner functions with subject-specific origins; no probe registry
  6. Caching strategy: `Effect.cached` everywhere
  7. Projection taxonomy: raw evidence first, composed views second
  8. WorkspaceContext is the primary CLI read model
  9. Read-model rows wrap evidence and specialize facts
  10. Vocabulary alignment with ontology
- API Sketch
- Risks / Trade-offs
- Migration Plan

## Context

The axm CLI exposes one heavy workspace gateway today (`packages/core/src/unstable/workspace/service.ts`, ~1.6k LOC) that mixes settings/lockfile I/O, mutation serialization via `Semaphore(1)`, source-metadata derivation, and classifier upstream assembly. That service is consumed directly by the install/update/prune/outdated handlers, and indirectly by the lint handler through a parallel `buildIndexFromLockfile` helper that derives a `WorkspaceIndex` purely from the lockfile.

Three independent state surfaces feed all of this:

- **Declared** — `settings.json` at project (`.axm/settings.json`) and user (`~/.axm/settings.json` or `$AXM_USER_HOME`) scope; carries the user's intent: managed agents, direct extension declarations per type, disabled flags, ignored patterns, source-host configs, lint rule overrides, identity profile.
- **Resolved** — `axm-lock.yaml` at project scope; carries the locked names per extension type, integrity hashes for native installs, and per-pack resolved-extension maps. Lockfile is project-only today; a user-scope lockfile is not part of the current model.
- **Actual** — the observable runtime state of the workspace: filesystem materializations under `.axm/extensions/`, agent-rendered files in agent directories (`.claude/skills/`, `.cursor/rules/`, `.roomodes`, etc.), MCP server runtime config files (`.mcp.json` and agent-native equivalents), agent presence, and agent-native configuration files (`.claude/settings.json`, etc.).

The narrow root cause of [AXM-454](https://linear.app/agentxm/issue/AXM-454) is `buildIndexFromLockfile` in lint, which projects a `WorkspaceIndex` from the lockfile alone and returns empty when the lockfile decode fails — silently dropping every skill and pack rule's input. That helper could be fixed in an afternoon. But the _shape_ of the failure — fold a possibly-invalid source into an `Option`-shaped result, lose the distinction between Absent and Invalid, fail the entire downstream surface when one source is corrupt — is latent across `service.ts`, source-resolution discovery, and the per-type CLI handlers. The Why is to fix the class.

Stakeholders are anyone whose code reads workspace state: the lint catalogs (skill / pack / workspace), legacy classification consumers, the per-extension-type CLI handlers, the source-resolution layer's discovery probes, and `axm setup`'s agent-detection flow. The OpenSpec proposal scopes this change to architect + test only; consumer migration is sequenced as named follow-up changes.

### Vocabulary

This doc uses three terms with disjoint meaning. Future maintainers and agents should use these terms exclusively:

- **Subject** — an `ExtensionType` value (`skill`, `command`, `mcp-server`, `subagent`, `file`, `rule`, `pack`) or `agent`. Each subject has its own data model: extensions have declared/resolved/actual layers; agents have declared/actual.
- **Module** — the per-subject TypeScript module under `extensions/<type>.ts` or `agents/<id>.ts`. Owns payload types, scanner composition, and projectors for that subject.
- **Namespace** — the public surface of one subject module, exposed as a property on the scoped workspace context (e.g., `skills`, `mcpServers`, `agents`).

### Consumer use-case map

The current codebase has several overlapping read models — `taxonomy-types.ts`, `classifier-records.ts`, `skill-snapshot.ts`, `version-currency/collectors.ts`, pack operations — each reconstructing a partial view. WorkspaceContext should replace these with shared primitives plus subject-specific facts. Current consumer needs reduce to a small set of fields, which grounds the row-shape choice in Decision 9:

| Consumer family                      | Current reads                                                                                | Necessary WorkspaceContext state                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace install/update             | `getConfigured*`, `enabled`, source string                                                   | active direct declarations with `name`, raw `source`, `activation`, parsed registry constraint when available                                 |
| Enable/disable                       | `getInstalled*`, lifecycle, `enabled`, lock rendered files                                   | installed row by name with `installationOrigin`, `activation`, direct declaration evidence, resolved/rendered-file detail, actual attachments |
| List/status                          | `getInstalled*`, `getClassified*`, lock maps                                                 | installed rows plus unmanaged/ignored projections, actual occurrence summaries, degraded diagnostics                                          |
| Lint/prune unmanaged                 | `getUnmanaged*`, ignored patterns, disk discovery                                            | unmanaged actual occurrences with origins/locations and ignored candidates with reason                                                        |
| Pack install/uninstall/unpack        | `getLockedExtensionPacks`, direct declaration names, resolved member maps                    | installed packs, pack resolved member groups, direct declaration sets by subject, resolved rows for retained/orphan checks                    |
| Outdated/currency                    | `getConfigured*` + `getLocked*`, registry lock fields, enabled                               | active direct rows with raw source/constraint and registry resolved identity/version                                                          |
| Source resolution and glob expansion | lock entries, direct declaration source fallback, unmanaged/on-disk skills, ignored patterns | resolved source/path facts, direct declaration source, actual occurrence paths, ignored filtering                                             |
| New/rename/publish preflight         | direct declaration names, installed names, lock entries                                      | direct declaration lookup, installed lookup, resolved lookup, actual occurrence lookup                                                        |
| Settings/lockfile validation         | raw settings + lockfile maps, stale/orphaned detection                                       | raw `state`, declared/resolved rows, orphaned resolved diagnostics                                                                            |
| Setup/discover                       | configured agents, agent presence, agent dirs                                                | `agents.known`, `agents.declared`, `agents.actual`, `agents.detected`, and subject actual scanners                                            |

## Goals / Non-Goals

**Goals (outcome-shaped, verifiable against spec scenarios):**

- **Resilience.** Lint and prune build their input on AXM-454-style fixtures when one of `{settings.json, axm-lock.yaml}` is corrupt. Verified by spec scenarios _Installed skills survive invalid lockfile_, _Corrupt settings does not hide actual state_, _Corrupt settings does not hide lockfile state_, and the source-independence scenario tests under Decision 2.
- **Sharp failure channels.** Each cell's failure channel carries at most one tagged-error family — `SettingsReadError` (3 tags) or `LockfileReadError` (3 tags). No shared umbrella error type. Actual cells never fail.
- **Absent vs Invalid distinguishable at every source-backed cell.** Cells return `Effect<Option<T>, *ReadError>`; consumers that need the distinction reach for `Effect.result`.
- **Bounded cache footprint.** Each `WorkspaceContext` instance issues ≤ ~50 cached effects (project + user × {settings, lockfile} + statically enumerated scanners × scopes × agents × extension types). No cross-invocation persistence; cache lifetime is the layer scope.
- **Source independence enforced by the type system.** Each source loader sees only `FileSystem` / `Path`; no loader can take another source's output as input. Verified by source-independence scenario tests that mutate one source's bytes and assert the other two cells are bit-identical.
- **Single primary read model for CLI workspace state.** `WorkspaceContext` is the read-only snapshot the CLI defaults to, covering extension state, agent state, raw settings/lockfile state, source-host views, profile reads, and diagnostics.
- **Ships with comprehensive tests in this change, not as a follow-up.** Golden-fixture workspaces (Absent/Invalid combinations, cross-scope shadowing, agent presence, MCP config drift, same-name materialization across origins, path-escape attempts), source-independence scenarios, origin-tagging tests, projection tests, scanner unit tests, and `Effect.result` boundary tests all land in this change. A small fixture builder ships alongside.

**Non-Goals:**

- Migrating any existing consumer (lint, classifier upstream, prune, outdated, list, uninstall, discover, setup) — each migrates in a named follow-up change.
- Source-host resolution, registry lookups, or any network I/O in the context provider.
- A runtime probe registry or pluggable-scanner extension point — v1 composes a closed set of scanner functions; the registry is deferred to a future change if/when third-party scanners or process-level probes land.
- Process-level probes (running MCP servers, live agent sessions) — not v1.
- Per-type narrowing of the build (whole-workspace build is fine for v1; cell shape preserves room for narrowing).
- Incremental invalidation across CLI invocations — context lifetime is one CLI invocation.
- A user-scope lockfile — `ctx.scope("user").state.lockfile` SHALL return `Option.none()` until a future change introduces user-scope resolved state.
- Rewriting the existing `classifyExtensions`, `workspace/service.ts`, or any handler in this change.

## Architecture Overview

Three-layer flow per scope. Source layers are raw evidence; projections compose them with subject policy and degrade through `diagnostics` rather than failing.

```
Source layers (per scope, per source loader)
─────────────────────────────────────────────────────────────
declared          resolved          actual
settings.json     axm-lock.yaml     scanner-observed
Option<T>,        Option<T>,        T (never fails)
SettingsReadErr   LockfileReadErr

       │  Effect.cached, source-independent
       ▼

Projections (composed views; never fail; warnings → diagnostics)
─────────────────────────────────────────────────────────────
installed = direct (declared, non-ignored)
          + implicit (pack-member, non-ignored, not declared)
active    = installed where activation = enabled
unmanaged = actual − ignored − claimed-by-installed
                   − claimed-by-subject-policy
ignored   = suppressed declared / pack-member / actual

       │  per-source failure → warning, not error
       ▼

diagnostics : ReadonlyArray<Warning>
```

One `Context.Service`, one Layer; scope is a lazy selector that returns scoped namespaces.

```
WorkspaceContext   (one Context.Service, one Layer)
└─ scope(s: "project" | "user")  →  ScopedWorkspaceContext
     ├─ skills        ┐
     ├─ commands      │   ExtensionStateReader
     ├─ mcpServers    │     declared / resolved / actual
     ├─ subagents     ├─  + projections
     ├─ files         │     installed / active / unmanaged / ignored
     ├─ rules         │
     ├─ packs         ┘
     ├─ agents        →   declared(id) / actual(id) / list / known / detected
     ├─ state         →   settings / lockfile / raw(source)
     ├─ sourceHosts   →   declared / effective / registryHosts / byName
     ├─ profile       →   declared / effective
     └─ diagnostics   →   ReadonlyArray<Warning>
```

Each per-subject module composes scanners from a closed set; each occurrence carries a subject-specific detection origin owned by that module.

```
extensions/skill.ts  composes
  ├─ scanners/canonical-extensions.ts
  │    ├─ origin: canonical-axm-skill
  │    └─ origin: external-axm-skill
  └─ scanners/agent-dir.ts × {claude-code, codex, ...}
       └─ origin: agent-skill-dir(agentId)

extensions/mcp-server.ts  composes
  ├─ scanners/canonical-extensions.ts
  │    └─ origins: canonical-/external-axm-mcp-server
  ├─ scanners/mcp-config.ts  (workspace .mcp.json)
  │    └─ origin: workspace-mcp-config
  └─ scanners/mcp-config.ts × agents
       └─ origin: agent-mcp-config(agentId)
```

No shared `DetectionOrigin` union exists in v1 — each per-subject module owns the concrete origin type for its actual payload.

## Decisions

### 1. Cell shape: `Effect<Option<T>, SourceReadError>` for source-backed cells; `Effect<T>` for actual cells

Each layer has its own failure profile, and the cell signature reflects exactly that:

- **`ctx.scope(scope).skills.declared` and `ctx.scope(scope).agents.declared(id)`** read from `settings.json`. Failures are exactly `SettingsReadError = SettingsIoError | SettingsParseError | SettingsDecodeError`. Absent (file not found, or settings doesn't mention this entry) is `Option.none()` in the success channel.
- **`ctx.scope(scope).skills.resolved`** reads from `axm-lock.yaml`. Failures are exactly `LockfileReadError = LockfileIoError | LockfileParseError | LockfileDecodeError`. Absent is `Option.none()`.
- **`ctx.scope(scope).skills.actual` and `ctx.scope(scope).agents.actual(id)`** read scanner outputs. They never fail in the error channel. Workspace-root path-escape is validated once at `WorkspaceContextLive` construction; if it fails, the Layer fails with `WorkspaceRootEscape`, and per-cell `actual` calls cannot encounter it. Scanner partial failures (a single unreadable file in a scanned dir) are surfaced as warnings on the scoped diagnostics cell, not as errors.

The narrowing matters at the consumer. A lint rule keying on lockfile-invalid sees only the three `Lockfile*` tags in `Effect.result(...).failure`; a settings rule sees only the three `Settings*` tags; neither has to spell out "and the unrelated tag I'll never receive." Consumers writing resilient projections still combine both via `Effect.result` + `Effect.catchTags`, and the resulting union of "all tags I might catch" is the literal set of what the called cells emit.

There is no top-level `CellError` umbrella type. Cell signatures are the contract.

**Quality constraint:** Each cell's failure channel exposes ≤3 tagged-error tags (one `Settings*` or `Lockfile*` family). Verified by `Effect.result` boundary tests.

**Schema-valid-but-deprecated entries** keep cell payloads pure: deprecation warnings are pushed to `ctx.scope(scope).diagnostics` with `code: "deprecated-key"`, never embedded in payloads.

**Alternatives considered:**

- (a) A single `CellError` union (the prior design). Rejected: forces every consumer to pattern-match against tags it can never receive; defeats the point of using tagged errors. The prior design's `PathEscapeError` was reachable from no source-read cell, only from scanners — and even there, only as a precondition that's now lifted to provider construction.
- (b) A custom `TriState<T> = Valid | Invalid | Absent` sum type in the success channel. Rejected: replicates what Effect's two channels already provide, forces every consumer to learn the bespoke ADT, and pays a serialization cost the natural split avoids.
- (c) A single `WorkspaceState` object with all layers eagerly loaded. Rejected: re-creates the all-or-nothing failure mode this change exists to fix.

### 2. Source independence as a tested invariant

Each layer's source loader operates on its own input file (or directory tree) and produces its own typed result without consulting the other two. The `WorkspaceContext` SHALL never sequence sources behind one another, never pass another source's output as input to a loader, and never short-circuit one source based on another's failure. This invariant is enforced by the type system at the source-loader boundary (each `loadSettings` / `loadLockfile` has access only to `FileSystem` / `Path`) and verified by source-independence tests that mutate one source's bytes and assert the other two sources' cells are bit-identical to the unmutated fixture.

**Alternative considered:**

- (a) A sequenced load (settings → lockfile → actual) where each step can use earlier outputs. Rejected: it's the current model and is precisely what fails when an early step fails.

### 3. Scope-first API with subject namespaces

Extensions and agents have different data models. Extensions have all three layers (declared, resolved, actual). Agents have declared and actual only — they aren't versioned, and the rendered-files maps that the prior design surfaced under an "agent resolved" cell already live under each extension's `resolved` cell where they belong.

```ts
class WorkspaceContext extends Context.Service<
  WorkspaceContext,
  {
    readonly scope: (scope: Scope) => ScopedWorkspaceContext;
  }
>()("axm/WorkspaceContext") {}
```

A consumer asking "what did extension X render into agent Y?" walks `ctx.scope("project").skills.resolved` → `Option<ResolvedSkills>` → entry `.renderedFiles[agentId]`. A consumer asking "is claude-code declared and present?" walks `ctx.scope("project").agents.declared("claude-code")` and `ctx.scope("project").agents.actual("claude-code")`. There's no third path that pretends agents have a `resolved` layer.

`scope(scope)` is a lazy selector. It constructs or returns a scoped API object whose properties are cached `Effect` values; it MUST NOT perform filesystem I/O by itself. I/O starts only when a scoped cell effect is evaluated.

**Settings shadowing.** When the same source name is declared at both scopes, today's `Effective Source Hosts` set merges with `project > user`. There is no built-in merged view on `ctx.scope(scope).skills.declared`. The two scope reads are exposed separately; the migration target that needs the merge owns it locally. Adding a merged projection later is non-breaking.

**Alternatives considered:**

- (a) Lift `extensions` and `agents` to two sibling `Context.Service`s (`Extensions`, `Agents`). Rejected: the lifecycle, layer dependencies (`AgentRegistry`, `FileSystem`, `Path`), and provider scope are identical; splitting just doubles the registration overhead without separating any concern. Scoped namespaces give the same modular benefit at one Layer site.
- (b) Keep agents as first-class subjects with the prior design's asymmetric `(scope, resolved, <agent>)` cell. Rejected: forcing agents through an extension-shaped layer triple advertises a parity that doesn't exist and gives consumers two paths to the same `renderedFiles` data.

### 4. Single `WorkspaceContext` `Context.Service`, subject-specific extension APIs

The decisive argument: in the prior eight-services design, every service had identical structural shape (`declared`/`resolved`/`actual`/`installed`/`find`); the only differences were _data_, not _behavior_. Maintaining eight Layer registrations to express type-level variance is the wrong axis. One `Context.Service` with internal namespacing collapses the registration overhead while subject-specific _modules_ (not services) under `extensions/<type>.ts` and `agents/<id>.ts` carry the genuine variance. The architecture-guide SRP-over-DRY rule is honored at the _module_ level, where the per-subject shapes are genuinely different. Service multiplication is reserved for genuinely different lifecycles (state-source loaders vs agent registry vs context — exactly the layers we already have).

Each per-subject extension module owns:

- payload types for layer outputs (`declared`/`resolved`/`actual`) and view outputs (`installed`/`active`/`unmanaged`/`ignored`);
- an internal `ExtensionStateReader<TDeclared, TResolved, TActual>` instantiation for the subject's read-only state cells;
- projectors from cached `state` outputs to declared and resolved payloads;
- the closed set of scanner calls that compose `actual` for that subject;
- the resilient projections that compose `installed`, `active`, `unmanaged`, and `ignored`.

Per-agent modules under `agents/<id>.ts` own each agent's typed `nativeConfig` shape and its scanner composition. Adding a new agent means adding a module, registering it in the agent registry, and (if it renders extensions) registering its scanner function — no central service edit. The central `AgentNativeConfig` type is an open union re-exported from a thin barrel (`agents/index.ts`) that lists registered modules.

The single `WorkspaceContext` service wires each subject namespace to the right module once per scope. Tests of skill logic stub a fake scoped `state` accessor and call the skill module directly — no service-level mocking needed.

Agent identity uses `AgentId` as currently exposed; the registry stays a static module accessed through the same import path the rest of the codebase uses today.

**Implementation note (Effect v4).** This module is the first in `unstable/workspace/` to use Effect v4's `Context.Service` declarative pattern. The existing `workspace/service.ts` keeps its `ServiceMap.Tag()` + `Layer.effect` form; mixing patterns is intentional and short-lived, evicted by the Migration Plan changes. Public service interfaces MAY spell reviewed contracts as `Effect.Effect<A, E>` but MUST NOT expose dependency requirements in `R`. Local helpers SHOULD let TypeScript infer success, error, and requirement channels. Reviewed boundaries SHOULD use `Effect.fn("name")(..., Effect.satisfiesSuccessType<A>(), Effect.satisfiesErrorType<E>())` when `A` or `E` is part of the contract. Source loaders, scanner helpers, and projections SHOULD be named with `Effect.fn` so traces land under stable workspace operation names.

**Alternatives considered:**

- (a) Eight subject services + `WorkspaceDiagnostics` (the prior design). Rejected for the structural-shape reason above.
- (b) Generic `extensions.layers.actual(scope, type)` APIs. Rejected: they keep the service compact but force call sites to understand conditional payload maps like `ActualOf<T>`. Subject-first APIs make the payload visible from the property path (`skills.actual` returns `ActualSkills`) and match module ownership.
- (c) Static factory function. Rejected: doesn't compose with the Effect runtime; every caller has to thread sources/scanners by hand.

### 5. Scanner functions emit materialization occurrences with subject-specific origins; no probe registry

The actual layer is built by composing **scanner functions**, each an `Effect.fn` keyed by what filesystem location and format it understands. v1 has no runtime probe registry; the set of scanners is closed and statically composed.

Scanner output is intentionally occurrence-shaped. An actual extension entry is one observable materialization in one runtime surface. It is not the unique extension name, and it is not a pre-grouped classifier row. If `some-skill` exists in both `.claude/skills/some-skill/SKILL.md` and `.codex/skills/some-skill/SKILL.md`, `ctx.scope(scope).skills.actual` returns two actual skill entries. If the same name also exists in `.axm/extensions/@owner/skills/src/some-skill/SKILL.md`, it returns three. External materializations under `.axm/extensions/external/skills/some-skill/SKILL.md` are likewise separate actual entries.

Scanners are plain typed `Effect.fn` helpers under `scanners/` (`canonical-extensions.ts`, `agent-dir.ts`, `mcp-config.ts`, `agent-settings.ts`) — implementation helpers, not service methods. The helper body may use filesystem/path services, but `WorkspaceContextLive` MUST close those requirements before cached scanner effects are stored in the context. Public cells such as `project.skills.actual` therefore remain `Effect.Effect<ActualSkills>` at the call site, with no `FileSystem | Path` requirement leaking through the service interface.

Each per-subject module composes the scanners relevant to it. Skills compose canonical skill scans plus agent-dir skill scans for every skill-rendering agent. Rules compose canonical + per-agent rule directories. MCP servers compose canonical + `parseMcpConfig` over the config paths. The composition site supplies the dependency-closed scanner inputs captured by the live layer.

Detection origin is a shared _concept_, not a single exported union type. The module that owns an actual payload owns the concrete origin union for that subject. This keeps impossible cases out of the type system: a skill cannot have an MCP config origin, and an agent cannot have a canonical AXM skill origin. If a generic diagnostic formatter eventually needs a widened union, it can define that union locally from the subject-specific origin types it actually handles.

Per-subject actual cells concatenate scanner outputs and preserve same-name duplicates across distinct materialization surfaces. They deduplicate only exact duplicate observations of the same physical occurrence, using a stable occurrence identity derived from `scope`, `type`, `origin`, and content/config location. Grouping by name and merging locations happens only in downstream projections that need classifier-compatible input; the raw actual layer never collapses `.claude`, `.codex`, canonical AXM, and external AXM materializations into a single entry.

Scanners themselves never fail in the error channel. Everyday partial failures (a single unreadable file in a scanned dir) become warnings published to `diagnostics`. Workspace-root path-escape is a precondition checked once at provider construction (Decision 1).

**Alternatives considered:**

- (a) A `ProbeRegistry` service holding `ReadonlyArray<Probe>` with a uniform per-subject method interface. Rejected: every probe would return `[]` for most subjects; the polymorphic shape is a tax that doesn't reflect the domain.
- (b) Probes as Layers composed via `Layer.mergeAll`. Rejected: `Layer` earns its keep when it owns dependencies and lifecycles. These would just hold pure functions.

If v2 introduces plugin-loaded scanners or process-level probes, a registry can come back as a local migration — each per-subject module would consume a registry instead of importing scanners directly. The deferred extension point is cheap.

### 6. Caching strategy: `Effect.cached` everywhere; no `Cache.make`

Both source loaders and scanner outputs have statically-bounded key sets within a CLI invocation:

- **Sources**: `(scope, source)` — 4 effects total (project/user × settings/lockfile, with user-lockfile permanently `Option.none()`).
- **Scanners**: `(scannerId, scope, agentId?, type?)` — bounded by the closed scanner set × `{project, user}` × the closed `AgentRegistry` × `ExtensionType`. For v1 this totals on the order of 30–50 cached effects.

At provider construction, the live Layer resolves `FileSystem`, `Path`, `AgentRegistry`, and the other workspace dependencies once, then eagerly enumerates all scanner keys and constructs `Effect.cached(...)` wrappers for dependency-closed scanner effects — no actual scanning runs at construction; a wrapper holds a lazy thunk that runs on first `yield*`. A `Map<key, cachedEffect>` indexed by serialized key serves lookups. This is thinner than `Cache.make` (no capacity tuning, no eviction).

Cached source loaders use the same shape: the Layer may internally use filesystem/path dependencies, but `ScopedStateApi.settings`, `ScopedStateApi.lockfile`, `ExtensionStateReader.declared`, `ExtensionStateReader.resolved`, and every actual cell expose requirement-free effects. Dependencies are resolved in the Layer and captured by cached thunks before the `WorkspaceContext` service value is returned.

`Effect.cached` resolves concurrent `yield*` of the same cached effect to a single execution. Two consumers reading `project.skills.installed` in parallel share one projection run; the same applies to source loaders and scanner outputs. No per-call serialization or duplicate I/O.

Every loader and projection is wrapped with `Effect.fn("workspace.<surface>.<operation>")(...)` so spans land in Sentry/Seq without per-call `Effect.withSpan` plumbing.

**Quality constraint:** ≤ ~50 cached effects per `WorkspaceContext` instance. Provider lifetime is one CLI invocation; cache lifetime is the layer scope.

**Invalidation contract.** There is no per-cell invalidate. The entire context is replaced by constructing a new `WorkspaceContext` after a write phase (Decision 8). Within a context's lifetime, cells are stable: same input → same output.

**Diagnostics buffer concurrency.** The buffer is append-only and ordered by emission completion. Concurrent emitters see consistent ordering through an Effect `Ref` (or queue) committed per emission; `ctx.scope(scope).diagnostics` returns a snapshot of the buffer at read time. Each `Warning` carries a `source` discriminator (`settings | lockfile | scanner`) plus optional path. The buffer does not deduplicate; consumers that want unique warnings filter at the call site by `(code, source.path, message)`. Filtering and per-subject views are call-site concerns.

If v2 introduces unbounded keys (per-name narrowing, plugin-loaded scanners), `Cache.make` can come in then. v1 doesn't need it.

### 7. Projection taxonomy: raw evidence first, composed views second

`declared`, `resolved`, and `actual` are the only source-backed layer names. Everything else is a projection over those layers plus subject policy. The old public vocabulary overloaded "configured" to mean both "appears in settings" and "explicit non-ignored managed extension"; WorkspaceContext deprecates that term in its API. Raw settings evidence is `declared`; installed rows expose `installationOrigin` to explain why a row appears.

The dimensions are orthogonal:

| Axis            | Values                         |
| --------------- | ------------------------------ |
| evidence        | declared, resolved, actual     |
| installation    | direct, pack-member            |
| policy          | included, ignored              |
| activation      | enabled, disabled              |
| materialization | actual present, actual missing |
| ownership       | managed, unmanaged             |

#### Normative definitions

Every projection is scoped; project and user state are not implicitly merged.

- **Declared** — raw same-subject settings evidence for one scope, decoded from `settings.json`. Includes disabled and ignored declarations because those facts still exist in settings. Does not include skills provided by packs.
- **Resolved** — raw lockfile evidence, decoded from the scoped lockfile cell. In v1 only project scope has lockfile state; user scope returns `Option.none()`. Resolved entries enrich declarations and installed rows with locked source, version, rendered files, and pack-member facts. A standalone subject lockfile entry does not create installed inventory.
- **Actual** — raw observable runtime evidence from subject-owned scanner composition. Same-name materializations across distinct physical surfaces remain distinct entries; exact duplicate observations of the same physical occurrence collapse to one entry. Actual entries never create installed inventory by themselves.
- **Detection origin** — subject-specific origin on an actual occurrence (canonical AXM, external AXM, agent-rendered directory, config file). Distinct from installation origin.
- **Installation origin** — evidence explaining why an installed row exists. Direct rows carry the declared entry; pack-member rows carry the installed pack reference and the resolved pack member.
- **Direct** — installation origin determined from a non-ignored same-subject declared entry.
- **Implicit** — installation origin determined from an installed pack's resolved member graph. A subject row is implicit only when the member is included by policy and **no same-subject direct declaration** (enabled or disabled) exists for that name.
- **Installed pack** — a pack row in `project.packs.installed`. Packs are installed only from included direct pack declarations plus resolved detail. Actual-only packs are not installed. Packs cannot be installed as members of other packs.
- **Pack member** — a resolved extension member from an installed pack's dependency graph. Pack members are input evidence for implicit installed rows, not raw subject declarations.
- **Installed** — managed inventory: the deterministic union of included direct rows plus included implicit pack-member rows. Actual-only occurrences and orphaned resolved entries are never installed.
- **Activation** — `enabled` or `disabled` on installed rows. Read from the declared entry when the subject supports it (`skill`, `command`, `subagent`); otherwise `enabled` by policy (`mcp-server`, `pack`).
- **Active** — installed rows whose activation is `enabled`. Disabled direct rows remain installed and still claim their names and matching actual occurrences; they are excluded only from `active` and from currency/materialization work that intentionally consumes `active`.
- **Ignored** — suppressed evidence, determined by subject policy over declared, pack-member, and actual candidates. Remains visible through raw evidence cells and the `ignored` projection; excluded from `installed` and `unmanaged`.
- **Unmanaged** — actual occurrences not attached to an installed row, not ignored, and not claimed by subject-specific policy.
- **Orphaned/degraded resolved** — lockfile entries not attached to a direct installed row and not claimed by an installed pack member. Surfaced as diagnostics, never as installed inventory.

`ignored` and `disabled` are not synonyms:

- **Ignored** suppresses candidates from `installed`/`unmanaged` but does not delete them from raw evidence.
- **Disabled** is declaration metadata for subjects that support activation; a disabled direct declaration is still managed inventory and still claims the name.

#### Projection invariant

```ts
direct = declared.filter(notIgnored).map(withInstallationOrigin("direct"));

implicit = installedPacks
  .flatMap((pack) => pack.resolvedMembers[subjectType])
  .filter(notIgnored)
  .filter(notDeclaredByName) // direct (incl. disabled) wins
  .map(withInstallationOrigin("pack-member"));

installed = direct + implicit;
active = installed.filter((row) => row.activation === "enabled");

unmanaged = actual
  .filter(notIgnored)
  .filter(notClaimedByInstalled)
  .filter(notClaimedBySubjectPolicy);

ignored = ignoredFrom(declared, packMembers, actual);
```

#### Pack member source and pack policy

Implicit pack-member rows derive from each `InstalledPack`'s resolved member graph, read from the **installed pack manifest** — the registry-published artifact recorded under the pack's resolved lockfile entry — not by recursively scanning lockfile rows. If a pack manifest is unreadable, the helper publishes a diagnostic and excludes that pack's members from `implicit` rather than guessing.

Packs are not members of other packs. `project.packs.installed` is derived from direct pack declarations plus resolved detail for those declarations only. The pack namespace passes an empty installed-pack set into the projection helper and never depends on `project.packs.installed` recursively. A pack SHALL NOT become implicit merely because another pack mentions it.

#### Shared helper

The shared algorithm lives at `extensions/projection.ts`. The public output exposes only the four projection cells plus warnings; intermediate facts (`actualOnly`, `claimed`) stay in the helper body. The helper owns the shared algorithm — source-tolerance, diagnostics publication, direct-over-pack precedence, disabled claiming, actual-occurrence attachment, ignored suppression, orphaned-resolved diagnostics, deterministic sorting. It MUST NOT own subject row shape or subject policy.

`actualOnly` and `claimed` are intermediate facts inside the helper body, **not public outputs**. Consumers express the same questions through `actual` (every observed occurrence), `installed` (managed rows with their attached `actual`), and `unmanaged` (post-policy unmatched). If a subject later needs an `actualOnly` cell for diagnostics, the per-subject module exposes it explicitly.

#### Resilience contract (cross-references)

The spec scenarios _Installed skills survive invalid lockfile_, _Subject lockfile entry alone does not create implicit inventory_, _Pack-provided skill is implicit installed inventory_, _Direct skill declaration wins over pack membership_, _Disabled direct skill still claims actual materialization_, _Ignored skill is suppressed but raw evidence remains visible_, and _Packs are not installed as pack members_ each test one branch of the projection invariant; each lands a fixture under `__fixtures__/`.

### 8. WorkspaceContext is the primary CLI read model

WorkspaceContext is the intended primary read model for CLI workspace state. New CLI read paths default to WorkspaceContext unless they are inside a write operation that already owns a narrower input contract. The architectural split is explicit:

```text
WorkspaceContext     read-only snapshot: settings, lockfile, actual state, projections, diagnostics
Operations/managers  write model: settings writes, lockfile writes, materialization, plan execution
```

WorkspaceContext SHALL remain read-only and snapshot-shaped. A context instance represents one CLI command phase. It does not refresh itself after writes, mutate cached cells, or coordinate write serialization. Commands that need post-mutation state create a fresh context snapshot after the write phase. This prevents the new read model from turning back into today's heavy `workspace/service.ts`.

The full read surface includes:

- `state` owns raw decoded settings/lockfile cells and raw bytes for absent-vs-invalid diagnostics.
- `sourceHosts` owns declared and effective source-host views. The name `sources` is intentionally avoided because CLI users already use "sources" to mean source-host configuration, not raw settings/lockfile input files.
- `profile` owns declared/effective profile reads (`project > user > default`) for commands that currently call `getConfiguredProfile` or `getDefaultProfile`.
- Extension subject namespaces own declared/resolved/actual/projection state.
- `agents` owns declared, actual, known, and detected agent views.

Writes remain outside WorkspaceContext. `setSkill`, `removeSkill`, lockfile upserts, materialization operations, plan execution, source resolution, registry fetches, and command-specific plan construction stay in operations/managers or follow-up write-model modules.

### 9. Read-model rows wrap evidence and specialize facts

Consumer needs (see _Consumer use-case map_ in Context) reduce to a small set of fields. The model wraps schema evidence rather than copying it; subject modules specialize facts rather than forking taxonomies.

```ts
interface ExtensionKey<TType extends ExtensionType = ExtensionType> {
  readonly scope: Scope;
  readonly type: TType;
  readonly name: ExtensionName;
}

type ActivationState = "enabled" | "disabled";

type InstallationOrigin<TDeclared, TPackMember> =
  | { readonly _tag: "direct"; readonly declared: TDeclared }
  | { readonly _tag: "pack-member"; readonly member: TPackMember; readonly pack: InstalledPackRef };

interface InstalledExtension<TDeclared, TResolved, TActual, TPackMember> {
  readonly key: ExtensionKey;
  readonly installationOrigin: InstallationOrigin<TDeclared, TPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<TResolved>;
  readonly actual: ReadonlyArray<TActual>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}
```

Wrappers on raw schema entries (`DeclaredExtension.entry`, `ResolvedExtension.lockEntry`) preserve decoded settings and lockfile entries as written. Normalized fields are added only when they remove schema/union leakage for generic consumers: `source`, `activation`, parsed declared registry ref, source kind, registry identity. Direct lockfile fields like `agents`, `renderedFiles`, `sourceHash`, `retainedByPack` are not repeated on resolved rows; subject modules provide small accessors on `lockEntry` for normalized defaults.

Subject modules specialize _facts_, not taxonomies:

- Skills add `SkillDetectionOrigin` and skill filesystem facts (`contentRoot`, `sourcePath`, `packageRoot`, `hasSkillMd`, `hasSkillJson`).
- Commands and subagents share activation / rendered-file behavior with skills, but own their actual-origin / fact shapes.
- MCP servers and packs use activation `enabled` by policy and do not duplicate a no-op enabled field in declared settings; the projection row supplies activation for generic consumers.
- Packs add resolved member groups (`resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`, `resolvedSubagents`) and specialize installed rows to direct-only installation origins because packs cannot be members of other packs.

This shape:

- preserves raw settings entries for writers and diagnostics without forcing every projection to carry raw JSON;
- keeps resolved lock entries available for exact version, source kind, rendered files, retained-by-pack, and stale/orphan checks;
- attaches actual occurrences to installed rows without collapsing the raw actual layer;
- lets generic consumers operate on `installationOrigin`, `activation`, `actual`, and `resolved`, while subject-specific consumers narrow to subject fact types;
- avoids a new `ConfiguredSkill` / `ConfiguredCommand` / `ConfiguredSubagent` family. Directness is `installationOrigin._tag === "direct"`; activity is `activation`; unmanaged is a projection over actual occurrences;
- avoids parallel `ReadonlyRecord` return types for every projection. Projection cells return deterministic arrays of rows carrying `key`; the module exports one pure `indexByName(rows)` / `findByName(rows, name)` helper for command handlers that need lookup ergonomics. Raw `actual` remains array-only because same-name occurrences are valid.

The model does not precompute command-specific display strings, install plans, registry index data, or resolved remote source refs. Local parsing of declared source strings into optional registry owner/type/name/constraint metadata is acceptable because it is deterministic and side-effect free; remote source resolution is not. Per-name find APIs (`project.skills.find("name")`) are deferred — v1 callers can filter the projection arrays locally; adding `find` later is non-breaking.

### 10. Vocabulary alignment with ontology

Layers are named `declared`, `resolved`, `actual` in method names and prose only — no string-union type, no name collision with `effect/Layer`. Subjects use canonical extension type IDs (`skill`, `command`, `mcp-server`, `subagent`, `file`, `rule`, `pack`) via the existing `ExtensionType` constant; agent IDs come from the existing agent registry.

The vocabulary is "detection origin" as a _concept_, not `DetectionOrigin` as a central type. This replaces the earlier `ProbeOrigin` working name while avoiding a one-size-fits-all union. The ontology entries for `Unmanaged Extensions (U)` and shadow detection retain their meaning; they're defined in terms of subject-specific detection origins rather than a generic probe origin. The cross-repo ontology document gains a context-surface section but no new terms.

Per-agent typed surfaces (e.g., `ctx.scope("project").agents.claudeCode.actual`) are deferred. v1 ships `ctx.scope(scope).agents.actual(id)`; revisit if call sites suffer.

## API Sketch

Pseudocode-y TypeScript using Effect v4 APIs. Types only — implementation lives in the change. One example per shape; sibling extension types follow the same pattern.

### Errors (one example)

```ts
import * as Data from "effect/Data";

export class LockfileDecodeError extends Data.TaggedError("LockfileDecodeError")<{
  readonly path: string;
  readonly issues: ReadonlyArray<string>;
  readonly raw: unknown;
}> {}

// Sibling tags follow the same shape:
//   SettingsIoError / SettingsParseError / SettingsDecodeError
//   LockfileIoError / LockfileParseError
// Provider-construction-only:
//   WorkspaceRootEscape (fails the Layer; never appears on a cell)
```

### Service tag and one extension API

```ts
export class WorkspaceContext extends Context.Service<
  WorkspaceContext,
  {
    readonly scope: (scope: Scope) => ScopedWorkspaceContext;
  }
>()("axm/WorkspaceContext") {}

interface ExtensionStateReader<TDeclared, TResolved, TActual> {
  readonly declared: Effect.Effect<Option.Option<TDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TActual>;
}

interface SkillExtensionsApi extends ExtensionStateReader<
  DeclaredSkills,
  ResolvedSkills,
  ActualSkills
> {
  readonly installed: Effect.Effect<ReadonlyArray<InstalledSkill>>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledSkill>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedSkill>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredSkillCandidate>>;
}
```

`CommandExtensionsApi`, `McpServerExtensionsApi`, `SubagentExtensionsApi`, `FileExtensionsApi`, `RuleExtensionsApi`, and `PackExtensionsApi` follow the same shape with subject-specific payloads. `ScopedAgentsApi` exposes `list / known / declared(id) / actual(id) / detected` with no `resolved` cell. `ScopedStateApi` exposes `settings / lockfile / raw(source)`. `ScopedSourceHostsApi` exposes `declared / effective / registryHosts / byName`. `ScopedProfileApi` exposes `declared / effective`.

All effects exposed from `WorkspaceContext` service interfaces are dependency-closed: callers do not provide `FileSystem`, `Path`, `AgentRegistry`, or scanner dependencies to read a cell.

### Live composition (sketch)

`WorkspaceContextLive` resolves `FileSystem`, `Path`, and `AgentRegistry` once, validates workspace roots (failing the Layer with `WorkspaceRootEscape` on escape), constructs `Effect.cached` source loaders and an eagerly-keyed scanner cache, and returns a `scope()` function that builds scoped namespaces over the captured deps. A sibling `WorkspaceContextTest` Layer wires test implementations of `FileSystem` and `Path` against golden-fixture trees. A `__fixtures__/` builder ships in this change to generate minimal directory trees for the scenario set named in the spec.

### Consumer cookbook

Reach for projection cells when you want the resilient view; reach for raw cells when you specifically need to disambiguate Absent from Invalid.

| Goal                              | Cell                            | Result                                                       | Notes                                         |
| --------------------------------- | ------------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Render the install list           | `skills.installed`              | `Effect<ReadonlyArray<InstalledSkill>>`                      | never fails; warnings flow to `diagnostics`   |
| Compute materialization plan      | `skills.active`                 | `Effect<ReadonlyArray<InstalledSkill>>`                      | excludes disabled direct rows                 |
| Find orphan files (lint, prune)   | `skills.unmanaged`              | `Effect<ReadonlyArray<UnmanagedSkill>>`                      | post-policy; ignored and claimed already gone |
| Explain a suppressed candidate    | `skills.ignored`                | `Effect<ReadonlyArray<IgnoredSkillCandidate>>`               | carries reason and origin tag                 |
| Validate lockfile shape (lint)    | `Effect.result(state.lockfile)` | `Effect<Result<Option<DecodedLockfile>, LockfileReadError>>` | only `Lockfile{Io,Parse,Decode}Error`         |
| Validate settings shape (lint)    | `Effect.result(state.settings)` | `Effect<Result<Option<DecodedSettings>, SettingsReadError>>` | only `Settings{Io,Parse,Decode}Error`         |
| Read raw bytes (diagnostic, diff) | `state.raw("settings")`         | `Effect<Option<RawBytes>>`                                   | absent → `Option.none()`                      |
| Detect agent-present-undeclared   | `agents.detected`               | `Effect<ReadonlyArray<DetectedAgent>>`                       | mismatches surfaced as warnings               |
| Read effective profile            | `profile.effective`             | `Effect<Handle, SettingsReadError>`                          | applies project > user > default              |
| Resolve a source-host by name     | `sourceHosts.byName(name)`      | `Effect<Option<SourceHostConfig>, SettingsReadError>`        | no network                                    |

### Consumer example (AXM-454 closure)

```ts
const skillContexts = Effect.gen(function* () {
  const ctx = yield* WorkspaceContext;
  const project = ctx.scope("project");
  const installed = yield* project.skills.installed; // never fails
  return installed.map((skill) => buildSkillRuleContext(skill));
});
// Corrupt lockfile produces LockfileReadError on `skills.resolved`,
// `skills.installed` swallows it (via Effect.result), publishes a warning to
// `diagnostics`, and still returns managed InstalledSkill rows derivable from
// the remaining sources. Actual-only materializations remain available
// through `skills.actual` and `skills.unmanaged`.
```

## Risks / Trade-offs

- **[Trade-off] Six per-source error classes (three each for settings and lockfile).** Rationale: each is a 5-line `Data.TaggedError`; tags read as documentation; the union types stay short. The payoff — every catch site reads as a sharp claim about what it handles — is worth the verbosity for a context surface whose job is making structurally-invalid layers visible.
- **[Trade-off] Two parallel ways to read and classify workspace state until migrations land.** Rationale: the new module lives under `workspace/context/` and is not exported from the workspace barrel until the first migration target lands. Migration changes are sized and ordered to land in the same release window where practical. Legacy `classifyExtensions` keeps current callers stable while projection cells are tested against the new occurrence-shaped model.
- **[Trade-off] Per-source tagged errors require thinking about which cell you called.** Rationale: resilient projections (`installed`, `active`, `unmanaged`, `ignored`, `detected`) catch errors internally and present a never-failing surface. Consumers that need to disambiguate Invalid from Absent reach for `Effect.result` — the canonical pattern in this codebase. Lint rules that key on specific error tags use `Effect.catchTag` against the narrow union.
- **[Trade-off] `AgentNativeConfig` as an open union assembled from per-agent modules.** Rationale: per-agent modules each export their native-config variant; the central `AgentNativeConfig` type is re-exported from a thin barrel (`agents/index.ts`) that lists registered modules. Adding an agent: add module + register in barrel — no service edit.
- **[Trade-off] User-scope lockfile is always `Option.none()`, asymmetric with project scope.** Rationale: documented in the spec and at the cell signature; the asymmetry is one line of asymmetric code (`lockfileUser = Effect.succeed(Option.none())`), not a special case in the API.
- **[Trade-off] Adopting `Context.Service` in a workspace module that elsewhere uses `ServiceMap.Tag()`.** Rationale: this module is greenfield and doesn't force `service.ts` to migrate; mixing patterns is intentional and short-lived (see _Migration Plan_).
- **[Risk] Possible duplication of detection logic with `source-resolution/discoverSkillsInDir`.** Mitigation: v1 scanner functions call into the existing discovery helpers rather than reimplementing; the helpers are not moved in this change. The `migrate-discover-to-workspace-context` follow-up rationalizes ownership.
- **[Risk] Test fixture maintenance cost.** Mitigation: a small fixture builder is in scope as part of this change. Fixtures are minimal directory trees serialized as YAML or filesystem snapshots, generated by the builder rather than handwritten file-by-file. Each fixture is named after the scenario it covers.

## Migration Plan

This change ships only the new `workspace/context/` module and its tests. The existing `classifyExtensions` projection in `packages/core/src/unstable/workspace/classifier.ts` and the heavy `workspace/service.ts` are NOT modified; they remain as legacy compatibility code until consumers migrate. The Migration Targets enumerated in the proposal are the deploy plan; each lands as a separate OpenSpec change with its own delta specs as needed.

Recommended sequencing rationale: `migrate-lint-to-workspace-context` (subsumes AXM-454) goes first — it validates API ergonomics under the most demanding consumer (multiple rule catalogs, all extension types, both scopes, agent surface for cross-cutting rules). Taxonomy consumers, prune, outdated, list/uninstall handlers, then discover/setup follow; the last in the chain is the cleanup change that lets the heavy `workspace/service.ts` shed its detection helpers and the legacy `classifyExtensions` path be compared, narrowed, or deleted.

Rollback: the new module lives under `workspace/context/` and is not exported from the workspace barrel until a migration consumer lands. Reverting is a clean directory removal plus a barrel revert.
