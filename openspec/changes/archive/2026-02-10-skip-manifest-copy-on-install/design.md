## Context

Managed extensions (registry-sourced or forked) currently store everything — skill content files and the `axm-skill.json` manifest — in a single flat directory at `.axm/extensions/@<namespace>/skills/<name>/`. When `installForAgent` creates symlinks (or copy fallbacks) for each agent, it targets this entire directory. Agents that ingest all files in their skills folder end up seeing `axm-skill.json`, which is axm-internal metadata they have no use for.

The current layout:

```
.axm/extensions/@<namespace>/skills/<name>/
  axm-skill.json
  SKILL.md
  other-files...
```

All operations — fork, publish, install, uninstall — assume skill content and manifest are co-located in the same directory.

## Goals / Non-Goals

**Goals:**

- Separate the manifest (`axm-skill.json`) from skill content so agents only see content files.
- Preserve whole-directory symlink behavior (no per-file symlinking).
- Minimal changes to the install/uninstall pipeline.

**Non-Goals:**

- Changing the non-managed skill layout (`.agents/skills/<name>/` is unaffected).
- Backward compatibility with the old layout — existing managed extensions will need re-fork/re-install.
- Changing the manifest schema itself.

## Decisions

### Decision 1: Introduce `src/` subdirectory for skill content

**Layout:**

```
.axm/extensions/@<namespace>/skills/<name>/
  axm-skill.json        # manifest (package root)
  src/                   # skill content
    SKILL.md
    ...
```

Agent symlinks target `<canonical>/src/` instead of `<canonical>/`.

**Why `src/` over alternatives:**

- **Sibling manifests directory** (`manifests/<name>.json`): Splits a single extension across two directory trees, making it harder to reason about what belongs to a skill. Deletion/cleanup requires coordinating two paths.
- **Sibling file** (`<name>.json` next to `<name>/`): Naming collision risk, fragile coupling between a file and directory sharing the same base name.
- **`src/`**: Keeps everything under one extension root. The manifest is a sibling of `src/`, following the common pattern of package root metadata alongside a content directory. Simple to understand, simple to clean up (remove the parent directory).

### Decision 2: Fork writes content to `src/`

`forkSkill` changes:

- `copySkillDirectory(sourcePath, targetDir)` → `copySkillDirectory(sourcePath, path.join(targetDir, "src"))`
- Manifest is written to `path.join(targetDir, MANIFEST_FILENAME)` (unchanged — already at package root since `targetDir` is the extension root).

The manifest write path doesn't change because `targetDir` is already the extension root. Only the copy destination shifts down one level.

### Decision 3: Publish archives `src/` content only

`publishSkill` changes:

- `buildZipArchive(extensionDir)` → `buildZipArchive(path.join(extensionDir, "src"))`

The archive contains skill content files at the root of the zip (same as today), not the manifest. The manifest metadata is already transmitted via the `VersionEntry` during publish, so it doesn't need to be in the archive.

This also means the archive is cleaner — it only contains files the consumer needs.

### Decision 4: Install symlinks `src/` to agent directories

`installSkill` changes:

- For **registry sources**: the `canonicalPath` remains the extension root (`.axm/extensions/@<namespace>/skills/<name>/`). A new `contentPath` is derived as `path.join(canonicalPath, "src")`.
  - `copySkillDirectory` copies into `contentPath` (non-self-copy case).
  - `installForAgent` receives `contentPath` instead of `canonicalPath` for the symlink/copy target.
- For **non-registry sources**: behavior is unchanged — `canonicalPath` is `.agents/skills/<name>/` with no `src/` subdirectory.
- The **self-copy detection** (fork workflow) compares `sourcePath` against `contentPath` for registry sources.

### Decision 5: Uninstall requires no changes

Uninstall already removes entire directories:

- Agent symlinks/dirs are removed by path (`agent.skills.dir/<name>/`).
- Canonical directories are removed recursively (`.axm/extensions/@<namespace>/skills/<name>/`).

Since the `src/` subdirectory is inside the canonical directory, removing the parent removes everything. No changes needed.

### Decision 6: `copySkillDirectory` exclusion list unchanged

The `copySkillDirectory` function doesn't need `axm-skill.json` added to its exclusion list. Since fork now copies into `src/` and the manifest is written separately to the parent, `copySkillDirectory` never encounters the manifest file during normal operation. For the install copy-fallback path, `installForAgent` copies from `contentPath` (`src/`), which also doesn't contain the manifest.

## Risks / Trade-offs

**Existing managed extensions break** → Expected and acceptable (backward compatibility is a non-goal). Users must re-fork and re-install. The pre-clean step in `installSkill` already handles removing old layouts.

**Registry archives change format** → Archives now contain only `src/` content. Previously published archives included `axm-skill.json`. Install must extract into `src/` regardless. Since the archive format is content-at-root (no enclosing directory), this works naturally — `copySkillDirectory(sourcePath, contentPath)` extracts into the right place.

**Self-copy detection path changes** → The fork → install pipeline's self-copy optimization (`isSelfCopy`) needs to compare against `contentPath` for registry sources. If this comparison is wrong, files get unnecessarily re-copied (harmless but wasteful).
