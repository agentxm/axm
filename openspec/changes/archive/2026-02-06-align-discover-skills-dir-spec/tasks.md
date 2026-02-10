## 1. Spec Updates (spec-only fixes)

- [x] 1.1 Update `cli-skills-install-discover-skills-dir/spec.md` with Phase 1 parse-failure fallthrough scenarios
- [x] 1.2 Update spec with Phase 3 depth semantics clarification (0-indexed, `depth > maxDepth`, 6 levels inclusive)
- [x] 1.3 Update spec with Phase 3 concurrency model (concurrent per depth level, not DFS)
- [x] 1.4 Update spec with SKIP_DIRS scope (Phase 3 only)
- [x] 1.5 Update spec with Phase 2 directory-type entries only
- [x] 1.6 Update spec with internal skills / seenNames interaction (filtered internals do not consume names)
- [x] 1.7 Update spec with Phase 2 processing order note (concurrent, input-order-preserving)
- [x] 1.8 Update spec with plugin manifest additive behavior and dirname transformation
- [x] 1.9 Update spec with regular file check for SKILL.md
- [x] 1.10 Update spec with output Skill type definition (name, description, path, metadata)
- [x] 1.11 Update spec with path containment (`isContainedIn`) implementation note
- [x] 1.12 Update spec with Phase 3 re-scanning note (may revisit Phase 1/2 dirs, seenNames prevents dupes)
- [x] 1.13 Run `pnpm typecheck` and fix any errors
- [x] 1.14 Run `pnpm lint` and fix any errors
- [x] 1.15 Run `pnpm test` and fix any failures
- [x] 1.16 Run `pnpm test:e2e` and fix any failures
- [x] 1.17 Kill any vitest worker processes

## 2. Case-Sensitive SKILL.md Matching

- [x] 2.1 Write test: `SKILL.md` exact match is recognized; `skill.md` and `Skill.md` are not
- [x] 2.2 Change `SKILL_FILE_PATTERN` from `/^skill\.md$/i` regex to exact string `"SKILL.md"` comparison in `discover-skills.ts`
- [x] 2.3 Update all call sites that use `SKILL_FILE_PATTERN` regex matching to use exact string comparison
- [x] 2.4 Run `pnpm typecheck` and fix any errors
- [x] 2.5 Run `pnpm lint` and fix any errors
- [x] 2.6 Run `pnpm test` and fix any failures
- [x] 2.7 Run `pnpm test:e2e` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Priority Directory Derivation from AgentConfig Registry

- [x] 3.1 Write test: priority directories include `.` first, then static dirs, then agent dirs derived from registry
- [x] 3.2 Write test: `.copilot/skills` (stale) is NOT in priority directories
- [x] 3.3 Write test: agent dirs are deduplicated (agents sharing same `skills.dir` produce one entry)
- [x] 3.4 Replace hardcoded `PRIORITY_DIRECTORIES` with a function that derives the list: `.` first, then `skills/.curated`, `skills/.experimental`, `skills/.system`, then unique agent `skills.dir` values from `getAllAgents()`
- [x] 3.5 Remove stale `.copilot/skills` entry
- [x] 3.6 Run `pnpm typecheck` and fix any errors
- [x] 3.7 Run `pnpm lint` and fix any errors
- [x] 3.8 Run `pnpm test` and fix any failures
- [x] 3.9 Run `pnpm test:e2e` and fix any failures
- [x] 3.10 Kill any vitest worker processes

## 4. INSTALL_INTERNAL_SKILLS Accepts "true"

- [x] 4.1 Write test: `INSTALL_INTERNAL_SKILLS="true"` includes internal skills
- [x] 4.2 Update `shouldIncludeSkill` to accept both `"1"` and `"true"` for `INSTALL_INTERNAL_SKILLS` env var
- [x] 4.3 Run `pnpm typecheck` and fix any errors
- [x] 4.4 Run `pnpm lint` and fix any errors
- [x] 4.5 Run `pnpm test` and fix any failures
- [x] 4.6 Run `pnpm test:e2e` and fix any failures
- [x] 4.7 Kill any vitest worker processes

## 5. Plugin Manifest Schema Expansion

- [x] 5.1 Write tests for `marketplace.json` with `metadata.pluginRoot` — valid (`./` prefix) and invalid (no `./` prefix silences entire manifest)
- [x] 5.2 Write tests for `plugins[].source` — string source, omitted source (root-level), object source (skipped)
- [x] 5.3 Write tests for conventional `{pluginBase}/skills/` always added per plugin (even with empty/missing `skills` array)
- [x] 5.4 Write tests for `plugins[].skills` array with dirname transformation
- [x] 5.5 Update `marketplace.json` schema in `parse-manifests.ts` to support `metadata.pluginRoot`, per-plugin `source` (string/omitted/object), per-plugin `skills` array
- [x] 5.6 Implement `pluginRoot` validation: if present and doesn't start with `./`, skip entire manifest
- [x] 5.7 Implement source handling: string (must start with `./`), omitted (resolve to basePath + pluginRoot), object (skip plugin)
- [x] 5.8 Implement conventional `{pluginBase}/skills/` addition for each processed plugin
- [x] 5.9 Implement `plugins[].skills` dirname transformation for explicit skill paths
- [x] 5.10 Run `pnpm typecheck` and fix any errors
- [x] 5.11 Run `pnpm lint` and fix any errors
- [x] 5.12 Run `pnpm test` and fix any failures
- [x] 5.13 Run `pnpm test:e2e` and fix any failures
- [x] 5.14 Kill any vitest worker processes

## 6. Post-Discovery Utilities

- [x] 6.1 Write tests for `getSkillDisplayName`: returns `name` when present, falls back to `basename(path)` when name is empty/falsy
- [x] 6.2 Write tests for `filterSkills`: case-insensitive matching against both `skill.name` and display name, multiple input names, no match returns empty array
- [x] 6.3 Write tests for `sanitizeName`: lowercase, special chars replaced with hyphens, dots/underscores preserved, leading/trailing dots and hyphens stripped, truncation to 255 chars, empty result falls back to `"unnamed-skill"`
- [x] 6.4 Implement `getSkillDisplayName(skill)` in a new post-discovery utilities module
- [x] 6.5 Implement `filterSkills(skills, inputNames)` with case-insensitive matching against name and display name
- [x] 6.6 Implement `sanitizeName(name)` with the specified transformation pipeline
- [x] 6.7 Export utilities from the module barrel
- [x] 6.8 Run `pnpm typecheck` and fix any errors
- [x] 6.9 Run `pnpm lint` and fix any errors
- [x] 6.10 Run `pnpm test` and fix any failures
- [x] 6.11 Run `pnpm test:e2e` and fix any failures
- [x] 6.12 Kill any vitest worker processes

## 7. Final Verification

- [x] 7.1 Run full `pnpm typecheck` across all packages
- [x] 7.2 Run full `pnpm lint` across all packages
- [x] 7.3 Run full `pnpm test` across all packages
- [x] 7.4 Run full `pnpm test:e2e` across all packages
- [x] 7.5 Kill any vitest worker processes
