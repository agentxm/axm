## Context

Today `axm sync` reconstructs an `ExtensionRef` for every entry in `.axm/axm-lock.yaml`, looking up `sourceName` against configured registry/git sources, then materializes from those refs (`packages/cli/src/root/sync/handler.ts:32-57`, `packages/core/src/unstable/sources/lock-entry-to-ref.ts`). That fails the moment a lockfile entry references a removed source — even when the canonical content is already on disk under `.axm/extensions/<owner>/<kind>/<name>/`.

Settings already declares which extensions the workspace wants and which agents to render to. Installed extensions already live on disk in canonical form (manifest + sources). Sync's job is purely to project that pair onto agent-native files. The lockfile's job is to record how each install was resolved, so future installs/updates are reproducible and integrity can be verified — none of that is needed to render.

## Goals / Non-Goals

**Goals:**

- `axm sync` runs entirely from `settings.json` + `.axm/extensions/`, with no read of the lockfile.
- `LOCK_ENTRY_SOURCE_NOT_CONFIGURED` and similar source-resolution errors become impossible on the sync path.
- Targeting (which agents an extension renders to) is owned by settings; manifests no longer carry `agents`.
- Existing reconciliation behaviors are preserved: enabled/disabled, agent-list change handling, orphan cleanup, managed-marker verification.
- Pack-implied extensions are still materialized.

**Non-Goals:**

- Re-render performance optimization. We will drop the lockfile-`sourceHash` short-circuit and not introduce a replacement in this change.
- Lockfile schema redesign. The lockfile keeps recording resolution metadata (and `renderedFiles`, `sourceHash` if other consumers want them); sync just stops reading it.
- `axm install`/`axm update`/`axm outdated` behavior. They keep using the lockfile and source resolution as before.
- Backward compatibility with manifests that still set `agents` (per change rules — backward compat is a non-goal).

## Decisions

### D1. Sync's input is `settings.json` + `.axm/extensions/`, not the lockfile.

`handleSync` collects materialization steps by walking settings:

1. Load `settings.json` (workspace-scoped).
2. For each managed kind (skills, commands, mcp-servers, subagents, packs), enumerate the entries.
3. Expand pack entries by reading the on-disk pack manifest (`.axm/extensions/<owner>/packs/<name>/pack.json`) and adding its constituent extensions to the set.
4. For each resolved (kind, owner, name) tuple, read the canonical content from `.axm/extensions/<owner>/<kind>/<name>/` and produce a render step.
5. Existing renderers/agent adapters are unchanged from this point on.

`subagentManager.listMaterializable` (and siblings) are rewritten to emit refs constructed from the on-disk manifest plus settings, instead of from `subagentLockEntryToRef`. The lockfile-based ref builders stay in the codebase but are only called by install/update.

**Alternatives considered:** Keeping the lockfile as input but tolerating unresolved sources. Rejected — it preserves the conceptual confusion that sync depends on resolution data, and only papers over the symptom.

### D2. Settings carries enable/disable and targeting; manifests do not.

The `agents` field is removed from `subagent.json`, `command.json`, and `skill.json` schemas. The render target set for an extension is `settings.agents` (top-level array of agent IDs). Per-extension override (e.g., narrowing `joke-teller` to claude-code only) is left as a future settings-level extension and is out of scope here.

For an extension that is `enabled: false` in settings, sync emits a removal step (existing reconciliation behavior).

**Alternatives considered:**

- Keep `agents` on manifests as a publisher-side capability declaration ("this only makes sense for these agents"). Rejected for now — no clear consumer; can be re-introduced later as a separate concern (e.g., compatibility metadata) without affecting sync.
- Allow per-extension targeting in settings as part of this change. Deferred — not blocking, and the schema work is non-trivial.

### D3. Render-target tracking moves from lockfile `renderedFiles` to disk-derived discovery.

Today, agent-removal cleanup uses lockfile `renderedFiles` to know which paths to delete. With the lockfile out of the sync path, sync determines what to clean by walking the configured agent directories and inspecting files for the AXM managed marker:

- For each configured agent's render directory (e.g., `.claude/agents/`), enumerate files.
- Files with the managed marker that don't correspond to any (settings-enabled extension × current `settings.agents`) target are removed.
- Files without the marker are conflicts (existing rule).

This makes cleanup data-driven from disk, mirroring how content reads work, and removes the lockfile write coupling for sync.

**Alternatives considered:**

- New `.axm/sync-state.json` tracking file. Rejected — duplicates information that the filesystem already encodes via the managed marker.
- Continue updating lockfile `renderedFiles` from sync (write-back only, never read). Rejected — keeps the lockfile coupling implicit and creates a stale-write hazard during dry-run.

### D4. Drop the `sourceHash` re-render short-circuit; re-render unconditionally for now.

Without lockfile reads, the existing entry-level `sourceHash` optimization is gone. We do not replace it in this change. Sync re-renders all in-scope extensions every run. Rendered output is deterministic and overwrites managed files; correctness is unaffected.

If profiling shows this is a real cost, a follow-up change can add a content-hash cache (computed from on-disk inputs, stored in a sync-state file or as a sidecar in `.axm/extensions/`).

**Alternatives considered:** Compute content hash and store in lockfile (write-only). Rejected for the same coupling reason as D3.

### D5. Drift handling moves to `axm lint`, not sync.

Three drift categories surface from settings + disk:

| Drift                                                | Detection                        | Action                                                                                |
| ---------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| Settings entry, no on-disk content                   | new lint rule (in scope here)    | finding suggests `axm install <name>` to stage content; sync skips the entry silently |
| On-disk content, no settings entry, not pack-implied | existing orphan rule             | sync removes rendered files for the orphan (no behavior change)                       |
| On-disk content with hash ≠ lockfile integrity       | existing `axm lint`/`axm doctor` | unaffected by this change                                                             |

Sync's contract: project the (settings ∩ on-disk) intersection. It does not raise errors for either side of the disagreement. The "settings entry without on-disk content" lint rule is added as part of this change so the loud sync error isn't replaced by silent drift.

### D6. Local-source extensions assume install-time staging into `.axm/extensions/`.

`type: local` lockfile entries today point at paths outside `.axm/extensions/`. Sync's new contract requires content under `.axm/extensions/<owner>/<kind>/<name>/`. We do not change install behavior in this change; we document that install MUST stage local sources into `.axm/extensions/` (most likely already true post-AXM-651). If a local source is genuinely external and not staged, sync simply does not render it (it appears as a settings-without-disk drift case under D5).

**Alternatives considered:** Special-casing the sync path to read from arbitrary paths for `type: local`. Rejected — re-introduces the "two ways to get content" branching we're removing.

## Risks / Trade-offs

- **Risk: A workspace's lockfile holds the only record of what was installed; sync no longer surfaces missing-on-disk extensions.** → Mitigation: D5's lint/doctor rule. Until that exists, missing-on-disk extensions are silently skipped by sync. The earlier failure mode (loud error) becomes a quiet skip; this is acceptable for sync, but the lint rule needs to ship close behind.
- **Risk: Performance regression from dropping the `sourceHash` short-circuit.** → Mitigation: measure before reintroducing. Renderers are pure functions over manifest + content; cost should be modest, and the happy path writes identical bytes (no I/O change for unchanged files unless we forgo the write-skip — which we won't, the renderer's per-file write logic still no-ops on identical content).
- **Risk: Removing manifest `agents` (BREAKING) requires registry-side changes (validation, JSON schemas).** → Mitigation: list registry/JSON-schema updates in tasks; the registry is owned by this team. Authored manifests in the wild are few; publish flows will reject the field after this change.
- **Risk: Pack expansion now happens at sync time rather than implicitly via lockfile entries.** → Mitigation: pack manifests on disk are the existing source of truth for constituents; we already read them during install. Sync gains a small read step but no new dependency.
- **Risk: Disk-derived render-target cleanup (D3) iterates configured agent directories on every sync.** → Mitigation: agent directories are small (tens of files typical). Acceptable cost; matches existing reconciliation work.
- **Risk: `type: local` extensions that aren't yet staged into `.axm/extensions/` will silently stop rendering.** → Mitigation: D6's install-time staging requirement; called out in tasks for verification.
