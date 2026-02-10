> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Rename type definitions

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 In `agents/types.ts`: rename `AgentSkillsConfig` → `AgentSkillsDescriptor`, `AgentConfig` → `AgentDescriptor`, update `AgentRegistry` value type to `AgentDescriptor`
- [x] 1.2 In `sources/types.ts`: rename `ShorthandConfig` → `ShorthandDescriptor`, `UrlParseConfig` → `UrlParseDescriptor`, `SourceConfig` → `SourceDescriptor`
- [x] 1.3 Update barrel exports in `agents/index.ts` (`AgentConfig` → `AgentDescriptor`, `AgentSkillsConfig` → `AgentSkillsDescriptor`)
- [x] 1.4 Run `pnpm typecheck` — expect failures in consumers (confirms type rename propagated). Do NOT fix yet.

## 2. Rename agent definition files and update imports

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.1 and 2.2 are independent — launch as parallel subagents.

Depends on: Phase 1

- [x] 2.1 `git mv` all 38 `agents/<name>/config.ts` → `agents/<name>/descriptor.ts`
- [x] 2.2 In each renamed `agents/<name>/descriptor.ts`: update `import type { AgentConfig }` → `import type { AgentDescriptor }` and `export const config: AgentConfig` → `export const descriptor: AgentDescriptor`
- [x] 2.3 In each `agents/<name>/index.ts`: update `export { config } from "./config.js"` → `export { descriptor } from "./descriptor.js"`
- [x] 2.4 In `agents/registry.ts`: update all `{ config as <name> }` imports to `{ descriptor as <name> }`, update type import `AgentConfig` → `AgentDescriptor`, update JSDoc references
- [x] 2.5 In `agents/detection.ts`: update `AgentConfig` → `AgentDescriptor` in imports and all type annotations
- [x] 2.6 In `agents/detection.test.ts` and `agents/registry.test.ts`: update `AgentConfig` references
- [x] 2.7 Run `pnpm typecheck` for agent-related type errors, fix any remaining issues
- [x] 2.8 Run `pnpm test` — fix any failures
- [x] 2.9 Run `pnpm lint` — fix any issues
- [x] 2.10 Run `pnpm test:e2e` — fix any failures
- [x] 2.11 Kill any vitest worker processes

## 3. Rename source definition files and update imports

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 3.1 `git mv` all 5 `sources/<name>/config.ts` → `sources/<name>/descriptor.ts`
- [x] 3.2 In each renamed `sources/<name>/descriptor.ts`: update `import type { ..., SourceConfig }` → `import type { ..., SourceDescriptor }` and `export const config: SourceConfig<...>` → `export const descriptor: SourceDescriptor<...>`
- [x] 3.3 In each `sources/<name>/index.ts`: update `export { config } from "./config.js"` → `export { descriptor } from "./descriptor.js"`
- [x] 3.4 In `sources/parser.ts`: update `SourceConfig` → `SourceDescriptor` in imports and all type annotations (`AnySourceConfig` → `AnySourceDescriptor`, `ALL_CONFIGS` → `ALL_DESCRIPTORS`, `CONFIG_BY_PREFIX` → `DESCRIPTOR_BY_PREFIX`, `CONFIG_BY_HOSTNAME` → `DESCRIPTOR_BY_HOSTNAME`), update `{ config as ... }` imports to `{ descriptor as ... }`
- [x] 3.5 In `sources/printer.ts`: same pattern as 3.4 (`AnySourceConfig` → `AnySourceDescriptor`, `ALL_CONFIGS` → `ALL_DESCRIPTORS`, `CONFIG_BY_SOURCE_TYPE` → `DESCRIPTOR_BY_SOURCE_TYPE`), update `{ config as ... }` imports to `{ descriptor as ... }`
- [x] 3.6 Run `pnpm typecheck` for source-related type errors, fix any remaining issues
- [x] 3.7 Run `pnpm test` — fix any failures
- [x] 3.8 Run `pnpm lint` — fix any issues
- [x] 3.9 Run `pnpm test:e2e` — fix any failures
- [x] 3.10 Kill any vitest worker processes

## 4. Update consumers outside agents/ and sources/

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2 and 3

- [x] 4.1 In `workspace/service.ts`: update `AgentConfig` → `AgentDescriptor` in imports and type annotations
- [x] 4.2 In `workspace/ensure-agents.ts`: update `AgentConfig` → `AgentDescriptor` in imports and type annotations
- [x] 4.3 In `workspace/service.test.ts`: update any `AgentConfig` references
- [x] 4.4 In `cli-commands/skills/install/discover-skills.ts`: update JSDoc reference from `AgentConfig` → `AgentDescriptor`
- [x] 4.5 In `resolution/resolvers/ambiguous.ts` and `resolution/resolvers/ambiguous.test.ts`: verify no `SourceConfig` references point to `sources/types.ts` (they should reference `settings/schema.ts` — no change needed if so)
- [x] 4.6 In `resolution/resolver.test.ts`: same verification as 4.5
- [x] 4.7 In `sources/registry-guard.test.ts` and `sources/service.test.ts`: same verification — these reference the settings `SourceConfig`, not the sources `SourceConfig`
- [x] 4.8 Run `pnpm typecheck` — all packages, zero errors expected
- [x] 4.9 Run `pnpm test` — fix any failures
- [x] 4.10 Run `pnpm lint` — fix any issues
- [x] 4.11 Run `pnpm test:e2e` — fix any failures
- [x] 4.12 Kill any vitest worker processes

## 5. Update spec text references

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [x] 5.1 In `openspec/specs/cli-skills-install-discover-skills-dir/spec.md`: update `AgentConfig` → `AgentDescriptor` in the Phase 2 requirement text
- [x] 5.2 Verify no other specs reference `AgentConfig`, `AgentSkillsConfig`, or the sources `SourceConfig` (the settings `SourceConfig` references should remain unchanged)
