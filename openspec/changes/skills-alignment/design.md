## Context

The cross-extension-type alignment analysis established conventions for
`--preview` flags and rendered-file tracking that apply uniformly across skills,
commands, and subagents. Investigation of the current codebase reveals:

1. **`--preview` is already wired** on `uninstall`, `update`, `enable`, and
   `disable`. All four commands accept `previewFlag`, pass it through handlers,
   and delegate to `resolvePlan(plan, { yes, force, preview })` which handles
   preview display and confirmation. No CLI or handler plumbing changes needed.

2. **Symlink fallback to copy exists** but is untracked. When symlinks fail,
   `installForDirectory` falls back to `copyExtensionDirectory`. The result
   records `mode: "copy"` but the lockfile has no `renderedFiles` tracking —
   copied files cannot be reliably located for cleanup or re-sync.

3. **No managed-file marker** is written when skills fall back to copy mode.
   Copied skill directories have no indicator that AXM owns them, unlike the
   `<!-- Managed by axm — see "axm <type> --help" -->` marker convention
   established for commands and subagents.

### Current state

| Concern                | Status                                                  |
| ---------------------- | ------------------------------------------------------- |
| `--preview` on install | Done (spec'd, implemented)                              |
| `--preview` on others  | Wired (flag + handler + resolvePlan plumbing)           |
| Preview plan content   | Shows step labels; does not show per-agent file details |
| Symlink fallback       | Works; records `mode: "copy"` in install result         |
| Rendered-file tracking | None (lockfile has no `renderedFiles` for skills)       |
| Managed marker on copy | None                                                    |

## Goals / Non-Goals

**Goals:**

- Verify `--preview` works end-to-end on `uninstall`, `update`, `enable`,
  `disable` — add tests covering preview behavior
- When skills fall back to copy (no symlink support), use the shared
  rendered-extension tracking: managed marker comment in the copied `SKILL.md`,
  source hash in lockfile `renderedFiles`
- Skills copy-mode cleanup (uninstall, disable) uses lockfile `renderedFiles`
  paths for reliable deletion

**Non-Goals:**

- Changing the symlink-first strategy (copy remains a fallback only)
- Adding rendered-file tracking for symlinked skills (symlinks are already
  reliable — the target is the canonical source). Note: symlinked skills from
  registry/git sources still get the managed marker in `SKILL.md` for
  discoverability — this is about lockfile `renderedFiles` tracking, not markers.
- Enriching preview output with per-file details (the plan-based preview is
  sufficient for skills; commands/subagents benefit more from file-level preview
  because their rendering varies by agent format)

## Decisions

### 1. No new `--preview` plumbing needed

The `--preview` flag, handler wiring, and `resolvePlan` integration already
exist for all four commands. The work is verification and testing, not
implementation.

**What's needed:** E2E or integration tests confirming that `--preview` on each
command displays the plan and returns `PreviewedPlan` without applying changes.

### 2. Rendered-file tracking for copy-mode skills

When a skill installs in copy mode (symlink fallback), the lockfile entry gains
a `renderedFiles` map — the same shared type used by commands and subagents.

```typescript
// SkillLockEntry gains optional renderedFiles + sourceHash (only populated in copy mode)
// Uses the same shared type as commands and subagents.
renderedFiles: Schema.optional(
  Schema.Record({
    key: Schema.String,  // agent ID
    value: Schema.Array(
      Schema.Struct({
        path: Schema.String, // copied file/directory path
      }),
    ),
  }),
),
sourceHash: Schema.optional(Schema.String), // hash of canonical skill source
```

The `renderedFiles` map uses an array per agent — the same shape as commands and
subagents. For skills in copy mode, each agent typically has one entry (the
copied directory), but the array shape keeps the shared infrastructure uniform.
The `sourceHash` lives at the lock entry level (not per rendered file) since all
agents share the same canonical source.

When installed via symlink, both `renderedFiles` and `sourceHash` are omitted
(symlinks don't need tracking — the link target is the canonical source). This
keeps the common case (symlinks work) lightweight.

### 3. Managed marker in SKILL.md

The managed marker is prepended to `SKILL.md` in two cases:

1. **Materialization from registry/git** — when AXM extracts or clones a skill
   to `.axm/extensions/`, it owns that copy. The marker is added to the
   materialized `SKILL.md` at extraction time. This means the marker is visible
   both in the canonical source and through any symlinks pointing to it,
   providing consistent discoverability regardless of install mode.

2. **Copy-mode fallback** — when symlinks aren't supported, the copied
   `SKILL.md` inherits the marker from the materialized source (since it was
   already added during materialization).

```markdown
<!-- Managed by axm — see "axm skills --help" -->
```

The marker is an HTML comment, invisible to agents reading the markdown. It
serves the same purpose as the managed marker in rendered command/subagent
files — conflict detection on install and discoverability for users browsing
their repo.

**Local refs are excluded.** When the source is a local path, `.axm/extensions/`
symlinks to the author's directory. AXM does not modify the author's source
files — the symlink into `.axm/extensions/` is sufficient proof of AXM
ownership.

**Fork/new strips the marker.** When `axm skills fork` copies from a
materialized source that already contains the managed marker, the forked
`SKILL.md` SHALL have the marker stripped — the user now owns the file. Similarly,
`axm skills new` SHALL NOT include the managed marker in scaffolded output.

**Alternatives considered:**

- (a) `.axm-managed` sentinel file in directory — rejected; introduces a
  separate mechanism from commands/subagents when an in-file marker works
  identically for markdown
- (b) No marker, rely on lockfile only — rejected; lockfile tracks intent but
  can't detect pre-existing manual files at the target path
- (c) Marker only in copy mode — rejected; misses the discoverability benefit
  for symlinked skills from registry/git sources

### 4. Shared rendered-extension types

The `renderedFiles` map schema, source hash computation, and conflict detection
logic are shared across skills (copy mode), commands, and subagents. These are
created during command-support implementation and live in shared modules under
`core/unstable/extensions/`:

| Module                  | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `rendered-files.ts`     | `RenderedFilesMapSchema`, `sourceHash` computation, path-based cleanup            |
| `managed-marker.ts`     | `generateMarker(type, format)`, `isManagedByAxm(content)`, `stripMarker(content)` |
| `conflict-detection.ts` | Pre-write conflict check (marker-based ownership detection)                       |

Skills opt into these shared types when operating in copy mode. The
`--preview` verification work has no dependency on the shared infrastructure
and can proceed independently.

**Implementation sequencing:** This change is implemented after command-support
(which creates the shared infrastructure) and subagent-support (which validates
it with a second extension type). Skills-alignment is the smallest change and
benefits from stable, proven shared types.

## Risks / Trade-offs

**[Copy-mode is rare] → Minimal real-world impact**
Most systems support symlinks. The copy-mode tracking is a correctness
improvement for an uncommon path. Low risk of regression since the common
symlink path is unchanged.

**[Lockfile schema addition] → No migration concern**
`renderedFiles` is optional on `SkillLockEntry`. Existing lockfiles without it
parse fine. No migration needed.

**[Marker in copied SKILL.md] → Invisible to agents**
The `<!-- Managed by axm — see "axm skills --help" -->` comment is an HTML
comment, invisible to agents reading the markdown as content. This is the same
approach used by commands and subagents for their rendered files.
