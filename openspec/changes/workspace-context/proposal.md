## Why

Workspace consumers (lint, install, update, prune, outdated, setup) reach into settings, lockfile, agent presence, agent config, and disk through ad-hoc, partially overlapping helpers. Three independent state surfaces feed all of this — declared (settings), resolved (lockfile), and actual (observable filesystem and agent state) — but the helpers fuse them into a single load that fails closed when any one fails, and they expose only `Option<T>`, so a structurally-invalid layer is indistinguishable from an absent one.

The canonical instance is AXM-454: lint's `buildIndexFromLockfile` projects a `WorkspaceIndex` from the lockfile alone, and on lockfile decode failure returns empty — silently dropping every input that the skill and pack rule catalogs (8 rules) need, including the rule written specifically to catch the regression that drove the lockfile shape change. The bug itself is narrow (one helper, one source); the _class_ of bug is latent across prune, outdated, list, uninstall, and setup paths, all of which fold one or more layers into the same `Option`-shaped result. The Why is "fix the class," not "fix the one helper."

A typed, three-layer **WorkspaceContext** is the missing seam. It is the read-only, decode-tolerant projection every workspace-reading consumer should query, where each layer loads independently and each cell carries **per-source tagged errors** in the failure channel and `Option.none()` (Absent) in the success channel. Consumers — including the existing pure classifier — opt into which layers they tolerate degraded, instead of inheriting an all-or-nothing failure mode.

## What Changes

- Introduce a single `WorkspaceContext` `Context.Service` with a scope-first API: `ctx.scope(scope)` returns a scoped workspace context with subject namespaces (`skills`, `commands`, `mcpServers`, `subagents`, `files`, `rules`, `packs`, `agents`), scoped raw `state` cells, scoped `sourceHosts`, scoped `profile`, and scoped `diagnostics`.
- Establish `WorkspaceContext` as the intended primary CLI read model. It is read-only and snapshot-shaped; mutation operations, settings/lockfile writes, materialization, source resolution, registry fetches, and plan execution remain outside the context.
- Each cell that reads a source loads independently of the others. Source loaders are wrapped with `Effect.cached` per scope so any consumer can re-read without redoing I/O. A failure or corruption in one source SHALL NOT prevent the other two layers from being read.
- Cells expose **per-source tagged-error families**, not a shared umbrella:
  - `SettingsReadError = SettingsIoError | SettingsParseError | SettingsDecodeError`
  - `LockfileReadError = LockfileIoError | LockfileParseError | LockfileDecodeError`
  - The actual layer NEVER fails (`Effect<T>`); workspace-root path-escape is validated once at provider construction and fails the Layer (`WorkspaceRootEscape`), not per-cell calls. Scanner partial failures surface as warnings on scoped `diagnostics`.
- Make **scope** first-class by selecting it once with `ctx.scope("project")` or `ctx.scope("user")`; scoped cells then expose subject-specific payloads without repeating scope or passing an extension-type discriminator.
- Treat all canonical extension types as first-class scoped namespaces (`skills`, `commands`, `mcpServers`, `subagents`, `files`, `rules`, `packs`). Per-type payload shapes are owned by per-type modules under `extensions/` and exposed directly by the corresponding namespace.
- Expose `agents` as a scoped namespace with `declared`, `actual`, `list`, and `detected` only. **Agents have no `resolved` layer**; rendered-files maps live on each scoped extension's `resolved` cell, where they already exist, not duplicated under the agent.
- Reframe the "actual" layer as **observable runtime state**, not narrowly "disk scan." It is built by composing a closed set of named scanner functions: filesystem materialization in `.axm/extensions/`, agent-rendered files in agent directories, MCP server runtime config files, and agent-native settings. There is no runtime probe registry in v1 — scanners are statically composed. Each actual entry represents one observable materialization occurrence, not one deduplicated extension name. The same skill name in `.claude/skills/`, `.codex/skills/`, and `.axm/extensions/...` is therefore three actual skills. Each actual entry SHALL carry a subject-specific detection origin (for example, a skill origin cannot be an MCP config origin) so `Unmanaged Extensions` and shadow detection retain their ontology meaning.
- Add net-new WorkspaceContext projection cells: `installed`, `active`, `unmanaged`, and `ignored` derive direct and pack-member installation origins, activation, ignored, and unmanaged views from the new declared/resolved/actual model. The existing `classifyExtensions` implementation stays unchanged as legacy compatibility code; production callers migrate in a follow-up.
- Adopt ontology vocabulary: `declared`, `resolved`, `actual` for layers (as method names and prose, not as a string-union type that would collide with `effect/Layer`); `scope` for project/user. WorkspaceContext does not equate `actual` with `Detected Extensions (D)`; detected/classification-style views are composed from declared, resolved, actual, and policy.
- Defer source-host resolution and network calls. The context SHALL NOT perform source resolution, registry lookups, or remote fetches; it exposes declared `source` strings as written.
- Keep the v1 build whole-workspace and lazy per cell. Sources and scanners are cached via `Effect.cached` with statically-bounded key sets — no `Cache.make` until v2 surfaces an unbounded key set. Per-type narrowing and incremental invalidation are explicit non-goals for v1.
- **Scope this change to architect + test only.** This change introduces the `WorkspaceContext` capability and ships it with comprehensive tests (golden-fixture workspaces, source-independence tests, cross-scope shadowing tests, origin-tagging tests, scanner unit tests). It does NOT migrate any existing consumer in this change. Each migration target is a follow-up change, named below.

## Capabilities

### New Capabilities

- `workspace-context`: read-only, decode-tolerant projection over the workspace state layers (declared, resolved, actual) with per-source tagged errors, shipped as a single `Context.Service` exposing `ctx.scope(scope)` with subject namespaces, scoped raw `state` cells, scoped source-host/profile views, and scoped diagnostics. Actual entries carry subject-specific detection origins and preserve distinct same-name materializations. This change ships the capability and its test coverage; no consumers migrate to it in this change.

### Modified Capabilities

None in existing production surfaces. The existing `classifyExtensions` projection is preserved unchanged, while the new `WorkspaceContext` capability includes its own projection cells (`installed`, `active`, `unmanaged`, `ignored`). All consumer migrations are explicit follow-up changes (see _Migration Targets_ below); each will land its own delta specs as needed.

## Migration Targets

The following workspace consumers will migrate to `WorkspaceContext` in dedicated follow-up changes. Each is named here so the architecture can be designed with concrete consumers in mind, and so AXM-454 has a known landing pad. None are in scope for this change.

- **`migrate-lint-to-workspace-context`** (subsumes AXM-454) — replace `buildIndexFromLockfile`, `buildSkillRuleContexts`, `buildPackRuleContexts`, `buildWorkspaceRuleContext`, and the lint-local `WorkspaceLintAccessor` family with context-backed builders. Closes the AXM-454 silent-skip class of bugs (lockfile decode failure no longer drops skill/pack rule contexts) and brings every catalog (`skill/*`, `pack/*`, `workspace/*`) under the same resilience model. First migration target.
- **`migrate-taxonomy-consumers-to-workspace-context`** — move production classification callers from legacy `classifyExtensions` assembly to the WorkspaceContext projection cells they actually need (`installed`, `active`, `unmanaged`, `ignored`, or raw evidence). Legacy classifier cleanup happens after parity is proven.
- **`migrate-prune-to-workspace-context`** — `cli-prune` reads orphan-detection state from the context, including cross-scope shadowing.
- **`migrate-outdated-to-workspace-context`** — `cli-outdated` enumerates installed versions through the context.
- **`migrate-list-commands-to-workspace-context`** — `cli-skills-list`, `cli-packs-...-list`, `cli-commands-list`, `cli-subagents-list`, `cli-mcp-servers-list` (and any future `axm <type> list`) read installed sets from the context.
- **`migrate-uninstall-commands-to-workspace-context`** — `cli-skills-uninstall`, `cli-packs-uninstall`, etc. verify pre-state through the context.
- **`migrate-discover-to-workspace-context`** — `cli-discover` and the agent-directory scanners used by `axm setup` move under the context's actual-layer scanner functions.
- **`migrate-setup-to-workspace-context`** — `axm setup` agent detection reads through `ctx.scope(scope).agents.detected`.

## Impact

- **Code (axm core, this change):**
  - `packages/core/src/unstable/workspace/context/` — new module:
    - `context.ts` — `WorkspaceContext` `Context.Service` + `WorkspaceContextLive` Layer (single service; no per-type/per-agent service multiplication).
    - `state.ts` — `Effect.cached` state-source loaders for `settings.json` (per scope) and `axm-lock.yaml` (project scope only); per-source tagged-error classes.
    - `diagnostics.ts` — in-context warning collection (no separate service).
    - `extensions/` — per-`ExtensionType` modules (`skill.ts`, `command.ts`, `mcp-server.ts`, `subagent.ts`, `file.ts`, `rule.ts`, `pack.ts`), each owning declared/resolved/actual payload types and projectors.
    - `agents/` — per-agent modules (`claude-code.ts`, `cursor.ts`, `roo.ts`, …), each owning the typed `nativeConfig` shape it can produce.
    - `scanners/` — closed set of scanner functions (`canonical-extensions.ts`, `agent-dir.ts`, `mcp-config.ts`, `agent-settings.ts`); subject-specific detection origin types live with the actual payload modules that use them.
    - `__fixtures__/` — golden-fixture workspaces covering each interesting Absent/Invalid combination per cell (valid all, lockfile-invalid only, settings-invalid only, both invalid, all absent, project-only, user-only, project+user shadowing, agent-present-no-declaration, agent-declared-not-installed, MCP config drift, same-name actual materializations across multiple origins, path-escape attempts in scanners).
  - `service.ts` and `classifier.ts` are NOT modified in this change.
- **Code (axm core, follow-up changes only):**
  - `packages/core/src/unstable/lint/`, `packages/core/src/unstable/workspace/service.ts`, `packages/core/src/unstable/source-resolution/`, `packages/cli/src/root/{lint,prune,outdated,skills,packs,commands,mcp-servers,subagents,setup,discover}/handler.ts` — each migrates in its named follow-up.
- **Specs (axm openspec):**
  - New: `openspec/specs/workspace-context/spec.md`.
  - No delta specs in this change. Migration changes carry their own deltas.
- **Cross-repo (agentxm-internal):**
  - `docs/ontology/workspace.md` — context surface added to the workspace domain section; no new ontology terms (declared/resolved/actual map to existing concepts; `actual` is documented as observable materialization evidence, not as a synonym for `Detected Extensions (D)`).
  - Traceability matrix in `ONTOLOGY.md` — points `Workspace Extension Classification Taxonomy Terms` and `Workspace Terms` rows at the new capability spec.
- **Out of scope (deferred to follow-ups or to other changes):**
  - Migration of any existing consumer to `WorkspaceContext`.
  - Source-host resolution behavior, lockfile/settings schemas, lint rule severity defaults, plan-pipeline contracts, and registry client surfaces — all unchanged.
  - Process-level probes (e.g., running MCP servers) — not a v1 probe.
  - Per-type narrowing and incremental invalidation — cell shape preserves room; not built.
  - A user-scope lockfile — `ctx.scope("user").state.lockfile` SHALL return `Option.none()` until a future change introduces user-scope resolved state.
