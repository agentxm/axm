> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Core type definitions

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add `RefType` literal union (`"git-hosted" | "registry" | "local" | "builtin"`) and `RefTypeSchema` to `sources/types.ts`
- [ ] 1.2 Add `ExtensionRefBase<TExtensionType, TRefType, TSource>` interface with `type`, `refType`, `source` fields
- [ ] 1.3 Update `RegistryRefDetails`: add `name: string` with a code comment explaining it is the registry package name (may differ from extension display name like `skill.name`). Keep `version`, `integrity` as-is
- [ ] 1.4 Add `SkillExtensionRefBase<TRefType, TSource>` type alias composing `ExtensionRefBase<"skill", ...>` with `skill: { name, description: Option<string>, metadata }` metadata
- [ ] 1.5 Add `McpServerExtensionRefBase<TRefType, TSource>` type alias composing `ExtensionRefBase<"mcp-server", ...>` with `server: { name }` metadata
- [ ] 1.6 Add `PackExtensionRefBase<TRefType, TSource>` type alias composing `ExtensionRefBase<"pack", ...>` with `pack: { name }` metadata
- [ ] 1.7 Replace existing skill ref types (8 individual types) with 4 concrete types: `GitHostedSkillRef`, `RegistrySkillRef`, `LocalSkillRef`, `BuiltinSkillRef`
- [ ] 1.8 Replace existing MCP server ref types (4 individual types) with 4 concrete types: `GitHostedMcpServerRef`, `RegistryMcpServerRef`, `LocalMcpServerRef`, `BuiltinMcpServerRef`
- [ ] 1.9 Replace existing pack ref types with `RegistryPackRef` and `BuiltinPackRef` using the new bases
- [ ] 1.10 Update `SkillExtensionRef`, `McpServerExtensionRef`, `PackExtensionRef` union types to use new concrete types
- [ ] 1.11 Rename `SourceExtensionRef` → `ExtensionRef` and remove the old name
- [ ] 1.12 Remove `SkillRefBase` and `McpServerRefBase` (replaced by generic layer-2 bases)
- [ ] 1.13 Update barrel exports in `sources/index.ts` to reflect renamed/added/removed types
- [ ] 1.14 Update type narrowing tests in `sources/types.test.ts` to use `refType` discriminator
- [ ] 1.15 Run `pnpm typecheck` — expect errors in consumers (confirms types changed correctly, consumers will be fixed in later phases)

## 2. Provider construction updates

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.1, 2.2, 2.3, 2.4 are independent — launch as parallel subagents.

- [ ] 2.1 Update `git-hosting.ts` — add `refType: "git-hosted"` to constructed ref objects, update type assertions, update `skill.description` to use `Option`
- [ ] 2.2 Update registry `host-provider.ts` (`toSourceExtensionRef`) — add `refType: "registry"`, add `name` to ref details, update `skill.description` to use `Option`
- [ ] 2.3 Update `local.ts` provider — add `refType: "local"` to constructed ref objects, update `skill.description` to use `Option`
- [ ] 2.4 Update `builtin.ts` provider — add `refType: "builtin"` to constructed ref objects (if/when find is implemented)
- [ ] 2.5 Update `host-provider.ts` structural checks: replace `"scope" in ref` / `"version" in ref` / `"integrity" in ref` with `ref.refType === "registry"` narrowing
- [ ] 2.6 Update `refName()` helper if needed (may already work since `ref.type` narrowing is unchanged)
- [ ] 2.7 Update provider tests: `host-provider.test.ts`, `local.test.ts`, `provider-interface.test.ts`
- [ ] 2.8 Run `pnpm typecheck` and fix any errors

## 3. Service and dispatch updates

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 3.1 Update `SourceHostProvidersService` interface — change `SourceExtensionRef` → `ExtensionRef` in `find` and `fetch` signatures
- [ ] 3.2 Update `service.ts` layer implementation — update type references (dispatch logic on `source.type` remains unchanged)
- [ ] 3.3 Update `provider.ts` `SourceHostProvider` interface — change `SourceExtensionRef` → `ExtensionRef` in `find` and `fetch` signatures
- [ ] 3.4 Run `pnpm typecheck` and fix any errors

## 4. Skill consumer migration

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1, 4.2, 4.3, 4.4, 4.5 are independent — launch as parallel subagents.

- [ ] 4.1 Rewrite `source-to-lock-entry.ts` — outer switch on `ref.refType`, inner switch on `ref.source.type` within `"git-hosted"`, remove all 7 type assertions. Update `source-to-lock-entry.test.ts` if needed
- [ ] 4.2 Update `install-skill.ts` — replace `"location" in ref` with `ref.refType` narrowing, replace `ref.source.type === "registry"` with `ref.refType === "registry"`, replace `!("scope" in ref)` with `ref.refType` check. Update `install-skill.test.ts`
- [ ] 4.3 Update `skill-paths.ts` — simplify `SkillPathSource` to use `refType` discriminator instead of `SourceType`. Update `skill-paths.test.ts`
- [ ] 4.4 Update `skill-utils.ts` (`getSkillDisplayName`) — replace `"location" in ref` with `refType` check, handle `skill.description` as `Option<string>`
- [ ] 4.5 Update `copy-skill.ts` — replace `"location" in ref` with `refType` narrowing
- [ ] 4.6 Update `operations.ts` — change import from `SkillExtensionRef` (already correct type name, just verify import path)
- [ ] 4.7 Run `pnpm typecheck` and fix any errors

## 5. Install, update, and fork handler migration

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1, 5.2, 5.3 are independent — launch as parallel subagents.

- [ ] 5.1 Update `skills/install/handler.ts` and `select-skills.ts` — update type references and any structural checks
- [ ] 5.2 Update `skills/update/handler.ts` and `build-plan.ts` — replace `GIT_SOURCE_TYPES` set with `ref.refType === "git-hosted"`, replace `"gitTreeSha" in ref` and `"version" in ref` with `refType` narrowing. Update `build-plan.test.ts`
- [ ] 5.3 Update `skills/fork/handler.ts` — update type references and any structural checks
- [ ] 5.4 Run `pnpm typecheck` and fix any errors

## 6. Pack and MCP server consumer migration

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 6.1 Update `packs/install/handler.ts` — replace `"scope" in packRef` and `"version" in packRef` with `packRef.refType === "registry"` narrowing
- [ ] 6.2 Update any MCP server command handlers that reference `McpServerExtensionRef` types
- [ ] 6.3 Run `pnpm typecheck` and fix any errors

## 7. Workspace and remaining consumer migration

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 7.1 Update `workspace/service.ts` — update `SkillPathSource` usage if it changed shape
- [ ] 7.2 Update `sources/printer.ts` — update any ref type references (this switches on `source.type` for display, which is unchanged, but imports may need updating)
- [ ] 7.3 Grep for any remaining references to `SourceExtensionRef`, old individual ref type names (`GitHubSkillRef`, `GitLabSkillRef`, etc.), and structural `"in"` checks on refs. Fix any stragglers
- [ ] 7.4 Run `pnpm typecheck` and fix any errors

## 8. Verification

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 8.1 Run `pnpm typecheck` — zero errors across all packages
- [ ] 8.2 Run `pnpm lint` — fix any lint errors
- [ ] 8.3 Run `pnpm test` — all unit and handler tests pass
- [ ] 8.4 Run `pnpm test:e2e` — all E2E tests pass
- [ ] 8.5 Kill any remaining vitest worker processes
