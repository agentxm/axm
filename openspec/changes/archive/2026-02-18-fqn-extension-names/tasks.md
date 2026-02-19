> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Core FQN Module

> **Subagent:** Run this entire phase in a single subagent.

Create the foundational FQN type, parsing, formatting, and schema — everything else depends on this.

- [x] 1.1 Write tests for `parseFqn`, `parseFqnOrThrow`, and `formatFqn` in `packages/cli/src/extensions/fqn.test.ts` — cover valid 3-segment FQNs for all types (skills, packs, mcp-servers), invalid inputs (2-segment, no scope, invalid type segment, bare name), and round-trip formatting
- [x] 1.2 Create `packages/cli/src/extensions/fqn.ts` with: `ExtensionTypePlural` type (`"skills" | "packs" | "mcp-servers"`), `Fqn` type (`{ readonly scope: string; readonly type: ExtensionTypePlural; readonly name: string }`), `parseFqn(input: string): Effect<Fqn, CliError>`, `parseFqnOrThrow(input: string): Fqn`, `formatFqn(fqn: Fqn): string`
- [x] 1.3 Update `FQN_PATTERN` in `packages/cli/src/extensions/common.ts` from `/^@[\w-]+\/[\w-]+$/` to `/^@[\w-]+\/(skills|packs|mcp-servers)\/[\w-]+$/`
- [x] 1.4 Update `packages/cli/src/extensions/common.test.ts` — change all FQN validation test cases from 2-segment to 3-segment format (valid: `@acme/skills/code-review`; invalid: `@acme/code-review`)
- [x] 1.5 Export `parseFqn`, `parseFqnOrThrow`, `formatFqn`, `Fqn`, and `ExtensionTypePlural` from `packages/cli/src/extensions/index.ts`
- [x] 1.6 Run `pnpm typecheck && pnpm lint && pnpm test -- --reporter=verbose packages/cli/src/extensions/` and fix any failures
- [x] 1.7 Kill vitest workers: `pkill -f vitest || true`

## 2. Input Parser Update

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Remove the legacy 2-segment fallback so `@scope/name` is no longer recognized as a registry pattern.

- [x] 2.1 Update `packages/cli/src/sources/parser.test.ts` — remove or update test cases for 2-segment `@scope/name` registry pattern. Add test that `@scope/name` falls through (not classified as registry). Ensure 3-segment `@scope/skills/name`, `@scope/packs/name`, `@scope/mcp-servers/name` tests pass.
- [x] 2.2 In `packages/cli/src/sources/parser.ts`, remove the legacy 2-segment branch (lines 193-204, the `segments.length === 2` block that defaults type to `"skills"`)
- [x] 2.3 Update `packages/cli/src/sources/resolve-source.test.ts` — change any FQN test strings from 2-segment to 3-segment format
- [x] 2.4 Run `pnpm typecheck && pnpm lint && pnpm test -- --reporter=verbose packages/cli/src/sources/` and fix any failures
- [x] 2.5 Kill vitest workers: `pkill -f vitest || true`

## 3. Pack Manifest Schema & Publish

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Update pack manifest validation and remove the `flattenManifestDeps` transformation layer.

- [x] 3.1 Update `packages/cli/src/extensions/packs/manifest-schema.test.ts` — change test FQN keys from `@scope/name` to `@scope/skills/name` (and similar for other types). Add test that 2-segment keys are rejected.
- [x] 3.2 Update the error message in `VersionSpecifierMapSchema` filter in `packages/cli/src/extensions/packs/manifest-schema.ts` — change `"Names must match @scope/name format"` to `"Names must match @scope/type/name format (e.g. @scope/skills/my-skill)"`
- [x] 3.3 In `packages/cli/src/cli-commands/packs/publish/publish-pack.ts`: remove the `flattenManifestDeps` helper function. The manifest keys are now already 3-segment FQNs, so `dependencies` can be built directly from manifest sections by spreading them: `{ ...manifest.skills, ...manifest.commands, ...manifest["mcp-servers"] }`. Update the `parseScopedName` import to use `parseFqn` from extensions. Update `parseScopedName(op.args.name)` on line 82 to `parseFqn(op.args.name)`.
- [x] 3.4 Update `packages/cli/src/cli-commands/packs/publish/publish-pack.test.ts` (if exists) with 3-segment FQN test data
- [x] 3.5 Run `pnpm typecheck && pnpm lint && pnpm test -- --reporter=verbose packages/cli/src/extensions/packs/ packages/cli/src/cli-commands/packs/publish/` and fix any failures
- [x] 3.6 Kill vitest workers: `pkill -f vitest || true`

## 4. Skill Handler Migration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Tasks 4.1-4.7 are independent — can be parallelized if split into separate subagents.

Migrate all skill command handlers from `parseScopedName`/template literals to `parseFqn`/`formatFqn`.

- [x] 4.1 Migrate `packages/cli/src/cli-commands/skills/copy-skill.ts`: replace `parseScopedName` import with `parseFqn` from extensions. Update the call on line 53 to use `parseFqn`. Update `packages/cli/src/cli-commands/skills/copy-skill.test.ts` FQN strings to 3-segment.
- [x] 4.2 Migrate `packages/cli/src/cli-commands/skills/publish-skill.ts`: replace `parseScopedName` with `parseFqn`. Update line 56. Update `packages/cli/src/cli-commands/skills/publish-skill.test.ts` FQN strings.
- [x] 4.3 Migrate `packages/cli/src/cli-commands/skills/publish/handler.ts`: replace `parseScopedName` and `hasScopePrefix` imports with `parseFqn`/`formatFqn` from extensions. Update line 81 (parseScopedName call) and line 69 (FQN template literal `${scope}/${args.extension}` → `formatFqn`). Update `packages/cli/src/cli-commands/skills/publish/handler.test.ts` FQN strings.
- [x] 4.4 Migrate `packages/cli/src/cli-commands/skills/fork/handler.ts`: update line 198 `const targetName = \`${scope}/${ref.skill.name}\``to use`formatFqn`with type`"skills"`.
- [x] 4.5 Migrate `packages/cli/src/cli-commands/skills/new/handler.ts`: update line 102 `const fqn = \`${scope}/${args.name}\``to use`formatFqn`with type`"skills"`. Update `packages/cli/src/cli-commands/skills/new/handler.test.ts` FQN strings.
- [x] 4.6 Migrate `packages/cli/src/cli-commands/skills/update/handler.ts`: update line 254 `const skillFqn = \`${registryRef.scope}/${registryRef.skill.name}\``to use`formatFqn`with type`"skills"`. Update `packages/cli/src/cli-commands/skills/update/constraint-resolution.test.ts` FQN strings.
- [x] 4.7 Migrate `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts`: update line 73 `\`${lockEntry.scope}/${lockEntry.name}\``to use`formatFqn`with type`"skills"`. The `isReferencedByPack`function on line 84 needs no change (it compares string keys, which will now be 3-segment). Update`packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.test.ts` FQN strings.
- [x] 4.8 Update `packages/cli/src/cli-commands/skills/enable/handler.test.ts` and `packages/cli/src/cli-commands/skills/disable/handler.test.ts` — change FQN strings in test data (e.g., `resolvedSkills: { "@acme/code-review": "1.2.0" }` → `resolvedSkills: { "@acme/skills/code-review": "1.2.0" }`)
- [x] 4.9 Update `packages/cli/src/cli-commands/skills/install/install-skill.test.ts` and `packages/cli/src/cli-commands/skills/install/resolve-skill-install-source.test.ts` FQN strings to 3-segment format
- [x] 4.10 Run `pnpm typecheck && pnpm lint && pnpm test -- --reporter=verbose packages/cli/src/cli-commands/skills/` and fix any failures
- [x] 4.11 Kill vitest workers: `pkill -f vitest || true`

## 5. Pack Handler Migration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Tasks 5.1-5.7 are independent — can be parallelized if split into separate subagents.

Migrate all pack command handlers.

- [x] 5.1 Migrate `packages/cli/src/cli-commands/packs/add/handler.ts`: replace `parseScopedNameOrThrow` and `hasScopePrefix` imports with `parseFqnOrThrow` from extensions. Update line 71 (scope extraction) and line 150 (FQN construction `\`${lockEntry.scope}/${lockEntry.name}\``→`formatFqn`with type`"packs"`). Update `packages/cli/src/cli-commands/packs/add/handler.test.ts` FQN strings.
- [x] 5.2 Migrate `packages/cli/src/cli-commands/packs/remove/handler.ts`: replace `parseScopedNameOrThrow` and `hasScopePrefix` with `parseFqnOrThrow`. Update line 63. Update `packages/cli/src/cli-commands/packs/remove/handler.test.ts` FQN strings.
- [x] 5.3 Migrate `packages/cli/src/cli-commands/packs/publish/handler.ts`: replace `parseScopedName` and `hasScopePrefix` with `parseFqn`/`formatFqn`. Update line 82 and line 70 (FQN template literal → `formatFqn` with type `"packs"`). Update `packages/cli/src/cli-commands/packs/publish/handler.test.ts` FQN strings.
- [x] 5.4 Migrate `packages/cli/src/cli-commands/packs/install/handler.ts`: update lines 78 and 95 — FQN constructions already include `packs/` segment, ensure they use `formatFqn`. Update `packages/cli/src/cli-commands/packs/install/handler.test.ts` and `packages/cli/src/cli-commands/packs/install/build-plan.test.ts` FQN strings. Update `packages/cli/src/cli-commands/packs/install/command.test.ts` FQN strings.
- [x] 5.5 Migrate `packages/cli/src/cli-commands/packs/new/handler.ts`: update line 63 `const fqn = \`${scope}/${args.name}\``to use`formatFqn`with type`"packs"`. Update `packages/cli/src/cli-commands/packs/new/handler.test.ts` FQN strings.
- [x] 5.6 Migrate `packages/cli/src/cli-commands/packs/unpack/handler.ts`: replace `parseScopedName` with `parseFqn`. Update line 97 to parse 3-segment FQN from `resolvedSkills` keys.
- [x] 5.7 Migrate `packages/cli/src/cli-commands/packs/uninstall/uninstall-pack.ts`: update `skillFqn` usage (lines 88-115) — these iterate over `resolvedSkills` keys which are now 3-segment. Update `packages/cli/src/cli-commands/packs/uninstall/handler.test.ts` and `packages/cli/src/cli-commands/packs/uninstall/build-plan.test.ts` FQN strings.
- [x] 5.8 Run `pnpm typecheck && pnpm lint && pnpm test -- --reporter=verbose packages/cli/src/cli-commands/packs/` and fix any failures
- [x] 5.9 Kill vitest workers: `pkill -f vitest || true`

## 6. Workspace Service & Shared Test Data

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

Update workspace service FQN construction and remaining shared test files.

- [x] 6.1 Update `packages/cli/src/workspace/service.ts` lines 714-715: change `\`${lockEntry.scope}/${name}\``to use`formatFqn`with type`"skills"`(this is in the skill settings writer). Same pattern on lines 940-941 for packs: use`formatFqn`with type`"packs"`.
- [x] 6.2 Update `packages/cli/src/workspace/service.test.ts` — change all FQN strings to 3-segment format (32 occurrences)
- [x] 6.3 Update `packages/cli/src/sources/resolve-source.ts` line 65: change `\`${REGISTRY_EXTENSIONS_DIR}/${entry.scope}/skills/${name}\`` if it constructs an FQN (verify context first — may be a path, not FQN)
- [x] 6.4 Update `packages/cli/src/lockfile/schema.test.ts` — change FQN strings in test data to 3-segment format
- [x] 6.5 Update `packages/cli/src/settings/schema.test.ts` — update any FQN strings used in source string test data (settings keys stay as simple names)
- [x] 6.6 Update `packages/cli/src/extensions/examples.test.ts` — change FQN strings to 3-segment format
- [x] 6.7 Update `packages/cli/src/sources/providers/registry/host-provider.test.ts` — change FQN strings to 3-segment format
- [x] 6.8 Update `packages/cli/src/registry/local-schema.test.ts` — change FQN strings to 3-segment format
- [x] 6.9 Update source origin formatting: find where registry source origin is formatted (likely in a source host provider or origin function) and ensure it outputs `@scope/type-plural/name` instead of `@scope/name`
- [x] 6.10 Run `pnpm typecheck && pnpm lint && pnpm test -- --reporter=verbose packages/cli/src/workspace/ packages/cli/src/lockfile/ packages/cli/src/settings/ packages/cli/src/registry/ packages/cli/src/sources/` and fix any failures
- [x] 6.11 Kill vitest workers: `pkill -f vitest || true`

## 7. Cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3, 4, 5, 6.

Delete legacy naming utilities and verify no remaining 2-segment FQN references.

- [x] 7.1 Delete `packages/cli/src/cli-commands/skills/naming.ts` and `packages/cli/src/cli-commands/skills/naming.test.ts`
- [x] 7.2 Remove `naming.ts` exports from any barrel files that re-export it (check `packages/cli/src/cli-commands/skills/index.ts` if it exists)
- [x] 7.3 Grep for any remaining imports of `naming.js` across the codebase — fix any stragglers
- [x] 7.4 Grep for remaining 2-segment FQN patterns in source files: search for `@acme/code-review`, `@acme/my-skill`, `@wayne/grappling-hook`, `@scope/name` (without a type segment) in `.ts` files. Update any found to 3-segment.
- [x] 7.5 Run full verification: `pnpm typecheck && pnpm lint`
- [x] 7.6 Run full test suite: `pnpm test`
- [x] 7.7 Kill vitest workers: `pkill -f vitest || true`

## 8. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 7.

- [x] 8.1 Run `pnpm typecheck` — must pass clean
- [x] 8.2 Run `pnpm lint` — must pass clean
- [x] 8.3 Run `pnpm test` — all tests must pass
- [x] 8.4 Run `pnpm test:e2e` — all e2e tests must pass
- [x] 8.5 Kill vitest workers: `pkill -f vitest || true`
