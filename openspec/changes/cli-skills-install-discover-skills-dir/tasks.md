## 1. Dependencies and Type Changes

- [x] 1.1 Add `gray-matter` dependency to `packages/cli/package.json` and install
- [x] 1.2 Update `Skill` type in `extensions/skills/types.ts`: `description` from `Option<string>` to `string`, add `metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>`
- [x] 1.3 Simplify `AgentSkillsConfig` in `agents/types.ts`: replace `projectDir` + `globalDir` with `dir: string`
- [x] 1.4 Update all ~40 agent configs (`agents/*/config.ts`) to new `AgentSkillsConfig` shape
- [x] 1.5 Update consumers of `agent.skills.projectDir` → `agent.skills.dir` (`workspace/apply.ts`, `workspace/service.ts`)
- [x] 1.6 Update consumers of `Skill.description` from `Option` to `string` (`workspace/load-state.ts`, `discover-skills.ts`)
- [x] 1.7 Run `pnpm typecheck` and fix any errors
- [x] 1.8 Run `pnpm lint` and fix any errors
- [x] 1.9 Run `pnpm test` and fix any failures
- [x] 1.10 Run `pnpm test:e2e` and fix any failures
- [x] 1.11 Kill any vitest worker processes

## 2. SKILL.md Frontmatter Parsing

- [x] 2.1 Write tests for `parseSkillMd`: valid frontmatter, missing name, missing description, no frontmatter block, invalid YAML, metadata extraction, no metadata
- [x] 2.2 Implement `parseSkillMd` function using `gray-matter` — returns `Option<Skill>` (None if invalid/missing required fields)
- [x] 2.3 Run `pnpm typecheck` and fix any errors
- [x] 2.4 Run `pnpm lint` and fix any errors
- [x] 2.5 Run `pnpm test` and fix any failures
- [x] 2.6 Kill any vitest worker processes

## 3. Discovery Algorithm — Core Phases

- [x] 3.1 Define `DiscoveryOptions` type (`fullDepth`, `includeInternal`) and static priority directory constants
- [x] 3.2 Write tests for Phase 1 (direct match): early exit when `fullDepth` false, continue when true, no match proceeds
- [x] 3.3 Write tests for Phase 2 (priority scan): skill in `skills/`, `.claude/skills/`, curated dirs, missing dirs silently skipped, top-level folders
- [x] 3.4 Write tests for Phase 3 (recursive fallback): triggers on empty results, triggers on `fullDepth`, max depth 5, skipped directories (`node_modules`, `.git`, `dist`, `build`, `__pycache__`), deep skill found
- [x] 3.5 Write tests for deduplication: same name in different dirs, discovery order priority
- [x] 3.6 Write tests for internal skill filtering: excluded by default, included by option, included by `INSTALL_INTERNAL_SKILLS` env var
- [x] 3.7 Implement Phase 1 — direct match with early exit
- [x] 3.8 Implement Phase 2 — priority directory scan (one-level deep, concurrent)
- [x] 3.9 Implement Phase 3 — bounded recursive fallback (depth 5, skipped dirs, concurrent)
- [x] 3.10 Implement deduplication via `seenNames` set across phases
- [x] 3.11 Implement internal skill filtering
- [x] 3.12 Wire up `discoverSkillsInDir` with new signature (`basePath`, `subPath`, `options`)
- [x] 3.13 Run `pnpm typecheck` and fix any errors
- [x] 3.14 Run `pnpm lint` and fix any errors
- [x] 3.15 Run `pnpm test` and fix any failures
- [x] 3.16 Kill any vitest worker processes

## 4. Plugin Manifest Support

- [x] 4.1 Write tests for plugin manifests: `marketplace.json` with skill paths, `plugin.json` with skill paths, missing manifest, invalid JSON, path traversal rejected, paths must start with `./`, resolved path within basePath
- [x] 4.2 Implement manifest parsing (`marketplace.json`, `plugin.json`) with path validation
- [x] 4.3 Integrate manifest paths into Phase 2 priority scan
- [x] 4.4 Run `pnpm typecheck` and fix any errors
- [x] 4.5 Run `pnpm lint` and fix any errors
- [x] 4.6 Run `pnpm test` and fix any failures
- [x] 4.7 Kill any vitest worker processes

## 5. Error Resilience and Integration

- [x] 5.1 Write tests for error resilience: unreadable SKILL.md, unreadable directory, zero skills found
- [x] 5.2 Implement error handling — all filesystem/parsing errors caught and logged at debug level
- [x] 5.3 Update callers of `discoverSkillsInDir` in `discover-skills.ts` (`discoverFromRemoteGitSource`, `discoverSkills`) for new signature
- [x] 5.4 Update `workspace/ideal-state.ts` `discoverSkills` dependency type if needed
- [x] 5.5 Update existing discovery tests in `extensions/skills/skill-discovery.test.ts`
- [x] 5.6 Update test mocks in `workspace/ideal-state.test.ts` and `workspace/apply.test.ts`
- [x] 5.7 Run `pnpm typecheck` and fix any errors
- [x] 5.8 Run `pnpm lint` and fix any errors
- [x] 5.9 Run `pnpm test` and fix any failures
- [x] 5.10 Run `pnpm test:e2e` and fix any failures
- [x] 5.11 Kill any vitest worker processes
