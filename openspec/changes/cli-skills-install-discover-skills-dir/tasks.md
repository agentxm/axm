## 1. Dependencies and Type Changes

- [ ] 1.1 Add `gray-matter` dependency to `packages/cli/package.json` and install
- [ ] 1.2 Update `Skill` type in `extensions/skills/types.ts`: `description` from `Option<string>` to `string`, add `metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>`
- [ ] 1.3 Simplify `AgentSkillsConfig` in `agents/types.ts`: replace `projectDir` + `globalDir` with `dir: string`
- [ ] 1.4 Update all ~40 agent configs (`agents/*/config.ts`) to new `AgentSkillsConfig` shape
- [ ] 1.5 Update consumers of `agent.skills.projectDir` → `agent.skills.dir` (`workspace/apply.ts`, `workspace/service.ts`)
- [ ] 1.6 Update consumers of `Skill.description` from `Option` to `string` (`workspace/load-state.ts`, `discover-skills.ts`)
- [ ] 1.7 Run `pnpm typecheck` and fix any errors
- [ ] 1.8 Run `pnpm lint` and fix any errors
- [ ] 1.9 Run `pnpm test` and fix any failures
- [ ] 1.10 Run `pnpm test:e2e` and fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. SKILL.md Frontmatter Parsing

- [ ] 2.1 Write tests for `parseSkillMd`: valid frontmatter, missing name, missing description, no frontmatter block, invalid YAML, metadata extraction, no metadata
- [ ] 2.2 Implement `parseSkillMd` function using `gray-matter` — returns `Option<Skill>` (None if invalid/missing required fields)
- [ ] 2.3 Run `pnpm typecheck` and fix any errors
- [ ] 2.4 Run `pnpm lint` and fix any errors
- [ ] 2.5 Run `pnpm test` and fix any failures
- [ ] 2.6 Kill any vitest worker processes

## 3. Discovery Algorithm — Core Phases

- [ ] 3.1 Define `DiscoveryOptions` type (`fullDepth`, `includeInternal`) and static priority directory constants
- [ ] 3.2 Write tests for Phase 1 (direct match): early exit when `fullDepth` false, continue when true, no match proceeds
- [ ] 3.3 Write tests for Phase 2 (priority scan): skill in `skills/`, `.claude/skills/`, curated dirs, missing dirs silently skipped, top-level folders
- [ ] 3.4 Write tests for Phase 3 (recursive fallback): triggers on empty results, triggers on `fullDepth`, max depth 5, skipped directories (`node_modules`, `.git`, `dist`, `build`, `__pycache__`), deep skill found
- [ ] 3.5 Write tests for deduplication: same name in different dirs, discovery order priority
- [ ] 3.6 Write tests for internal skill filtering: excluded by default, included by option, included by `INSTALL_INTERNAL_SKILLS` env var
- [ ] 3.7 Implement Phase 1 — direct match with early exit
- [ ] 3.8 Implement Phase 2 — priority directory scan (one-level deep, concurrent)
- [ ] 3.9 Implement Phase 3 — bounded recursive fallback (depth 5, skipped dirs, concurrent)
- [ ] 3.10 Implement deduplication via `seenNames` set across phases
- [ ] 3.11 Implement internal skill filtering
- [ ] 3.12 Wire up `discoverSkillsInDir` with new signature (`basePath`, `subPath`, `options`)
- [ ] 3.13 Run `pnpm typecheck` and fix any errors
- [ ] 3.14 Run `pnpm lint` and fix any errors
- [ ] 3.15 Run `pnpm test` and fix any failures
- [ ] 3.16 Kill any vitest worker processes

## 4. Plugin Manifest Support

- [ ] 4.1 Write tests for plugin manifests: `marketplace.json` with skill paths, `plugin.json` with skill paths, missing manifest, invalid JSON, path traversal rejected, paths must start with `./`, resolved path within basePath
- [ ] 4.2 Implement manifest parsing (`marketplace.json`, `plugin.json`) with path validation
- [ ] 4.3 Integrate manifest paths into Phase 2 priority scan
- [ ] 4.4 Run `pnpm typecheck` and fix any errors
- [ ] 4.5 Run `pnpm lint` and fix any errors
- [ ] 4.6 Run `pnpm test` and fix any failures
- [ ] 4.7 Kill any vitest worker processes

## 5. Error Resilience and Integration

- [ ] 5.1 Write tests for error resilience: unreadable SKILL.md, unreadable directory, zero skills found
- [ ] 5.2 Implement error handling — all filesystem/parsing errors caught and logged at debug level
- [ ] 5.3 Update callers of `discoverSkillsInDir` in `discover-skills.ts` (`discoverFromRemoteGitSource`, `discoverSkills`) for new signature
- [ ] 5.4 Update `workspace/ideal-state.ts` `discoverSkills` dependency type if needed
- [ ] 5.5 Update existing discovery tests in `extensions/skills/skill-discovery.test.ts`
- [ ] 5.6 Update test mocks in `workspace/ideal-state.test.ts` and `workspace/apply.test.ts`
- [ ] 5.7 Run `pnpm typecheck` and fix any errors
- [ ] 5.8 Run `pnpm lint` and fix any errors
- [ ] 5.9 Run `pnpm test` and fix any failures
- [ ] 5.10 Run `pnpm test:e2e` and fix any failures
- [ ] 5.11 Kill any vitest worker processes
