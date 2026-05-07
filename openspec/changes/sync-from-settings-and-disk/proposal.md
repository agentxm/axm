## Why

`axm sync` currently treats the lockfile as its input — it walks lockfile entries, reconstructs an `ExtensionRef` for each (resolving `sourceName` against configured registry/git sources), and renders from those refs. That couples a pure projection step (settings + on-disk content → rendered files) to resolution metadata that has nothing to do with rendering. When a lockfile entry references a source that is no longer configured (e.g., a `local` dev registry that was removed from `settings.json`), sync fails with `LOCK_ENTRY_SOURCE_NOT_CONFIGURED` even though the canonical content already lives at `.axm/extensions/<owner>/<kind>/<name>/` and is ready to render.

The materialization set is conceptually a settings question: "what extensions does this workspace want, for which agents, enabled or disabled." The content is an on-disk question: "what is at `.axm/extensions/...`." Neither needs the lockfile.

## What Changes

- `axm sync` derives the materialization set from `settings.json` (top-level `agents`, per-extension entries with enabled/disabled, and pack-implied dependencies expanded from installed pack manifests on disk).
- `axm sync` reads canonical extension content from `.axm/extensions/<owner>/<kind>/<name>/` (manifest + source files) instead of reconstructing refs from lockfile entries.
- The lockfile is no longer an input to `axm sync`. It remains the resolution/integrity record consumed by install, update, outdated, prune, and audit flows.
- **BREAKING**: `axm sync` no longer fails when lockfile entries reference unconfigured sources, because sync no longer reads the lockfile. (Stale `sourceName` is now an `axm lint`/`axm doctor` concern, not a sync blocker.)
- **BREAKING**: The `agents` field is removed from skill, command, and subagent manifests. Targeting is owned by settings end-to-end: top-level `settings.agents` selects the agents to materialize to; per-extension overrides (if any) live alongside the extension entry in settings.
- Settings entries that point at extensions missing from `.axm/extensions/` are surfaced as drift findings (lint/doctor), not silent skips and not sync failures. On-disk content not referenced by settings continues to be cleaned up by the existing orphan rule.
- Sync stops writing or relying on the lockfile's entry-level `sourceHash` as the change-detection key. If a re-render optimization is retained, it derives the hash from on-disk content directly.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `workspace-reconciliation`: change `axm sync`'s input contract — settings + on-disk extensions, not the lockfile. Drop the `sourceHash`-stored-in-lockfile requirement; keep agent-list change handling, enabled/disabled handling, orphan cleanup, and managed-marker verification. Frontmatter→manifest sync requirements have already been removed from the codebase and are dropped from the spec.
- `subagents`: remove `agents` from the subagent manifest schema; targeting is settings-owned.
- `commands`: remove `agents` from the command manifest schema; targeting is settings-owned.

## Impact

- **Code**:
  - `packages/cli/src/root/sync/handler.ts` — switch input from `listMaterializable` (lockfile-driven) to a settings + on-disk walk.
  - `packages/core/src/unstable/{subagents,skills,commands,mcp-servers,packs}/manager.ts` — rewire `listMaterializable` to read from settings + `.axm/extensions/`. The lockfile-driven `subagentLockEntryToRef` family is no longer reached on the sync path.
  - `packages/core/src/unstable/{subagents,skills,commands}/manifest-schema.ts` — drop the `agents` field.
  - `packages/core/src/unstable/lockfile/*` — schema unchanged; no longer read by sync.
  - `packages/core/src/unstable/sources/lock-entry-to-ref.ts` — retained for install/update; sync no longer calls it.
- **APIs**: Manifest schemas lose the `agents` field (registry validation, JSON schemas at `axm.sh/schemas/*`, and any `subagents publish` / `skills publish` flows that currently emit it).
- **User-visible**:
  - The `LOCK_ENTRY_SOURCE_NOT_CONFIGURED` error stops occurring on `axm sync`.
  - Existing manifests with `agents: [...]` continue to load (field ignored) but the field is removed from validation; publish flows stop accepting it. Migration: drop the field from authored manifests; targeting is now expressed in settings.
- **Specs**: `workspace-reconciliation`, `subagents`, `commands` updated as listed above. Lint catalogs that reference manifest `agents` are revised to drop those checks.
