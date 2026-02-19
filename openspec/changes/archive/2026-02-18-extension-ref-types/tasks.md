> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Core type definitions

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Add `RefType` literal union (`"git-hosted" | "registry" | "local" | "builtin"`) and `RefTypeSchema` to `sources/types.ts`
- [x] 1.2 Add `ExtensionRefBase<TExtensionType, TRefType, TSource>` interface with `type`, `refType`, `source` fields
- [x] 1.3 Update `RegistryRefDetails`: add `name: string` with a code comment explaining it is the registry package name (may differ from extension display name like `skill.name`). Keep `version`, `integrity` as-is
- [x] 1.4 Add `SkillExtensionRefBase<TRefType, TSource>` type alias composing `ExtensionRefBase<"skill", ...>` with `skill: { name, description: Option<string>, metadata }` metadata
- [x] 1.5 Add `McpServerExtensionRefBase<TRefType, TSource>` type alias composing `ExtensionRefBase<"mcp-server", ...>` with `server: { name }` metadata
- [x] 1.6 Add `PackExtensionRefBase<TRefType, TSource>` type alias composing `ExtensionRefBase<"pack", ...>` with `pack: { name }` metadata
- [x] 1.7 Replace existing skill ref types (8 individual types) with 4 concrete types: `GitHostedSkillRef`, `RegistrySkillRef`, `LocalSkillRef`, `BuiltinSkillRef`
- [x] 1.8 Replace existing MCP server ref types (4 individual types) with 4 concrete types: `GitHostedMcpServerRef`, `RegistryMcpServerRef`, `LocalMcpServerRef`, `BuiltinMcpServerRef`
- [x] 1.9 Replace existing pack ref types with `RegistryPackRef` and `BuiltinPackRef` using the new bases. Note: `BuiltinPackRef.pack` loses `scope` and `version` fields (only `name` remains via `PackExtensionRefBase`); no production code reads those fields
- [x] 1.10 Update `SkillExtensionRef`, `McpServerExtensionRef`, `PackExtensionRef` union types to use new concrete types
- [x] 1.11 Rename `SourceExtensionRef` → `ExtensionRef` and remove the old name
- [x] 1.12 Remove `SkillRefBase` and `McpServerRefBase` (replaced by generic layer-2 bases)
- [x] 1.13 Update barrel exports in `sources/index.ts` to reflect renamed/added/removed types
- [x] 1.14 Update type narrowing tests in `sources/types.test.ts` to use `refType` discriminator
- [x] 1.15 Run `pnpm typecheck` — expect errors in consumers (confirms types changed correctly, consumers will be fixed in later phases)

## 2. Provider construction updates

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.1, 2.2+2.5, 2.3, 2.4 are independent — launch as parallel subagents. Tasks 2.2 and 2.5 MUST run sequentially (same file).

- [x] 2.1 Update `git-hosting.ts` — add `refType: "git-hosted"` to constructed ref objects, update type assertions, update `skill.description` to use `Option`
- [x] 2.2 Update registry `host-provider.ts` (`toSourceExtensionRef`) — add `refType: "registry"`, add `name` to ref details, update `skill.description` to use `Option`
- [x] 2.3 Update `local.ts` provider — add `refType: "local"` to constructed ref objects, update `skill.description` to use `Option`
- [x] 2.4 Update `builtin.ts` provider — add `refType: "builtin"` to constructed ref objects (if/when find is implemented)
- [x] 2.5 Update `host-provider.ts` structural checks (same file as 2.2 — run after 2.2): replace `"namespace" in ref` / `"version" in ref` / `"integrity" in ref` with `ref.refType === "registry"` narrowing
- [x] 2.6 Update `refName()` helper if needed (may already work since `ref.type` narrowing is unchanged)
- [x] 2.7 Update provider tests: `host-provider.test.ts`, `local.test.ts`, `provider-interface.test.ts`
- [x] 2.8 Run `pnpm typecheck` and fix any errors

## 3. Service and dispatch updates

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Update `SourceHostProvidersService` interface — change `SourceExtensionRef` → `ExtensionRef` in `find` and `fetch` signatures
- [x] 3.2 Update `service.ts` layer implementation — update type references (dispatch logic on `source.type` remains unchanged)
- [x] 3.3 Update `provider.ts` `SourceHostProvider` interface — change `SourceExtensionRef` → `ExtensionRef` in `find` and `fetch` signatures
- [x] 3.4 Run `pnpm typecheck` and fix any errors

## 4. Skill consumer migration

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1, 4.2, 4.3, 4.4, 4.5 are independent — launch as parallel subagents.

- [x] 4.1 Rewrite `source-to-lock-entry.ts` — outer switch on `ref.refType`, inner switch on `ref.source.type` within `"git-hosted"`, remove all 7 type assertions. Update `source-to-lock-entry.test.ts` if needed
- [x] 4.2 Update `install-skill.ts` — replace `"location" in ref` with `ref.refType` narrowing, replace `ref.source.type === "registry"` with `ref.refType === "registry"`, replace `!("namespace" in ref)` with `ref.refType` check. Also update `SkillPathSource` construction (line 162) after 4.3 changes the type shape. Update `install-skill.test.ts`
- [x] 4.3 Update `skill-paths.ts` — simplify `SkillPathSource` to use `refType` discriminator instead of `SourceType`. Update `skill-paths.test.ts` (substantial rewrite — ~10 test cases construct `SkillPathSource` with `{ type: "github" }` etc., all need `refType`-based construction)
- [x] 4.4 Update `skill-utils.ts` (`getSkillDisplayName`) — replace `"location" in ref` with `refType` check, handle `skill.description` as `Option<string>`
- [x] 4.5 Update `copy-skill.ts` — replace `"location" in ref` with `refType` narrowing
- [x] 4.6 Update `operations.ts` — change import from `SkillExtensionRef` (already correct type name, just verify import path)
- [x] 4.7 Run `pnpm typecheck` and fix any errors

## 5. Install, update, and fork handler migration

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1, 5.2, 5.3 are independent — launch as parallel subagents.

- [x] 5.1 Update `skills/install/handler.ts` and `select-skills.ts` — fix `ref.skill.description` truthy check in `handler.ts:188` (`ref.skill.description ? ...` → use `Option.match`/`Option.getOrElse`; Option objects are always truthy so the old pattern silently misbehaves). Fix `select-skills.ts:99` `Option.some(s.skill.description)` which double-wraps to `Option<Option<string>>` — use description directly since it's already `Option<string>`. Update type references and any structural checks
- [x] 5.2 Update `skills/update/handler.ts` and `build-plan.ts` — replace `GIT_SOURCE_TYPES` set with `ref.refType === "git-hosted"`, replace `"gitTreeSha" in ref` and `"version" in ref` with `refType` narrowing. Update `build-plan.test.ts`
- [x] 5.3 Update `skills/fork/handler.ts` — update type references and any structural checks. Note: line 221 has an inline import-path type assertion (`as import("../../../sources/types.js").RegistrySkillRef`) that is easy to miss in a find/replace sweep — the `as` cast should become unnecessary with proper `refType` narrowing. Also verify `skill.description` pass-through at line 210 is consistent with `Option<string>`
- [x] 5.4 Run `pnpm typecheck` and fix any errors

## 6. Pack and MCP server consumer migration

> **Subagent:** Run this entire phase in a single subagent.

- [x] 6.1 Update `packs/install/handler.ts` — replace `"namespace" in packRef` and `"version" in packRef` with `packRef.refType === "registry"` narrowing
- [x] 6.2 Update any MCP server command handlers that reference `McpServerExtensionRef` types
- [x] 6.3 Run `pnpm typecheck` and fix any errors

## 7. Workspace and remaining consumer migration

> **Subagent:** Run this entire phase in a single subagent.

- [x] 7.1 Update `workspace/service.ts` and `skills/rename/rename-skill.ts` — update `SkillPathSource` construction to match new `refType`-based shape (both files construct `SkillPathSource` from lock entry data). Update `rename-skill.test.ts`
- [x] 7.2 Update `sources/printer.ts` — update any ref type references (this switches on `source.type` for display, which is unchanged, but imports may need updating)
- [x] 7.3 Grep for any remaining references to `SourceExtensionRef`, old individual ref type names (`GitHubSkillRef`, `GitLabSkillRef`, etc.), and structural `"in"` checks on refs. Fix any stragglers
- [x] 7.4 Run `pnpm typecheck` and fix any errors

## 8. Verification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 8.1 Run `pnpm typecheck` — zero errors across all packages
- [x] 8.2 Run `pnpm lint` — fix any lint errors (removed unused `LocalSkillRef`, `RegistrySkillRef` imports from types.test.ts)
- [x] 8.3 Run `pnpm test` — all unit and handler tests pass (1702 passed, 24 skipped, 0 failed; fixed builtin test in build-plan.test.ts)
- [x] 8.4 Run `pnpm test:e2e` — pre-existing failures unchanged (51 failed, 83 passed, 12 skipped — identical to baseline on main before changes)
- [x] 8.5 Kill any remaining vitest worker processes
