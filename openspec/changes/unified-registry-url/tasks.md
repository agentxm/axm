## 1. Single source of truth: constant and env var override

Depends on: nothing.

- [ ] 1.1 In `packages/cli/src/runtime/index.ts`, consolidate `DEFAULT_REGISTRY_URL` and `REGISTRY_URL` (env override). Export `REGISTRY_URL` for use by workspace layer construction. Update `RegistryUrlLayer` to use the resolved value.
- [ ] 1.2 Add visual indicator in `run()`: when `REGISTRY_URL !== DEFAULT_REGISTRY_URL`, log `Using registry: <url>` via `@clack/prompts`.
- [ ] 1.3 Run `pnpm typecheck` — fix any errors.
- [ ] 1.4 Run `pnpm test` — fix any failures.

## 2. Token resolution split

Depends on: nothing (parallel with Phase 1).

- [ ] 2.1 In `packages/cli/src/auth/token-resolution.ts`, extract `resolveStoredToken(origin)` — credential store lookup only, no env var or flag checks.
- [ ] 2.2 Extract `resolveAmbientToken(flagToken?)` — `AXM_TOKEN` env var and `--token` flag checks only, no credential store access.
- [ ] 2.3 Rewrite `resolveToken(registryUrl, flagToken?)` as a composition of `resolveAmbientToken` then `resolveStoredToken`, preserving the existing precedence chain. `withAuthGuard` and auth commands continue calling `resolveToken` unchanged.
- [ ] 2.4 Update `packages/cli/src/auth/token-resolution.test.ts` — add tests for `resolveStoredToken` and `resolveAmbientToken` independently. Ensure existing `resolveToken` tests still pass.
- [ ] 2.5 Update `packages/cli/src/auth/index.ts` barrel — export `resolveStoredToken` and `resolveAmbientToken`.
- [ ] 2.6 Run `pnpm typecheck` — fix any errors.
- [ ] 2.7 Run `pnpm test` — fix any failures.

## 3. Auth middleware: credential-based gating

Depends on: Phase 2 (token resolution split).

- [ ] 3.1 In `packages/cli/src/auth/auth-middleware.ts`, replace the `isRegistryRequest` URL-matching gate with credential-based gating: call `resolveStoredToken(origin)` for any request, then fall back to `resolveAmbientToken(flagToken)` only when origin matches `RegistryUrl`.
- [ ] 3.2 Delete the `isRegistryRequest` helper function.
- [ ] 3.3 Update middleware tests: add cases for stored credentials on non-default registry, `AXM_TOKEN` scoped to default registry only, `AXM_TOKEN` not leaking to non-registry hosts, and `AXM_TOKEN` working with empty credential store against default registry.
- [ ] 3.4 Run `pnpm typecheck` — fix any errors.
- [ ] 3.5 Run `pnpm test` — fix any failures.

## 4. Auth handlers: yield RegistryUrl service

Depends on: Phase 1 (consolidated constant).

- [ ] 4.1 In `packages/cli/src/cli-commands/auth/login/handler.ts`, remove local `DEFAULT_REGISTRY_URL` constant. Replace with `const registryUrl = yield* RegistryUrl`.
- [ ] 4.2 Same for `packages/cli/src/cli-commands/auth/logout/handler.ts`.
- [ ] 4.3 Same for `packages/cli/src/cli-commands/auth/whoami/handler.ts`.
- [ ] 4.4 Same for `packages/cli/src/cli-commands/auth/token/handler.ts`.
- [ ] 4.5 Update handler tests to provide `RegistryUrl` in test layers.
- [ ] 4.6 Run `pnpm typecheck` — fix any errors.
- [ ] 4.7 Run `pnpm test` — fix any failures.

## 5. Parameterize built-in sources

Depends on: Phase 1 (REGISTRY_URL available).

- [ ] 5.1 In `packages/cli/src/workspace/source-metadata.ts`, change `BUILT_IN_SOURCES` from a static array to `getBuiltInSources(registryUrl: string)` function. Add the `"default"` registry entry as the first source. Keep `github`, `gitlab`, `bitbucket` unchanged.
- [ ] 5.2 In `packages/cli/src/workspace/service.ts`, update the source merge logic to accept built-in sources as a construction parameter instead of importing the static array.
- [ ] 5.3 In `packages/cli/src/runtime/index.ts`, call `getBuiltInSources(REGISTRY_URL)` and pass the result into the workspace layer constructor.
- [ ] 5.4 Update `packages/cli/src/sources/resolve-source.test.ts` and `packages/cli/src/sources/resolution-flow.test.ts` — update local `BUILT_IN_SOURCES` test fixtures to include the default registry entry.
- [ ] 5.5 Run `pnpm typecheck` — fix any errors.
- [ ] 5.6 Run `pnpm test` — fix any failures.

## 6. Remove registry guard

Depends on: Phase 5 (built-in registry source ensures guard always passes).

- [ ] 6.1 Delete `packages/cli/src/sources/registry-guard.ts`.
- [ ] 6.2 Delete `packages/cli/src/sources/registry-guard.test.ts`.
- [ ] 6.3 Remove `registryGuard` re-export from `packages/cli/src/sources/index.ts`.
- [ ] 6.4 Remove `yield* registryGuard` and its import from call sites:
  - `cli-commands/skills/install/command-actions.ts`
  - `cli-commands/skills/publish/handler.ts`
  - `cli-commands/skills/fork/handler.ts`
  - `cli-commands/packs/install/command-actions.ts`
  - `cli-commands/packs/publish/handler.ts`
  - `cli-commands/commands/install/command-actions.ts`
  - `cli-commands/mcp-servers/install/command-actions.ts`
- [ ] 6.5 Run `pnpm typecheck` — fix any errors.
- [ ] 6.6 Run `pnpm test` — fix any failures.

## 7. End-to-end verification

Depends on: all previous phases.

- [ ] 7.1 Run `pnpm typecheck` — fix any errors.
- [ ] 7.2 Run `pnpm lint` — fix any errors.
- [ ] 7.3 Run `pnpm test` — fix any failures.
- [ ] 7.4 Run `pnpm test:e2e` — fix any failures.
