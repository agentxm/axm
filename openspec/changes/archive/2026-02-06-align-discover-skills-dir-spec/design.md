## Context

We have a working 3-phase skill discovery implementation (`discover-skills.ts`, `parse-skill-md.ts`, `parse-manifests.ts`) and a spec (`cli-skills-install-discover-skills-dir/spec.md`). The proposal identifies functional gaps between our spec/implementation and a reference implementation of the same algorithm. This design covers how to align both the spec and implementation.

**Current state of our implementation vs. gaps identified:**

| Gap                                      | Our Spec                                           | Our Implementation                                                                       | Needed         |
| ---------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------- |
| Phase 1 parse-failure fallthrough        | Silent                                             | Correct (falls through)                                                                  | Spec fix only  |
| Missing priority dirs                    | Missing 31 agent dirs, 1 stale (`.copilot/skills`) | Missing 31 agent dirs, 1 stale                                                           | Both           |
| Priority dir ordering                    | `.` last                                           | `.` last (position 8)                                                                    | Both           |
| Phase 2 processing order                 | Unspecified                                        | **Parallel** (`concurrency: "unbounded"`) — functionally correct (preserves input order) | Spec fix only  |
| Phase 2 directory-type check             | Implied                                            | Correct (checks `stat.type`)                                                             | Spec fix only  |
| Phase 3 depth semantics                  | Ambiguous                                          | Correct (`depth > MAX_DEPTH`)                                                            | Spec fix only  |
| Phase 3 concurrency model                | Says "DFS"                                         | Concurrent (`concurrency: "unbounded"`)                                                  | Spec fix only  |
| SKIP_DIRS scope                          | Unspecified                                        | Correct (Phase 3 only)                                                                   | Spec fix only  |
| Internal / seenNames interaction         | Unspecified                                        | Correct (dedup after filter, order preserved by `Effect.forEach`)                        | Spec fix only  |
| Case-sensitive SKILL.md                  | Case-insensitive                                   | **Case-insensitive** (regex `/^skill\.md$/i`)                                            | Both           |
| Regular file check                       | Missing                                            | Correct (checks `stat.type`)                                                             | Spec fix only  |
| Output type definition                   | Missing                                            | Partially defined                                                                        | Spec fix only  |
| `INSTALL_INTERNAL_SKILLS` accepts "true" | Only "1"                                           | Only "1"                                                                                 | Both           |
| Plugin: `pluginRoot` validation          | Missing                                            | N/A (simplified schema)                                                                  | Both           |
| Plugin: conventional `skills/` dir       | Missing                                            | Missing                                                                                  | Both           |
| Plugin: omitted `source`                 | Missing                                            | N/A (simplified schema)                                                                  | Both           |
| Plugin: object `source` skipped          | Missing                                            | N/A (simplified schema)                                                                  | Both           |
| Plugin: manifests additive               | Unspecified                                        | Correct (both parsed)                                                                    | Spec fix only  |
| Plugin: `dirname` transformation         | Missing                                            | Correct (`validatePath` returns dirname)                                                 | Spec fix only  |
| Post-discovery utilities                 | Missing                                            | Missing                                                                                  | New capability |

## Goals / Non-Goals

**Goals:**

- Align the spec with all critical and important gaps from the proposal
- Fix implementation bugs (case-insensitive → case-sensitive SKILL.md matching, priority dir ordering, priority dir coverage)
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

### Decision 1: Keep Phase 2 concurrent (functionally equivalent)

**Choice:** Keep Phase 2 with `concurrency: "unbounded"`.

**Why:** `Effect.forEach` preserves input order regardless of concurrency — results are returned in the order of the input array, not I/O completion order. Post-hoc dedup over these ordered results is functionally equivalent to the reference implementation's inline sequential dedup. The priority directory list ordering is respected because earlier directories appear first in the result array and therefore win dedup.

**Previous analysis was incorrect:** The earlier concern that parallel processing produces non-deterministic dedup was wrong. Effect's `forEach` with concurrency runs operations in parallel but collects results in input order. This means `seenNames` dedup is deterministic and order-preserving.

**Implementation:** No change needed to the `Effect.forEach` concurrency setting.

### Decision 2: Derive priority directories from AgentConfig registry

**Choice:** Replace the hardcoded `PRIORITY_DIRECTORIES` with a derived list combining non-agent static dirs and agent-specific dirs from the registry.

**Why:** The current 8-entry hardcoded list covers only 5 of the 36 unique agent `skills.dir` values. The remaining 31 agent directories (`.codex/skills`, `.gemini/skills`, `.roo/skills`, `.github/skills`, etc.) are only discoverable via Phase 3 recursive fallback, which is slower and lower-priority. Additionally, `.copilot/skills` is in the list but has no corresponding `AgentConfig` — it's stale.

**Composition:**

1. **`.`** (searchPath) — always first, highest priority
2. **Non-agent static dirs:** `skills/.curated`, `skills/.experimental`, `skills/.system` — curated/special directories not tied to a specific agent
3. **Agent dirs:** derived from `getAllAgents()` → unique `skills.dir` values, deduplicated (some agents share dirs, e.g., `amp`, `kimi-cli`, `replit` all use `.agents/skills`; `trae` and `trae-cn` share `.trae/skills`)

**Implementation:** Replace the `PRIORITY_DIRECTORIES` constant with a function that computes the list at module level. Use `Array.dedupe` (or equivalent) to remove duplicates from agent dirs. The `skills` dir from OpenClaw's config naturally appears in agent dirs, so it doesn't need to be in the static list separately.

**Stale entry removal:** `.copilot/skills` is removed — no agent uses it. If a `github-copilot` agent were to be updated, it would use `.github/skills` (which GitHub Copilot's current config already specifies).

### Decision 3: Priority directory ordering — `.` first

**Choice:** Move `.` (searchPath) to position 1 in the priority directory list.

**Why:** The current list has `.` last (position 8). This means a skill at the repo root loses dedup priority to the same skill in `skills/` or `.claude/skills/`. The reference implementation treats searchPath as highest priority. A skill author placing a `SKILL.md` at the root of their repo expects it to be the canonical entry.

**Implementation:** The derived priority list (Decision 2) naturally places `.` first.

### Decision 4: Case-sensitive SKILL.md matching

**Choice:** Replace the regex `/^skill\.md$/i` with exact string comparison `=== "SKILL.md"`.

**Why:** The case-insensitive approach uses `readdir()` + regex on every directory. The reference uses `stat()` with the exact filename, which is a single syscall. Since `SKILL.md` is the universal convention and no ecosystem uses alternative casing, the complexity is unjustified.

**Implementation impact:** `tryParseSkillInDir` currently does `readdir()` + find, which is needed for case-insensitive matching. With exact matching, we could switch to direct `stat()` (like the reference), but `readdir()` with exact match is also fine and avoids a refactor of the existing flow. The minimal change: replace the regex test with `entry === "SKILL.md"`.

### Decision 5: Expand plugin manifest schemas to match reference

**Choice:** Align both `marketplace.json` and `plugin.json` schemas with the reference implementation's structure.

**Why:** Our current `marketplace.json` schema expects `{ plugins: Array<{ skillPath: string }> }` — a simplified form. The reference supports a richer structure with `metadata.pluginRoot`, per-plugin `source` (string, object, or omitted), and per-plugin `skills` arrays. Our implementation would miss skills in repos using the full manifest format.

**Changes to `parse-manifests.ts`:**

- `marketplace.json`: Support `metadata.pluginRoot` field with `./` validation (invalid → skip entire manifest). Support `plugins[].source` as string (must start with `./`), omitted (root-level), or object (skip). Support `plugins[].skills` array. Always add `{pluginBase}/skills/` for each plugin.
- `plugin.json`: Already close to reference. Keep current structure.
- Both manifests remain additive (already correct).

### Decision 6: Post-discovery utilities as a separate module

**Choice:** Create post-discovery utilities (`getSkillDisplayName`, `filterSkills`, `sanitizeName`) as a new spec and module, not added to the discovery spec.

**Why:** These are consumed by the install handler and UI layer, not by the discovery algorithm itself. Keeping them separate follows the feature co-location principle and avoids bloating the discovery spec with unrelated concerns.

**Location:** New spec `cli-skills-install-post-discovery`. Implementation in a new file alongside the install command handler (e.g., `skill-utils.ts` or similar).

### Decision 7: Keep Phase 3 concurrent

**Choice:** Keep Phase 3 with `concurrency: "unbounded"` at each recursive level.

**Why:** Phase 3 is a fallback that only runs when Phases 1-2 found nothing or `fullDepth` is true. It's the most expensive phase, and concurrency helps performance. Within Phase 3, `seenNames` dedup order is less important because it's the lowest-priority phase — anything found here would lose to a Phase 1 or Phase 2 result anyway. The reference implementation also uses `Promise.all` at each level.

### Decision 8: Internal skills do not consume seenNames

**Choice:** Ensure filtered-out internal skills do NOT add their name to the `seenNames` set.

**Why:** If an internal skill is filtered out but consumes the name, a non-internal skill with the same name later in discovery would be silently dropped. This would be surprising — the user would see neither the internal nor the non-internal version.

**Current state:** Our implementation deduplicates _after_ all phases in a single filter pass (lines 334-339). Internal skill filtering happens inside `shouldIncludeSkill` during each phase. A filtered internal skill is never added to any phase's results, so it never reaches the dedup filter and never consumes a name. **This is already correct.** The spec just needs to document this explicitly.

## Risks / Trade-offs

**Larger priority directory list — more I/O:**
Deriving from the AgentConfig registry increases the priority list from 8 to ~40 entries. Each directory requires a `readdir()` + per-entry `stat()`.
→ _Mitigation:_ Non-existent directories fail fast (single `stat` call). Phase 2 runs concurrently, so I/O overlaps. Most repos will only have 1-3 priority directories with actual content.

**Case-sensitive SKILL.md — ecosystem compatibility:**
Switching to exact match could break repos that use `skill.md` or `Skill.md`.
→ _Mitigation:_ No known ecosystem uses alternative casing. The `SKILL.md` convention is universal. This matches the reference implementation.

**Plugin manifest schema expansion — complexity:**
The full manifest schema is significantly more complex than our current simplified version.
→ _Mitigation:_ Effect Schema makes validation straightforward. The reference code is ~50 lines for the full parser. We can use lenient schemas (optional fields with defaults) to handle partial manifests gracefully.
