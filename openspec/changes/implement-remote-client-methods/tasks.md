> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Spec/Test Scaffolding for Remote Reads

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.2, 1.3 are independent — launch as parallel subagents.

- [ ] 1.1 Add failing tests in `packages/cli/src/registry/client-remote.test.ts` for `namespaceExists` (`200 with entries`, `200 empty`, `404`, network error) before implementation (TDD red).
- [ ] 1.2 Add failing tests for `getExtensionPackage` explicit-version resolution, latest-version fallback, missing version, archive 404, and invalid response handling (TDD red).
- [ ] 1.3 Add failing tests for `getExtensionsByScope` list mode (`names: []`) for no-type filter, type-filtered mode, pagination (`offset`/`limit`), and schema mismatch (TDD red).
- [ ] 1.4 Add/adjust integration-level expectations in `packages/cli/src/registry/client.test.ts` to assert remote read parity for `namespaceExists`, `getExtensionPackage`, and list-mode discovery.
- [ ] 1.5 Run `pnpm typecheck` and fix any errors.
- [ ] 1.6 Run `pnpm lint` and fix any errors.
- [ ] 1.7 Run `pnpm test` and fix any failures.
- [ ] 1.8 Run `pnpm test:e2e` and fix any failures.
- [ ] 1.9 Kill any Vitest worker processes left running after verification.

## 2. Remote Client Read Implementation

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.1, 2.2 are independent — launch as parallel subagents.
> **Depends on:** Phase 1 complete.

- [ ] 2.1 Implement response schemas and decode helpers in `packages/cli/src/registry/client-remote.ts` for namespace/type collection responses and any shared remote read payloads.
- [ ] 2.2 Implement `namespaceExists` using `GET /v1/extensions/{namespace}` semantics and map non-success/network failures to typed `CliError` codes.
- [ ] 2.3 Implement `getExtensionPackage` using index fetch + version resolution + archive download, returning raw `Uint8Array` bytes.
- [ ] 2.4 Enable `getExtensionsByScope` list mode for `names: []`, including namespace-only and namespace+type endpoint flows, index hydration, and pagination behavior.
- [ ] 2.5 Normalize remote read error mapping and request-context details for network errors, schema decode failures, and non-success HTTP responses.
- [ ] 2.6 Refactor duplicated remote request code paths into focused helpers while preserving existing publish behavior.
- [ ] 2.7 Run `pnpm typecheck` and fix any errors.
- [ ] 2.8 Run `pnpm lint` and fix any errors.
- [ ] 2.9 Run `pnpm test` and fix any failures.
- [ ] 2.10 Run `pnpm test:e2e` and fix any failures.
- [ ] 2.11 Kill any Vitest worker processes left running after verification.

## 3. Final Validation and Parity Checks

> **Subagent:** Run this entire phase in a single subagent.
> **Depends on:** Phase 2 complete.

- [ ] 3.1 Confirm behavior against spec deltas in `openspec/changes/implement-remote-client-methods/specs/registry-client/spec.md` and `openspec/changes/implement-remote-client-methods/specs/remote-registry-read/spec.md`.
- [ ] 3.2 Add or update regression assertions for edge cases discovered during implementation (ordering/pagination consistency, invalid JSON, missing archive bytes).
- [ ] 3.3 Run targeted remote-client tests and ensure all newly added TDD tests are green (TDD green + refactor complete).
- [ ] 3.4 Run `pnpm typecheck` and fix any errors.
- [ ] 3.5 Run `pnpm lint` and fix any errors.
- [ ] 3.6 Run `pnpm test` and fix any failures.
- [ ] 3.7 Run `pnpm test:e2e` and fix any failures.
- [ ] 3.8 Kill any Vitest worker processes left running after verification.
