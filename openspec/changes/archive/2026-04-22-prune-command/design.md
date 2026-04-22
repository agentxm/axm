## Context

Stale extension artifacts accumulate in workspaces when skills, commands, or subagents are removed from settings but their on-disk artifacts remain. The lint engine detects these as "stale" findings in `skills-artifacts-clean` (and equivalent rules for other extension types), but deliberately treats them as advisory — lint auto-deleting files would be too aggressive.

Users currently must manually `rm -rf` each stale artifact directory. The universal skills directory (`.agents/skills/`) is entirely skipped by the stale check, hiding genuinely orphaned artifacts.

The workspace classifier (`classifier.ts`) already categorizes extensions into configured, implicit, unmanaged, and ignored. For skills, `detectSkillNamesOnDisk` scans agent directories to build the `detectedNames` input. The classifier returns name-level classifications — prune needs to map unmanaged names back to their on-disk artifact paths for deletion.

## Goals / Non-Goals

**Goals:**

- Provide a deliberate, confirmable command to remove stale extension artifacts
- Use the workspace classifier as the single source of truth for identifying unmanaged extensions
- Fix universal skills directory to participate in stale detection
- Support glob-based filtering for targeted pruning

**Non-Goals:**

- Removing configured-but-disabled extensions (those are managed state, not stale)
- Removing dangling artifacts (configured+enabled but canonical source missing — that's a lint autofixable concern, not prune)
- Interactive per-artifact accept/reject (batch confirmation is sufficient for v1)
- Pruning lockfile entries (prune operates on artifacts only; lockfile cleanup is reconciliation's job)

## Decisions

### 1. Use the workspace classifier for detection

**Decision:** Use the existing workspace classifier (`classifyExtensions`) as the detection mechanism. Prune filters for `lifecycle: "unmanaged"` entries, then maps each unmanaged name to its on-disk artifact paths via agent directory configs. Lint stale-artifact rules should also be updated to consume the classifier instead of maintaining inline detection logic.

**Rationale:** The classifier already defines what "unmanaged" means — detected on disk, not configured, not implicit (lockfile native), not ignored. This is exactly the definition of "prunable." No new detection module is needed. The classifier is already the single source of truth for extension lifecycle classification.

**Shape:** Prune calls `getClassifiedExtensions(type)` → filters for `lifecycle: "unmanaged"` → reads artifact paths from the classified entry → deletes.

**Classifier change:** `ClassifierInput.detectedNames` (currently `ReadonlyArray<string>`) becomes `detectedEntries: ReadonlyArray<{ name: string; locations: ReadonlyArray<string> }>` to carry on-disk paths through classification. Locations are **relative to the workspace root** — absolute paths can be reconstituted by joining with the workspace root when needed (e.g., for deletion), but relative paths are better for display, serialization, and testing. The classifier attaches locations to unmanaged `ClassifiedExtension` entries so consumers don't need to re-scan. This is a natural fit: `detectSkillNamesOnDisk` already discovers `{ skill: { name }, location }` from `discoverSkillsInDir` but currently discards the locations at line 307 of `service.ts`.

**Alternative considered:** Extracting a new shared detection module from lint rules. Rejected because the classifier already provides the right abstraction, and enriching its output with locations is simpler than creating a parallel detection system.

### 2. Fix universal skills directory stale detection

**Decision:** Migrate lint stale-artifact detection to use the workspace classifier instead of inline per-agent logic. This eliminates the blanket `continue` skip for `.agents/skills/` without needing a replacement heuristic.

**Rationale:** The current lint rule walks per-agent directories and checks each artifact against that agent's declared skills. This per-agent view creates false positives for the universal dir (an artifact valid for agent A looks stale from agent B's perspective), which motivated the skip. The classifier doesn't have this problem — it operates at the workspace level: `detectSkillNamesOnDisk` already scans all agent directories (including `.agents/skills/`), dedupes, and evaluates names against all configured extensions. If a name is unmanaged at the workspace level, all its artifacts are genuinely stale.

**Impact:** Users with stale artifacts in `.agents/skills/` will see new lint findings and prune candidates. This is correct behavior, not a regression.

### 3. Command structure

**Decision:** Skills-only in v1:

```
axm prune [patterns...] [--yes]           # all extension types (skills-only in v1)
axm skills prune [patterns...] [--yes]    # skills only
```

Patterns are optional glob filters applied to extension names (e.g., `effect-*`, `legacy-*`). When no patterns are given, all stale artifacts are candidates.

`axm prune` is the workspace-wide entry point. It uses the same per-type collector/aggregation pattern as `axm install` (see `workspace-install.ts`): type-specific collectors run in parallel, results are merged. In v1, only the skills collector produces results since disk detection (`detectSkillNamesOnDisk`) is only wired up for skills — other type collectors return empty. Scoped commands for other types (`axm commands prune`, `axm subagents prune`) will be added as their disk detection is implemented.

**Rationale:** Ship what works now with the aggregation architecture already in place. The classifier is generic — extending to other types later requires adding `detectCommandsOnDisk` / `detectSubagentsOnDisk` and a collector, not changing the prune command's architecture.

**Alternative considered:** A single `axm prune --type skills` flag. Rejected because subcommands under each extension type are more discoverable and consistent with existing `axm skills install/uninstall/list` patterns.

### 4. Confirmation UX

**Decision:** Default behavior is preview-then-confirm:

1. Detect stale artifacts (filtered by patterns if provided)
2. Display a grouped list showing what will be removed (artifact name, path, extension type)
3. Prompt: "Remove N artifacts? (y/N)"
4. `--yes` skips the prompt

When nothing to prune, print a clean message and exit 0.

**Rationale:** Destructive operations need explicit confirmation. The preview lets users verify before acting. `--yes` enables scripting and agent workflows.

### 5. Deletion mechanism

**Decision:** Prune reads artifact paths directly from the classifier's unmanaged entries (which now carry locations), then removes those directories. It does not modify settings.json or the lockfile. It does not emit operations through the plan pipeline.

**Rationale:** Stale artifacts by definition are not in settings. Lockfile entries for unmanaged artifacts don't exist (they were never installed via axm). The plan pipeline is designed for install/enable/disable operations with source resolution — prune is simpler: classify (paths included), delete. Using `effect/FileSystem` `remove` with `recursive: true` on the artifact directory is sufficient. No second disk scan needed.

**Alternative considered:** Routing through the plan pipeline with `uninstall-*` operations. Rejected because uninstall operations expect the extension to be in settings/lockfile for source resolution, which stale artifacts aren't.

### 6. Exit codes

**Decision:**

- `0` — pruned successfully, nothing to prune, or user declined confirmation
- `1` — unexpected error (filesystem failure, workspace not initialized, etc.)

**Rationale:** "Nothing to prune" is a clean state, not an error — scripts shouldn't need to special-case it. User declining confirmation is a deliberate choice, not a failure.

### 7. JSON output

**Decision:** Support `--json` flag. With `--json` alone (no `--yes`), output the list of prunable artifacts as structured data without prompting or deleting — a read-only inspection mode. With `--yes --json`, prune and output what was removed.

**Rationale:** Low-cost since the data is already structured from the classifier. Useful for agents inspecting what's prunable before deciding to act, and consistent with other commands that support `--json`.

### 8. Lint advisory messages reference prune

**Decision:** Update lint `*-artifacts-clean` rules to: (a) consume the workspace classifier for stale detection instead of inline logic, and (b) include `axm prune` (or `axm skills prune <name>`) in the advisory suggestion text for stale findings.

**Rationale:** Lint and prune share the same definition of "unmanaged" via the classifier — no drift possible. The suggestion creates a clear workflow: `axm lint` surfaces issues → user runs `axm prune` to fix. The suggestion is actionable and copy-pasteable.

## Risks / Trade-offs

**[Accidental deletion of intentional unmanaged artifacts]** → Mitigated by the existing `settings.ignored` mechanism. Users can add glob patterns to `ignored.skills` etc. to protect artifacts they want to keep unmanaged. The classifier already excludes ignored names from the "unmanaged" set, so prune inherits this for free. The confirmation prompt provides a second safety net.

**[New lint findings from universal dir fix]** → Users with stale artifacts in `.agents/skills/` will see new warnings they didn't see before. This is correct behavior, not a regression. The advisory message will guide them to `axm prune`.

**[Glob pattern confusion]** → Patterns match extension names, not file paths. Document clearly. Use the same `expandGlob` matching that `settings.ignored` uses for consistency.
