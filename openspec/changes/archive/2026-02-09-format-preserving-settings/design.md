## Context

axm manages `.axm/settings.json` inside user projects. The `SettingsService` mutations (`addSkill`, `removeSkill`, `addAgent`) follow a read-modify-write cycle: read the file, modify the in-memory `Settings` object, then call `writeSettings` which serializes the entire object with `JSON.stringify(settings, null, 2)`. This overwrites the file's existing formatting with a hardcoded style.

User projects may enforce their own JSON formatting (Prettier, EditorConfig, IDE settings) — tabs vs spaces, different indent widths, trailing newlines, property ordering. A full re-serialization creates noisy diffs on every `axm` operation.

## Goals / Non-Goals

**Goals:**

- Mutations produce minimal diffs — only the changed property/value appears in `git diff`
- Existing file formatting (indentation, whitespace, newlines) is preserved outside the edit region
- New files get a sensible default format (2-space indent, trailing newline)
- The approach works regardless of the project's formatting rules

**Non-Goals:**

- Detecting or matching the project's formatter configuration (Prettier, EditorConfig, etc.)
- Supporting JSONC (comments) in settings files — settings.json is strict JSON
- Changing the lockfile write path (YAML, separate concern)
- Reformatting existing files to match any standard

## Decisions

### Decision 1: Use `jsonc-parser` for surgical edits

**Choice:** Adopt Microsoft's `jsonc-parser` library (`modify` + `applyEdits` API).

**Rationale:** `modify(text, path, value, options)` computes offset-based `Edit` operations against the raw JSON text. `applyEdits(text, edits)` applies them. Content outside the edit region is untouched byte-for-byte. This is the same engine VS Code uses for `settings.json` editing — battle-tested and zero-dependency.

**Alternatives considered:**

- _Detect-and-match formatting_ (`detect-indent` + `detect-newline` + `JSON.stringify`): Still re-serializes the whole file. Can't preserve property ordering, spacing around colons, or trailing commas. Lossy.
- _Custom text manipulation_: Error-prone for nested JSON paths, edge cases around escaping, arrays, etc. Reinventing what `jsonc-parser` already solves.

### Decision 2: Detect formatting from existing file content

**Choice:** When editing an existing file, detect `tabSize`, `insertSpaces`, and `eol` from the file's current content and pass them as `FormattingOptions` to `modify()`. This ensures newly inserted content matches the file's existing style.

**Approach:** Simple heuristic — scan the first indented line to determine tab character and size. Detect line endings from the file content. Fall back to defaults (2-space indent, `\n`) if the file is empty or has no indentation.

**Why:** `jsonc-parser` uses `FormattingOptions` to format _newly inserted_ content. Without detection, inserts would use our defaults, creating mixed formatting within the same file.

### Decision 3: Introduce a `modifyJsonFile` utility in settings module

**Choice:** Create a `modifyJsonFile` function that encapsulates the read → detect format → compute edits → apply → write cycle. The `SettingsService` mutations call this instead of the current read → modify object → `writeSettings` cycle.

**Signature concept:**

```
modifyJsonFile(path, modifications) → Effect<void, SettingsWriteError>
```

Where `modifications` is an array of `{ path: JSONPath, value: unknown }` — allowing multiple edits in a single read-write cycle (e.g., `addSkill` sets one key in the skills map).

**Why a utility, not inline:** All three mutations need the same detect-edit-write logic. A shared function avoids duplication while keeping it scoped to the settings feature (not a cross-cutting utility).

### Decision 4: Keep `writeSettings` for full-file writes

**Choice:** Retain `writeSettings` for cases that write the entire settings object (e.g., `init` creating a new file). Add trailing newline to match formatter expectations.

**Why:** `jsonc-parser` edits are for mutations on existing files. Creating a brand-new file from a `Settings` object is still best served by `JSON.stringify` + trailing newline.

### Decision 5: Mutations operate on JSON paths, not Settings objects

**Choice:** Refactor mutations to express their intent as JSON path operations:

- `addSkill("code-review", "...")` → `modify(text, ["skills", "code-review"], "...")`
- `removeSkill("code-review")` → `modify(text, ["skills", "code-review"], undefined)`
- `addAgent("cursor")` → read current agents array, append, `modify(text, ["agents"], updatedArray)`

**Why:** This is the natural API for `jsonc-parser`. Each mutation knows its target path and value — it doesn't need to reconstruct the entire Settings object.

**Note on `addAgent`:** Since `jsonc-parser` doesn't support array-append natively, `addAgent` reads the current agents array value, appends the new ID, and sets the whole `["agents"]` path. This still produces a minimal diff (just the agents array changes, not the whole file).

## Risks / Trade-offs

**[Risk] `jsonc-parser` formats new insertions differently than the file's style** → Mitigated by detecting `FormattingOptions` from the existing file content before calling `modify`.

**[Risk] Concurrent file modification by external tools (IDE, formatter)** → Existing risk, unchanged. The semaphore serializes axm's own mutations but can't prevent external writes. This is acceptable — same limitation as before.

**[Risk] New dependency (`jsonc-parser`)** → Low risk. MIT license, zero dependencies, ~50KB, maintained by Microsoft, 30M+ weekly downloads. Used by VS Code, widely trusted.

**[Trade-off] `addAgent` replaces the full agents array** → Acceptable. The agents array is small (typically 1-5 entries). The diff shows the array changing but the rest of the file is untouched. A more surgical array-append would require manual text manipulation that isn't worth the complexity.
