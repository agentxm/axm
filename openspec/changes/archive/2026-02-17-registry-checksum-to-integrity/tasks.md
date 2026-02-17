> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Utility: rename and update hash function

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Update tests in `utils/checksum.test.ts`: rename describe/test names from `computeChecksum` to `computeIntegrity`, change expected format from `sha256:<hex>` to `sha512-<base64>`, update assertions
- [x] 1.2 Rename `utils/checksum.ts` → `utils/integrity.ts`; rename `computeChecksum` → `computeIntegrity`; change `createHash("sha256").update(data).digest("hex")` to `createHash("sha512").update(data).digest("base64")`; update format string from `` `sha256:${hex}` `` to `` `sha512-${base64}` ``
- [x] 1.3 Rename test file `utils/checksum.test.ts` → `utils/integrity.test.ts`; update import path
- [x] 1.4 Update `utils/index.ts` re-export from `./checksum.js` to `./integrity.js` and rename export
- [x] 1.5 Run `pnpm typecheck` and fix any errors
- [x] 1.6 Run `pnpm lint` and fix any errors
- [x] 1.7 Run `pnpm test` and fix any failures
- [x] 1.8 Run `pnpm test:e2e` and fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. Schema and type definitions

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.1, 2.2, 2.3 are independent — launch as parallel subagents.

Depends on: Phase 1

- [x] 2.1 Update `registry/local-schema.ts`: rename `checksum` field to `integrity` in `VersionEntrySchema`, update JSDoc comment to reference SRI format `sha512-<base64>`
- [x] 2.2 Update `registry/client.ts`: rename `checksum` to `integrity` in `RegistryExtensionEntry` interface and its JSDoc
- [x] 2.3 Update `sources/types.ts`: rename `checksum` to `integrity` in `RegistryRefDetails` interface and its JSDoc
- [x] 2.4 Update `lockfile/schema.ts`: rename `checksum` to `integrity` in `RegistryLockEntrySchema` and `RegistryPackLockEntrySchema`, update comments
- [x] 2.5 Run `pnpm typecheck` and fix any errors
- [x] 2.6 Run `pnpm lint` and fix any errors
- [x] 2.7 Run `pnpm test` and fix any failures
- [x] 2.8 Run `pnpm test:e2e` and fix any failures
- [x] 2.9 Kill any vitest worker processes

## 3. Business logic: registry client, host provider, publish flows

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [x] 3.1 Update `registry/local-client.ts`: rename `checksum` → `integrity` in property mappings (`ver.checksum` → `ver.integrity`) and idempotency comparison logic, update error messages
- [x] 3.2 Update `sources/providers/registry/host-provider.ts`: rename all `checksum` references to `integrity` — imports (`computeChecksum` → `computeIntegrity`), variable names (`expectedChecksum`/`actualChecksum` → `expectedIntegrity`/`actualIntegrity`), type guards (`"checksum" in ref` → `"integrity" in ref`), error messages ("Checksum mismatch" → "Integrity mismatch"), both fetch paths (skill and mcp-server)
- [x] 3.3 Update `cli-commands/skills/publish-skill.ts`: rename import and usage of `computeChecksum` → `computeIntegrity`, update variable names and comments
- [x] 3.4 Update `cli-commands/packs/publish/publish-pack.ts`: rename import and usage of `computeChecksum` → `computeIntegrity`, update variable names and comments
- [x] 3.5 Update `cli-commands/skills/source-to-lock-entry.ts`: rename `r.checksum` → `r.integrity` in registry ref mapping
- [x] 3.6 Update `registry/utils.ts` comment referencing "checksum" → "integrity"
- [x] 3.7 Run `pnpm typecheck` and fix any errors
- [x] 3.8 Run `pnpm lint` and fix any errors
- [x] 3.9 Run `pnpm test` and fix any failures
- [x] 3.10 Run `pnpm test:e2e` and fix any failures
- [x] 3.11 Kill any vitest worker processes

## 4. Test fixtures and assertions

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1, 4.2, 4.3, 4.4 are independent — launch as parallel subagents.

Depends on: Phase 3

- [x] 4.1 Update `registry/client.test.ts`: rename all `checksum` references to `integrity`, change fixture values from `sha256:*` to valid `sha512-<base64>` format, update `computeChecksum` import to `computeIntegrity`
- [x] 4.2 Update `registry/local-schema.test.ts`: rename all `checksum` field references to `integrity`, change fixture values from `sha256:*` to `sha512-<base64>` format, update "rejects missing checksum" test name
- [x] 4.3 Update `registry/utils.test.ts`: rename `computeChecksum` import to `computeIntegrity`, change fixture values and test names referencing checksum/sha256
- [x] 4.4 Update `sources/types.test.ts`: rename all `checksum` references to `integrity` in `RegistryRefDetails`, `RegistrySkillRef`, `RegistryMcpServerRef`, `RegistryPackRef` tests, change fixture values from `sha256:*` to `sha512-<base64>`
- [x] 4.5 Update `lockfile/schema.test.ts`: rename all `checksum` field references to `integrity`, change fixture values from `sha256:*` to `sha512-<base64>`, update test names referencing checksum
- [x] 4.6 Update `sources/providers/registry/host-provider.test.ts`: rename `checksum` references to `integrity`, update fixture values, update test names ("verifies checksum" → "verifies integrity", "fails on checksum mismatch" → "fails on integrity mismatch")
- [x] 4.7 Update `sources/service.test.ts`: rename `checksum` fixture values to `integrity` with `sha512-<base64>` format
- [x] 4.8 Update `sources/provider-interface.test.ts`: rename `checksum` fixture to `integrity`
- [x] 4.9 Update `cli-commands/skills/publish-skill.test.ts`: rename checksum test describe/names, change regex from `/^sha256:[a-f0-9]{64}$/` to SRI format pattern, update error message assertions
- [x] 4.10 Update `cli-commands/packs/install/handler.test.ts` and `cli-commands/packs/install/handler.ts`: rename `checksum` fixture references to `integrity`
- [x] 4.11 Update remaining test files referencing `checksum`: `skills/install/install-skill.test.ts`, `skills/source-to-lock-entry.test.ts`, `skills/update/build-plan.test.ts`, `packs/unpack/handler.test.ts`, `packs/packs.e2e.test.ts`, `skills/fork/fork.e2e.test.ts`, `skills/install/registry-install.e2e.test.ts`, `skills/publish/publish.e2e.test.ts`, and any others found
- [x] 4.12 Run `pnpm typecheck` and fix any errors
- [x] 4.13 Run `pnpm lint` and fix any errors
- [x] 4.14 Run `pnpm test` and fix any failures
- [x] 4.15 Run `pnpm test:e2e` and fix any failures (51 pre-existing failures on main, no new failures)
- [x] 4.16 Kill any vitest worker processes

## 5. Specs and lockfile data

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [x] 5.1 Update `openspec/specs/registry-client/spec.md`: apply delta spec changes (checksum → integrity, SHA-256 → SHA-512, format references)
- [x] 5.2 Update `openspec/specs/registry-layout/spec.md`: apply delta spec changes (VersionEntry integrity field)
- [x] 5.3 Update `openspec/specs/registry-publish/spec.md`: apply delta spec changes (integrity computation, idempotency)
- [x] 5.4 Update `openspec/specs/source-domain-model/spec.md`: apply delta spec changes (RegistryRefDetails.integrity)
- [x] 5.5 Update `openspec/specs/source-provider/spec.md`: apply delta spec changes (integrity verification and population)
- [x] 5.6 Update `openspec/specs/extension-packs/spec.md`: apply delta spec changes (pack lock entry integrity field)
- [x] 5.7 Update `openspec/specs/cli-packs-publish/spec.md`: apply delta spec changes (integrity computation and idempotency)
- [x] 5.8 Update `openspec/specs/builtin-pack/spec.md`: apply delta spec changes (exclusion list checksum → integrity)
- [x] 5.9 Update `.axm/axm-lock.yaml` if it contains `checksum` fields — rename to `integrity` with placeholder `sha512-` values, or delete and reinstall
- [x] 5.10 Run `pnpm typecheck` and fix any errors
- [x] 5.11 Run `pnpm lint` and fix any errors
- [x] 5.12 Run `pnpm test` and fix any failures
- [x] 5.13 Run `pnpm test:e2e` and fix any failures
- [x] 5.14 Kill any vitest worker processes
