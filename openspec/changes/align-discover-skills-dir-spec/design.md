## Context

We have a working 3-phase skill discovery implementation (`discover-skills.ts`, `parse-skill-md.ts`, `parse-manifests.ts`) and a spec (`cli-skills-install-discover-skills-dir/spec.md`). The proposal identifies functional gaps between our spec/implementation and a reference implementation of the same algorithm. This design covers how to align both the spec and implementation.

**Current state of our implementation vs. gaps identified:**

| Gap                                      | Our Spec         | Our Implementation                                                                      | Needed         |
| ---------------------------------------- | ---------------- | --------------------------------------------------------------------------------------- | -------------- |
| Phase 1 parse-failure fallthrough        | Silent           | Correct (falls through)                                                                 | Spec fix only  |
| Missing priority dirs                    | Missing 2        | Missing 2                                                                               | Both           |
| Phase 2 sequential processing            | Unspecified      | **Parallel** (`concurrency: "unbounded"`)                                               | Both           |
| Phase 2 directory-type check             | Implied          | Correct (checks `stat.type`)                                                            | Spec fix only  |
| Phase 3 depth semantics                  | Ambiguous        | Correct (`depth > MAX_DEPTH`)                                                           | Spec fix only  |
| Phase 3 concurrency model                | Says "DFS"       | Concurrent (`concurrency: "unbounded"`)                                                 | Spec fix only  |
| SKIP_DIRS scope                          | Unspecified      | Correct (Phase 3 only)                                                                  | Spec fix only  |
| Internal / seenNames interaction         | Unspecified      | **Wrong** (dedup after filter, but phase 2 runs parallel so order is non-deterministic) | Both           |
| Case-sensitive SKILL.md                  | Case-insensitive | **Case-insensitive** (regex `/^skill\.md$/i`)                                           | Both           |
| `rawContent` field                       | Missing          | Missing                                                                                 | Both           |
| Regular file check                       | Missing          | Correct (checks `stat.type`)                                                            | Spec fix only  |
| Output type definition                   | Missing          | Partially defined                                                                       | Spec fix only  |
| `INSTALL_INTERNAL_SKILLS` accepts "true" | Only "1"         | Only "1"                                                                                | Both           |
| Plugin: `pluginRoot` validation          | Missing          | N/A (simplified schema)                                                                 | Both           |
| Plugin: conventional `skills/` dir       | Missing          | Missing                                                                                 | Both           |
| Plugin: omitted `source`                 | Missing          | N/A (simplified schema)                                                                 | Both           |
| Plugin: object `source` skipped          | Missing          | N/A (simplified schema)                                                                 | Both           |
| Plugin: manifests additive               | Unspecified      | Correct (both parsed)                                                                   | Spec fix only  |
| Plugin: `dirname` transformation         | Missing          | Correct (`validatePath` returns dirname)                                                | Spec fix only  |
| Post-discovery utilities                 | Missing          | Missing                                                                                 | New capability |

## Goals / Non-Goals

**Goals:**

- Align the spec with all critical and important gaps from the proposal
- Fix the two implementation bugs found (Phase 2 parallel → sequential, case-insensitive → case-sensitive)
- Add `rawContent` to the Skill type and parsing
- Expand the priority directory list
- Accept `"true"` for `INSTALL_INTERNAL_SKILLS`
- Expand plugin manifest support to match reference (pluginRoot, omitted source, object source, conventional skills/ dir)
- Create new `cli-skills-install-post-discovery` spec for display name, filtering, and sanitization
- Ensure linting passes after all changes

**Non-Goals:**

- Backward compatibility with previous behavior
- Lock file / hash mechanism changes (separate concern, already handled by `getTreeSha`)
- Clone configuration changes (timeout, depth, ref — already correct)
- Performance optimizations beyond what the spec requires

## Decisions

### Decision 1: Phase 2 must be sequential

**Choice:** Change Phase 2 from `concurrency: "unbounded"` to `concurrency: 1` (sequential).

**Why:** The `seenNames` deduplication in our implementation happens _after_ all phases complete (lines 334-339 of `discover-skills.ts`). With parallel Phase 2, the order skills are discovered is non-deterministic — if two priority directories contain a skill with the same name, which one "wins" depends on I/O timing. Sequential processing ensures the directory list order is the tiebreaker, matching the reference behavior.

**Alternative considered:** Keep parallel Phase 2 and document that intra-phase dedup ordering is non-deterministic. Rejected because the priority directory list is intentionally ordered (e.g., `skills/` before `.claude/skills/`), and users would expect that ordering to be meaningful.

**Implementation:** Change `{ concurrency: "unbounded" }` to `{ concurrency: 1 }` in the `Effect.forEach` call at line 322-326. The `scanDirectory` helper itself can remain concurrent for entries _within_ a single directory (since those are within one priority dir and all go to the same "priority level").

### Decision 2: Case-sensitive SKILL.md matching

**Choice:** Replace the regex `/^skill\.md$/i` with exact string comparison `=== "SKILL.md"`.

**Why:** The case-insensitive approach uses `readdir()` + regex on every directory. The reference uses `stat()` with the exact filename, which is a single syscall. Since `SKILL.md` is the universal convention and no ecosystem uses alternative casing, the complexity is unjustified.

**Implementation impact:** `tryParseSkillInDir` currently does `readdir()` + find, which is needed for case-insensitive matching. With exact matching, we could switch to direct `stat()` (like the reference), but `readdir()` with exact match is also fine and avoids a refactor of the existing flow. The minimal change: replace the regex test with `entry === "SKILL.md"`.

### Decision 3: Add `rawContent` to Skill type

**Choice:** Add `rawContent: string` to the `Skill` interface, populated with the full file content (including frontmatter delimiters).

**Why:** Needed downstream for content-based hashing in the lock file. The reference stores the entire file text (pre-gray-matter parsing).

**Implementation:** Pass the raw content string through from `tryParseSkillInDir` → `parseSkillMd`. The `parseSkillMd` function receives the content string already — just return it alongside the parsed fields.

### Decision 4: Expand plugin manifest schemas to match reference

**Choice:** Align both `marketplace.json` and `plugin.json` schemas with the reference implementation's structure.

**Why:** Our current `marketplace.json` schema expects `{ plugins: Array<{ skillPath: string }> }` — a simplified form. The reference supports a richer structure with `metadata.pluginRoot`, per-plugin `source` (string, object, or omitted), and per-plugin `skills` arrays. Our implementation would miss skills in repos using the full manifest format.

**Changes to `parse-manifests.ts`:**

- `marketplace.json`: Support `metadata.pluginRoot` field with `./` validation (invalid → skip entire manifest). Support `plugins[].source` as string (must start with `./`), omitted (root-level), or object (skip). Support `plugins[].skills` array. Always add `{pluginBase}/skills/` for each plugin.
- `plugin.json`: Already close to reference. Keep current structure.
- Both manifests remain additive (already correct).

### Decision 5: Post-discovery utilities as a separate module

**Choice:** Create post-discovery utilities (`getSkillDisplayName`, `filterSkills`, `sanitizeName`) as a new spec and module, not added to the discovery spec.

**Why:** These are consumed by the install handler and UI layer, not by the discovery algorithm itself. Keeping them separate follows the feature co-location principle and avoids bloating the discovery spec with unrelated concerns.

**Location:** New spec `cli-skills-install-post-discovery`. Implementation in a new file alongside the install command handler (e.g., `skill-utils.ts` or similar).

### Decision 6: Keep Phase 3 concurrent

**Choice:** Keep Phase 3 with `concurrency: "unbounded"` at each recursive level.

**Why:** Phase 3 is a fallback that only runs when Phases 1-2 found nothing or `fullDepth` is true. It's the most expensive phase, and concurrency helps performance. Within Phase 3, `seenNames` dedup order is less important because it's the lowest-priority phase — anything found here would lose to a Phase 1 or Phase 2 result anyway. The reference implementation also uses `Promise.all` at each level.

### Decision 7: Internal skills do not consume seenNames

**Choice:** Ensure filtered-out internal skills do NOT add their name to the `seenNames` set.

**Why:** If an internal skill is filtered out but consumes the name, a non-internal skill with the same name later in discovery would be silently dropped. This would be surprising — the user would see neither the internal nor the non-internal version.

**Current state:** Our implementation deduplicates _after_ all phases in a single filter pass (lines 334-339). Internal skill filtering happens inside `shouldIncludeSkill` during each phase. A filtered internal skill is never added to any phase's results, so it never reaches the dedup filter and never consumes a name. **This is already correct.** The spec just needs to document this explicitly.

## Risks / Trade-offs

**Phase 2 sequential processing — performance regression:**
Switching from parallel to sequential Phase 2 will increase discovery time when many priority directories exist (~30 dirs). Each directory requires a `readdir()` + per-entry `stat()`.
→ _Mitigation:_ Non-existent directories fail fast. Most repos will only have 1-3 priority directories with actual content. The reference implementation is sequential and performs adequately.

**Case-sensitive SKILL.md — ecosystem compatibility:**
Switching to exact match could break repos that use `skill.md` or `Skill.md`.
→ _Mitigation:_ No known ecosystem uses alternative casing. The `SKILL.md` convention is universal. This matches the reference implementation.

**Plugin manifest schema expansion — complexity:**
The full manifest schema is significantly more complex than our current simplified version.
→ _Mitigation:_ Effect Schema makes validation straightforward. The reference code is ~50 lines for the full parser. We can use lenient schemas (optional fields with defaults) to handle partial manifests gracefully.

**`rawContent` memory overhead:**
Storing the full file content for every discovered skill increases memory usage.
→ _Mitigation:_ SKILL.md files are typically small (< 10KB). Even with 100 skills, this is negligible. The content is needed for downstream hashing anyway.
