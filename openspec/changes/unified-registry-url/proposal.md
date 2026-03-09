## Why

The default registry URL (`https://registry.agentxm.ai`) is hardcoded in 5 separate locations across the auth and runtime systems, and the extension resolution system has no built-in registry source at all. This means auth commands and extension resolution can silently point at different registries, there is no single override for local development, and the registry configuration guard prompts users to configure what should be a sensible default. Additionally, the auth middleware only injects Bearer tokens for requests matching one hardcoded URL — if a user configures a different registry source, requests to it go out unauthenticated.

## What Changes

- **BREAKING**: Add `https://registry.agentxm.ai` as a built-in registry source (alongside the existing github/gitlab/bitbucket built-ins), replacing the current "no built-in registry source" requirement
- Consolidate the 5 hardcoded `DEFAULT_REGISTRY_URL` constants (runtime/index.ts + 4 auth handlers) into a single constant with env var override
- Narrow `RegistryUrl` service role to "default auth target" for auth commands (login, logout, whoami, token) and auth guard (`withAuthGuard`). Middleware retains narrow dependency for ambient token scoping only.
- Auth command handlers yield the `RegistryUrl` service instead of defining their own local constants
- **BREAKING**: Remove the registry configuration guard (`registryGuard`) — with a built-in registry source always present, the guard is unnecessary. Remove all call sites (skills install/publish/fork, packs install/publish, commands install, mcp-servers install).
- Auth middleware uses credential-based gating instead of single-URL matching — injects tokens for any registry where credentials exist, not just the default. Split `resolveToken` into `resolveStoredToken` (any origin) and `resolveAmbientToken` (default registry only) to prevent token leakage.
- Support `AXM_REGISTRY_URL` environment variable override that affects both auth and extension resolution in one place
- Log a visual indicator when the CLI is using a non-default registry URL

## Capabilities

### New Capabilities

_None — this change consolidates existing behavior, it does not introduce new user-facing capabilities._

### Modified Capabilities

- `registry-source-config`: Replace "No built-in registry source" requirement with a built-in default registry source at `https://registry.agentxm.ai`. Remove the registry configuration guard requirement entirely — with a built-in registry source always present, the guard is dead code.

## Impact

- `packages/cli/src/runtime/index.ts` — single `DEFAULT_REGISTRY_URL` constant, env var resolution, visual indicator
- `packages/cli/src/workspace/source-metadata.ts` — change `BUILT_IN_SOURCES` to `getBuiltInSources(registryUrl)` function, add registry entry
- `packages/cli/src/cli-commands/auth/login/handler.ts` — yield `RegistryUrl` service instead of local constant
- `packages/cli/src/cli-commands/auth/logout/handler.ts` — same
- `packages/cli/src/cli-commands/auth/whoami/handler.ts` — same
- `packages/cli/src/cli-commands/auth/token/handler.ts` — same
- `packages/cli/src/auth/auth-middleware.ts` — replace URL-matching gate with credential-based gating, narrow `RegistryUrl` to ambient token scoping, delete `isRegistryRequest` helper
- `packages/cli/src/auth/token-resolution.ts` — split `resolveToken` into `resolveStoredToken` + `resolveAmbientToken`
- `packages/cli/src/sources/registry-guard.ts` — delete file and test
- `packages/cli/src/sources/index.ts` — remove `registryGuard` export
- 7 call sites removing `registryGuard` invocations:
  - `cli-commands/skills/install/command-actions.ts`
  - `cli-commands/skills/publish/handler.ts`
  - `cli-commands/skills/fork/handler.ts`
  - `cli-commands/packs/install/command-actions.ts`
  - `cli-commands/packs/publish/handler.ts`
  - `cli-commands/commands/install/command-actions.ts`
  - `cli-commands/mcp-servers/install/command-actions.ts`
- Settings schema unchanged — `SourceHostConfig` already supports registry type
