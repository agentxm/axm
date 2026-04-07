> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Preview Flag Verification

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.1, 1.2, 1.3, 1.4 are independent — launch as parallel subagents.

Verify and test `--preview` flag behavior on all four state-changing skill commands. No dependency on shared infrastructure — this can proceed independently.

**Reference:** `cli-skills-uninstall/spec.md`, `cli-skills-update/spec.md`, `cli-skills/spec.md` (enable/disable scenarios).

**Effect v4 patterns for this phase:**

- Tests use `@effect/vitest` with `it.effect` and `it.scoped` for Effect-native test execution
- Preview verification across 4 commands is embarrassingly parallel — use `it.each` or parallel test suites

- [ ] 1.1 Write tests for `axm skills uninstall --preview` — verify it displays the uninstall plan (what would be removed), does NOT delete any files, does NOT modify settings or lockfile, and returns a `PreviewedPlan` result. Cover: single skill, skill with multiple agents.
- [ ] 1.2 Write tests for `axm skills update --preview` — verify it displays the update plan (what would change), does NOT modify any files, settings, or lockfile, and returns a `PreviewedPlan` result. Cover: single skill update, batch update.
- [ ] 1.3 Write tests for `axm skills enable --preview` — verify it displays the enable plan, does NOT modify settings or lockfile, and returns a `PreviewedPlan` result. Cover: disabled skill being re-enabled.
- [ ] 1.4 Write tests for `axm skills disable --preview` — verify it displays the disable plan, does NOT delete any files, modify settings, or update the lockfile, and returns a `PreviewedPlan` result. Cover: enabled skill being disabled.
- [ ] 1.5 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 1.6 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 1.7 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 1.8 Kill any vitest worker processes

## 2. Rendered-File Tracking for Copy-Mode Skills

> **Subagent:** Run this entire phase in a single subagent.

Add `renderedFiles` and `sourceHash` to `SkillLockEntry` for copy-mode installs, using the shared infrastructure from command-support. Depends on command-support Phase 1 (shared rendered-extension infrastructure).

**Reference:** `cli-skills-install/spec.md` — Rendered-file tracking for copy-mode installs.

**Effect v4 patterns for this phase:**

- Reuse `Schema.Class` types from shared infra: `RenderedFilesMapSchema`, `SourceHash` (branded), `RenderedFilePath` (branded)
- Use `Schema.optional()` for the new lockfile fields — existing lockfiles without them parse fine (no migration)
- Use `decodeResult` (synchronous) for copy-mode detection in the reconciliation hot path

- [ ] 2.1 Update `SkillLockEntrySchema` in `packages/core/src/unstable/lockfile/schema.ts` to add `renderedFiles: Schema.optional(RenderedFilesMapSchema)` and `sourceHash: Schema.optional(SourceHashSchema)` — import the shared `Schema.Class` types from `core/unstable/extensions/rendered-files.ts`. Write tests for encode/decode roundtrip with and without the new fields.
- [ ] 2.2 Update `installForDirectory` copy-mode fallback in the skill install flow: when `mode: "copy"`, compute `SourceHash` from the canonical skill source and record `renderedFiles` map with the copied directory path as a `RenderedFilePath`. Write tests verifying lockfile entries include `sourceHash` and `renderedFiles` in copy mode.
- [ ] 2.3 Update copy-mode uninstall: read `renderedFiles` paths from lockfile, delete tracked paths instead of guessing locations. Handle missing rendered files gracefully. Write tests.
- [ ] 2.4 Update copy-mode disable: read `renderedFiles` paths from lockfile, delete tracked paths while preserving materialized source. Write tests.
- [ ] 2.5 Verify symlink-mode install does NOT populate `renderedFiles` or `sourceHash` — write a test confirming these fields are absent for symlink installs.
- [ ] 2.6 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 2.7 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 2.8 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 2.9 Kill any vitest worker processes

## 3. Managed Marker in SKILL.md

> **Subagent:** Run this entire phase in a single subagent.

Add managed-file marker to SKILL.md during materialization and copy-mode fallback, using the shared marker utilities from command-support. Depends on command-support Phase 1 (managed-marker.ts).

**Reference:** `cli-skills-install/spec.md` — Managed marker on materialized SKILL.md.

**Effect v4 patterns for this phase:**

- Reuse `generateMarker("skills", "markdown")` from shared infra, returning `ManagedMarker` branded type
- Reuse `isManagedByAxm(content)` for conflict detection
- Reuse `stripMarker(content)` for fork/new scenarios

- [ ] 3.1 Update skill materialization from registry/git sources: after extracting or cloning a skill to `.axm/extensions/`, prepend the managed marker (`<!-- Managed by axm — see "axm skills --help" -->`) to the materialized `SKILL.md` using `generateMarker("skills", "markdown")`. Write tests verifying marker is present after materialization.
- [ ] 3.2 Verify copy-mode fallback inherits marker: when symlinks fail and skill is copied, the copied `SKILL.md` already has the marker from materialization. Write test confirming marker survives copy.
- [ ] 3.3 Verify local-path skills are excluded: when source is a local path, `SKILL.md` in the author's directory is NOT modified. Write test.
- [ ] 3.4 Update `axm skills fork` to strip the managed marker from forked `SKILL.md` using `stripMarker(content)`. Write test verifying marker is absent after fork.
- [ ] 3.5 Verify `axm skills new` does NOT include the managed marker in scaffolded output. Write test.
- [ ] 3.6 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 3.7 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 3.8 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 3.9 Kill any vitest worker processes

## 4. Migrate `parse-skill-md.ts` to `skills/skill-content.ts`

> **Subagent:** Run this entire phase in a single subagent.

Migrate the existing skill content file parser from `source-resolution/parse-skill-md.ts` to `skills/skill-content.ts`, refactoring to use the shared `frontmatter.ts` parser from `core/unstable/extensions/`. This validates the shared parser's generality as a third consumer and completes the three-type content module pattern (`skills/skill-content.ts`, `commands/command-content.ts`, `subagents/subagent-content.ts`). Depends on command-support Phase 1 (shared `frontmatter.ts` parser).

**Effect v4 patterns for this phase:**

- Reuse `parseFrontmatter` / `parseFrontmatterResult` from shared infra — returns `{ frontmatter: unknown, body: string }`
- Apply `SkillFrontmatterSchema` (existing, moved to new module) via `Schema.decodeUnknownResult` to validate the `unknown` frontmatter
- Export `parseSkillMd` function with the same signature as the existing one for drop-in replacement

- [ ] 4.1 Create `skills/skill-content.ts` in `packages/core/src/unstable/skills/` — move `SkillFrontmatterSchema` from `parse-skill-md.ts`, export it. Define `parseSkillMd(content)` that calls `parseFrontmatter` from `core/unstable/extensions/frontmatter.ts` and applies `SkillFrontmatterSchema` to the result. Return `Option<Skill>` matching the existing signature.
- [ ] 4.2 Update all import sites that reference `source-resolution/parse-skill-md.ts` to import from `skills/skill-content.ts` instead. Search for all usages across the codebase.
- [ ] 4.3 Delete `packages/core/src/unstable/source-resolution/parse-skill-md.ts` and remove its export from the source-resolution barrel.
- [ ] 4.4 Update `packages/core/src/unstable/skills/index.ts` barrel to export the new module.
- [ ] 4.5 Verify the `gray-matter` direct dependency is no longer needed in the skills/source-resolution code path (the shared `frontmatter.ts` parser handles it).
- [ ] 4.6 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 4.7 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 4.8 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 4.9 Kill any vitest worker processes

## 5. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Full CI pipeline to verify everything works together. Depends on all prior phases.

- [ ] 5.1 Run the full CI pipeline (`pnpm run ci`), fix any failures
- [ ] 5.2 Verify no regressions in existing skill tests — symlink-mode install, uninstall, enable, disable, update, list, new, fork, rename, publish all pass
- [ ] 5.3 Verify three parallel content modules exist: `skills/skill-content.ts`, `commands/command-content.ts`, `subagents/subagent-content.ts` — all using `extensions/frontmatter.ts`
- [ ] 5.4 Kill any vitest worker processes
