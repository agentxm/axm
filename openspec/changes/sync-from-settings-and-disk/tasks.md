> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

**Phase dependencies:**

- Phases 1 and 4 are independent and MAY be launched in parallel.
- Phase 2 depends on Phase 1.
- Phase 3 depends on Phase 2.
- Phase 5 depends on Phase 1.
- Phase 6 depends on Phases 1–5.
- Phase 7 (final verification) depends on Phases 1–6.

## 1. Drop `agents` from manifest schemas

> **Subagent:** Run this entire phase in a single subagent.
>
> **Parallelization:** Tasks 1.2, 1.3, 1.4 are independent (different manifest schemas) — launch as parallel subagents.

- [ ] 1.1 Add or update unit tests for `subagent.json`, `command.json`, `skill.json` schema validation: assert that manifests without `agents` parse successfully, and (for the new behavior) that any residual `agents` field is ignored or rejected per the design (start RED).
- [ ] 1.2 Remove the `agents: Schema.optional(Schema.Array(Schema.String))` field from `packages/core/src/unstable/subagents/manifest-schema.ts`. Update any types or barrels that re-export the field. Run `pnpm nx run @agentxm/client-core:typecheck` and fix all `@effect/language-service` diagnostics.
- [ ] 1.3 Remove the `agents` field from `packages/core/src/unstable/commands/manifest-schema.ts`. Run `pnpm nx run @agentxm/client-core:typecheck` and fix diagnostics.
- [ ] 1.4 Remove the `agents` field from `packages/core/src/unstable/skills/manifest-schema.ts`. Run `pnpm nx run @agentxm/client-core:typecheck` and fix diagnostics.
- [ ] 1.5 Remove `agents` from any JSON schemas published at `axm.sh/schemas/*` (search the repo for the schema source). Update fixtures that hand-author manifests with the field.
- [ ] 1.6 Sweep call sites that read `manifest.agents` (e.g., renderers, ref builders, publish projection) and remove the read. Replace with reads of `settings.agents` where targeting is needed.
- [ ] 1.7 Run `pnpm typecheck` and fix all errors including `@effect/language-service` diagnostics.
- [ ] 1.8 Run `pnpm lint` and fix all errors.
- [ ] 1.9 Run `pnpm test` and fix all failures.
- [ ] 1.10 Run `pnpm test:e2e` and fix all failures.
- [ ] 1.11 Kill any lingering vitest worker processes (`pkill -f vitest` or equivalent).

## 2. Rewrite sync to read from settings + on-disk extensions

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Add or update tests for `SubagentManager.listMaterializable` (and siblings: skills, commands, mcp-servers, packs) to assert that they enumerate refs from `settings.json` plus on-disk content under `.axm/extensions/`, ignoring the lockfile entirely. Include a test that exercises the testing-sandbox failure mode: a stale lockfile entry referencing an unconfigured `sourceName` MUST NOT cause sync to fail (start RED).
- [ ] 2.2 Add a sync-handler-level test that constructs a workspace with settings + on-disk extensions but a deliberately broken lockfile and asserts `axm sync` succeeds and renders the expected files.
- [ ] 2.3 Rewrite `subagentManager.listMaterializable` in `packages/core/src/unstable/subagents/manager.ts` to read settings entries, look up the corresponding `.axm/extensions/<owner>/subagents/<name>/` directory, and produce `SubagentExtensionRef` values from on-disk content. Do not call `subagentLockEntryToRef`. Run `pnpm nx run @agentxm/client-core:typecheck`.
- [ ] 2.4 Apply the same rewrite to `commandManager.listMaterializable`, `mcpServerManager.listMaterializable`, and `skillManager.listMaterializable` in their respective managers. Run typecheck after each.
- [ ] 2.5 Implement pack expansion at sync time in `packManager.listMaterializable`: for each pack entry in settings, read `.axm/extensions/<owner>/packs/<name>/pack.json`, enumerate constituent extensions, and emit refs for each (subject to the same on-disk read path). Constituents that already appear as direct settings entries SHALL NOT be double-rendered. Run typecheck.
- [ ] 2.6 Remove the `sourceHash`-based re-render short-circuit from the sync path. Sync re-renders all in-scope extensions every run. Leave the lockfile schema's `sourceHash` field in place (other consumers may set/use it).
- [ ] 2.7 Verify the sync handler in `packages/cli/src/root/sync/handler.ts` no longer requires lockfile resolution to plan; ensure that when a stale lockfile is present, sync ignores it.
- [ ] 2.8 Update or remove tests in `packages/core/src/unstable/agents/subagent-sync.test.ts` and any rendering tests that asserted lockfile-driven behavior. Where tests were checking sourceHash short-circuit, replace with idempotent re-render assertions.
- [ ] 2.9 Run `pnpm typecheck` and fix all errors including `@effect/language-service` diagnostics.
- [ ] 2.10 Run `pnpm lint` and fix all errors.
- [ ] 2.11 Run `pnpm test` and fix all failures.
- [ ] 2.12 Run `pnpm test:e2e` and fix all failures.
- [ ] 2.13 Kill any lingering vitest worker processes.

## 3. Disk-derived render-target cleanup

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 3.1 Add tests for the cleanup behaviors:
  - Removing an agent from `settings.agents` deletes managed files in that agent's render directories on the next sync.
  - Disabling an extension in settings deletes its rendered files across all configured agent directories.
  - An extension present on disk but absent from settings (and not pack-implied) has its rendered files cleaned up.
  - Files without the AXM managed marker are never deleted (existing managed-marker rule).
    Tests start RED.
- [ ] 3.2 Implement a "walk configured agent directories, inspect for managed marker" cleanup helper in the workspace reconciliation layer. The helper computes the set of expected (agent, extension-name) tuples from settings + disk and removes any managed file at a render path that isn't in the expected set.
- [ ] 3.3 Wire the helper into the sync flow so it runs after the materialize/render step. Ensure it does not consult `lockfile.renderedFiles`.
- [ ] 3.4 Remove or repurpose code that reads `lockfile.renderedFiles` from the sync path. The lockfile field stays in the schema (writers from install/uninstall may continue to populate it), but sync neither reads nor writes it.
- [ ] 3.5 Run `pnpm typecheck` and fix all errors including `@effect/language-service` diagnostics.
- [ ] 3.6 Run `pnpm lint` and fix all errors.
- [ ] 3.7 Run `pnpm test` and fix all failures.
- [ ] 3.8 Run `pnpm test:e2e` and fix all failures.
- [ ] 3.9 Kill any lingering vitest worker processes.

## 4. Lint rule: configured-but-not-installed

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 4.1 Add tests for a new lint rule that flags any settings entry (skill, command, mcp-server, subagent, pack) whose `.axm/extensions/<owner>/<kind>/<name>/` directory or manifest is missing. Tests should cover: direct settings entry missing, pack present but constituent missing, and the happy path where everything is on disk. Tests start RED.
- [ ] 4.2 Implement the lint rule under `packages/core/src/unstable/lint/catalog/` following the conventions of existing rules (e.g., `skill/manifest-present.ts`). Advisory message SHALL suggest `axm install <name>`.
- [ ] 4.3 Register the rule in the lint catalog index so it runs as part of `axm lint`.
- [ ] 4.4 Run `pnpm typecheck` and fix all errors including `@effect/language-service` diagnostics.
- [ ] 4.5 Run `pnpm lint` and fix all errors.
- [ ] 4.6 Run `pnpm test` and fix all failures.
- [ ] 4.7 Run `pnpm test:e2e` and fix all failures.
- [ ] 4.8 Kill any lingering vitest worker processes.

## 5. Reject `agents` field at publish

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 5.1 Add tests for `axm subagents publish` and `axm commands publish` (and skills publish if applicable) that assert publish fails with a clear validation error when the manifest contains an `agents` field. Tests start RED.
- [ ] 5.2 Update the manifest validation policy in `packages/core/src/unstable/publish/manifest-policy.ts` (and any kind-specific publish validation) to reject `agents`. Error message MUST direct the author to express targeting in `settings.agents`.
- [ ] 5.3 Run `pnpm typecheck` and fix all errors including `@effect/language-service` diagnostics.
- [ ] 5.4 Run `pnpm lint` and fix all errors.
- [ ] 5.5 Run `pnpm test` and fix all failures.
- [ ] 5.6 Run `pnpm test:e2e` and fix all failures.
- [ ] 5.7 Kill any lingering vitest worker processes.

## 6. Documentation, help topics, and fixtures

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 6.1 Update help topics in `packages/cli/help/topics/` (e.g., `subagents.md`, `commands.md`, anything mentioning `agents` in manifest examples) to reflect that targeting is settings-owned.
- [ ] 6.2 Regenerate `packages/cli/src/__generated__/help-topics.ts`.
- [ ] 6.3 Search the repo for any author-facing docs/examples (`README.md`, contributing guides, schema descriptions) that show `agents:` in a manifest snippet and update them.
- [ ] 6.4 Update any test fixtures (sandboxes, e2e fixtures, golden manifests) that include `agents` in a `subagent.json`, `command.json`, or `skill.json`.
- [ ] 6.5 Run `pnpm typecheck` and fix all errors including `@effect/language-service` diagnostics.
- [ ] 6.6 Run `pnpm lint` and fix all errors.
- [ ] 6.7 Run `pnpm test` and fix all failures.
- [ ] 6.8 Run `pnpm test:e2e` and fix all failures.
- [ ] 6.9 Kill any lingering vitest worker processes.

## 7. Final verification

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 7.1 Run `pnpm run ci` and fix any failures across lint, typecheck, build, test, and e2e.
- [ ] 7.2 Manually verify the original sandbox repro: in `/Users/craig/Code/agentxm/testing-sandbox/`, with `.axm/axm-lock.yaml` carrying `sourceName: local` for the `joke-teller` subagent and no `local` source configured, `axm sync` SHALL succeed and re-render the subagent files. (Use `./scripts/axm-local` if necessary to point at the in-flight CLI.)
- [ ] 7.3 Run `axm sync --dry-run --json` against the sandbox and confirm the planned set is derived from settings (matching subagents/skills entries), not from the lockfile.
- [ ] 7.4 Run `axm lint` against a sandbox where settings lists an extension with no on-disk content; confirm the new "configured-but-not-installed" finding fires with the expected advisory.
- [ ] 7.5 Kill any lingering vitest worker processes.
