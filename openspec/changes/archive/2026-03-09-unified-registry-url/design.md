## Context

The default registry URL (`https://registry.agentxm.ai`) is hardcoded in 5 independent locations:

1. `runtime/index.ts` — `DEFAULT_REGISTRY_URL` constant, fed to the `RegistryUrl` Effect service (used by auth middleware and auth guard)
2. `cli-commands/auth/login/handler.ts` — local `DEFAULT_REGISTRY_URL` constant
3. `cli-commands/auth/logout/handler.ts` — same
4. `cli-commands/auth/whoami/handler.ts` — same
5. `cli-commands/auth/token/handler.ts` — same

Meanwhile, extension resolution uses a completely separate path: source configs from settings.json, merged with built-in sources (`BUILT_IN_SOURCES` in `workspace/source-metadata.ts`). The built-in sources include github/gitlab/bitbucket but **no registry source**. Users must explicitly configure a registry source before `axm skills install @namespace/skills/name` works.

The auth middleware also has a fundamental coupling problem: it uses a single `RegistryUrl` value to decide which HTTP requests receive Bearer tokens. If a user configures a registry source with a different URL, extension resolution makes requests to that URL — but the middleware doesn't inject tokens because the URL doesn't match its single `RegistryUrl` value. The request goes out unauthenticated.

This creates three problems:

- Auth and extension resolution can point at different registries
- New users hit `REGISTRY_NOT_CONFIGURED` on their first registry install despite the default registry existing
- Auth tokens are only injected for requests matching one hardcoded URL, not for any authenticated registry

## Goals / Non-Goals

**Goals:**

- Single source of truth for the default registry URL
- `AXM_REGISTRY_URL` env var overrides both auth and extension resolution
- Auth command handlers consume the `RegistryUrl` service instead of local constants
- Built-in registry source so `axm skills install @acme/skills/foo` works without configuration
- Auth middleware injects tokens for any registry where credentials exist, not just one hardcoded URL
- Visual indicator when a non-default registry URL is active

**Non-Goals:**

- CLI `--registry` flag — can be layered on later if needed
- Changes to the settings schema or `SourceHostConfig` type

## Decisions

### 1. Single constant in `runtime/index.ts`, env var override

The `DEFAULT_REGISTRY_URL` constant stays in `runtime/index.ts` and becomes the sole source. The `RegistryUrl` service layer reads from env first:

```typescript
const DEFAULT_REGISTRY_URL = "https://registry.agentxm.ai";
const REGISTRY_URL = process.env["AXM_REGISTRY_URL"] ?? DEFAULT_REGISTRY_URL;
const RegistryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
```

**Why here:** `runtime/index.ts` already constructs the `AppLayer` and is the natural place for env var resolution (same pattern as telemetry mode resolution). The `RegistryUrl` service is already in `AppLayer`, so all handlers can yield it.

**Alternative considered:** Define the constant in a shared `constants.ts` or in the auth module. Rejected because CLAUDE.md explicitly discourages cross-feature constants files, and the runtime module is where layer composition happens.

### 2. Narrow the role of `RegistryUrl` to "default auth target"

`RegistryUrl` currently serves two purposes: (a) the default registry for auth commands, and (b) the gating check in auth middleware. This change narrows it to **(a) only** — the URL that auth operations target when no explicit registry is specified.

The auth middleware no longer depends on `RegistryUrl` for deciding which requests get tokens (see Decision 6). It retains a narrow dependency for ambient token scoping only (see Decision 6, `resolveAmbientToken`).

**Consumers after this change:**

- `auth/login/handler.ts` — default target for device code flow
- `auth/logout/handler.ts` — default target for credential removal
- `auth/whoami/handler.ts` — default target for identity lookup
- `auth/token/handler.ts` — default target for token display
- `auth/guard.ts` (`withAuthGuard`) — pre-checks token availability against the default registry before publish operations. This is the most critical consumer because the registry client bypasses the auth middleware entirely (see pre-existing issue in Risks), making the guard the only auth mechanism that works for publish.

Each auth handler currently defines `const DEFAULT_REGISTRY_URL = "https://registry.agentxm.ai"` and uses it directly. Change to:

```typescript
const registryUrl = yield * RegistryUrl;
```

This removes the 4 local constants and makes auth commands respect the `AXM_REGISTRY_URL` override automatically.

### 3. Parameterize built-in sources with registry URL

Change `BUILT_IN_SOURCES` from a static array to a function that receives the resolved registry URL:

```typescript
export const getBuiltInSources = (registryUrl: string): ReadonlyArray<SourceHostConfig> => [
  { name: "default", type: "registry", location: new URL(registryUrl) },
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];
```

Registry listed first because it's the primary source for native extensions. The three-layer merge (project → global → built-in) means users can override by adding a source named `"default"` in their settings.

**Threading mechanism:** `runtime/index.ts` calls `getBuiltInSources(REGISTRY_URL)` and passes the result into the workspace layer constructor. The workspace service receives built-in sources as a construction parameter rather than importing a static array. This keeps the workspace module unaware of where built-in sources come from — the runtime is the composition root.

```typescript
// runtime/index.ts — layer construction
const builtInSources = getBuiltInSources(REGISTRY_URL);
// ... pass builtInSources into workspace layer construction

// workspace/service.ts — receives as parameter, no longer imports BUILT_IN_SOURCES
const merged = [...projectSources, ...filteredGlobal, ...builtInSources.filter(...)];
```

**Why parameterize instead of a second env var read:** The design's core goal is a single source of truth. A static array with its own `process.env` read would duplicate both the literal URL and the env var resolution logic — two independent definitions that must stay in sync. Parameterizing costs one function argument at one call site and eliminates the duplication entirely.

**Why not derive from `RegistryUrl` service:** Making `BUILT_IN_SOURCES` depend on an Effect service would require threading it through workspace construction as an effectful operation. The function parameter achieves the same result (single source) without changing the workspace construction flow — just pass a string.

### 4. Remove registry guard entirely

With a built-in registry source, `getRegistrySourceHosts()` always returns at least one entry. The guard's entire purpose — detecting missing registry configuration and prompting/failing — becomes dead code. Delete it rather than leaving a no-op.

**Files to delete:**

- `packages/cli/src/sources/registry-guard.ts`
- `packages/cli/src/sources/registry-guard.test.ts`

**Call sites to clean up (remove `yield* registryGuard` and its import):**

- `cli-commands/skills/install/command-actions.ts`
- `cli-commands/skills/publish/handler.ts`
- `cli-commands/skills/fork/handler.ts`
- `cli-commands/packs/install/command-actions.ts`
- `cli-commands/packs/publish/handler.ts`
- `cli-commands/commands/install/command-actions.ts`
- `cli-commands/mcp-servers/install/command-actions.ts`

**Export to remove:**

- `packages/cli/src/sources/index.ts` — remove `registryGuard` re-export

**Why delete instead of keeping as a no-op:** The guard existed because there was no built-in registry. With the built-in, the guard would always pass — keeping it adds complexity with no value. If multi-registry support is added later, a different mechanism (namespace routing) is the right approach, not a guard.

### 5. Visual indicator via `@clack/prompts`

When `REGISTRY_URL !== DEFAULT_REGISTRY_URL`, log a warning at the start of `run()`:

```typescript
if (REGISTRY_URL !== DEFAULT_REGISTRY_URL) {
  p.log.warn(`Using registry: ${REGISTRY_URL}`);
}
```

Uses `@clack/prompts` directly (not the `ClackLog` Effect service) because this fires before the Effect program starts. This matches how `run()` already uses `console.error` for error output at the boundary.

### 6. Auth middleware: credential-based gating instead of URL matching

The current auth middleware uses `RegistryUrl` to decide which requests get tokens:

```typescript
// Current: single URL gate
const registryUrl = yield * RegistryUrl;
if (!isRegistryRequest(request.url, registryUrl)) {
  return yield * baseClient.execute(request);
}
const maybeToken = yield * resolveToken(registryUrl, flagToken);
```

This breaks when extension resolution uses a registry URL that differs from `RegistryUrl` (e.g., a user-configured registry source). The middleware should inject tokens for **any registry where credentials exist**, not just one.

**New approach:** Split token resolution into two concerns — stored credentials (any origin) and ambient tokens (default registry only) — then compose them in the middleware.

**Split `resolveToken` into two functions:**

```typescript
// token-resolution.ts

/** Look up stored credentials for a specific origin. */
export const resolveStoredToken = (
  origin: string,
): Effect.Effect<Option.Option<TokenSource>, CliError, CredentialStore> => ...

/** Resolve ambient token (AXM_TOKEN env var or --token flag). Not origin-scoped. */
export const resolveAmbientToken = (
  flagToken?: string,
): Effect.Effect<Option.Option<TokenSource>> => ...
```

`resolveStoredToken` handles only credential store lookup by origin. `resolveAmbientToken` handles only `AXM_TOKEN` env var and `--token` flag checks. The existing `resolveToken` (used by `withAuthGuard` and auth commands) can be preserved as a composition of both for backward compatibility.

**Middleware composition:**

```typescript
// New: credential-based gate with scoped ambient tokens
const registryUrl = yield * RegistryUrl;
const origin = new URL(request.url).origin;

// 1. Check stored credentials for this origin (any registry)
const storedToken =
  yield *
  resolveStoredToken(origin).pipe(
    Effect.provide(storeLayer),
    Effect.catchAll(() => Effect.succeed(Option.none<TokenSource>())),
  );

// 2. If no stored credentials and this is the default registry, check ambient tokens
const maybeToken = Option.isSome(storedToken)
  ? storedToken
  : origin === new URL(registryUrl).origin
    ? yield * resolveAmbientToken(flagToken)
    : Option.none<TokenSource>();

if (Option.isNone(maybeToken)) {
  return yield * baseClient.execute(request);
}
// ... inject token, refresh logic unchanged
```

The key changes:

- **`RegistryUrl` stays in the middleware but with a narrow role** — only for scoping ambient tokens (`AXM_TOKEN`/`--token`) to the default registry origin. It no longer gates which requests get credentials.
- **Stored credentials work for any origin.** If a user authenticates against a non-default registry via `axm login`, the middleware injects tokens for requests to that registry automatically.
- **`AXM_TOKEN` works without `axm login`.** CI pipelines that set `AXM_TOKEN` without running `axm login` (empty credential store) still work — the ambient token check fires for the default registry origin regardless of credential store state. This preserves current behavior.
- **No token leakage.** `AXM_TOKEN` is only injected for requests to the default registry origin, not to github.com, gitlab.com, etc.
- **Token refresh** uses the `registryUrl` from the `CredentialStoreTokenSource` (already stored per-credential), so refresh endpoints are always correct regardless of which registry the credential belongs to.
- **Delete `isRegistryRequest`** — the `isRegistryRequest` helper (`auth-middleware.ts`) becomes dead code with credential-based gating. Remove it.

**Why origin-based:** `new URL(request.url).origin` gives `https://registry.agentxm.ai` from `https://registry.agentxm.ai/v1/extensions/...`. The credential store is keyed by the same origin-level URL. This is a natural match.

**Alternative considered:** Pass a set of known registry URLs to the middleware. Rejected because it would require threading workspace state into the middleware layer, and wouldn't handle registries the user hasn't configured as sources (e.g., authenticated via `axm login` but not in settings).

## Risks / Trade-offs

**Registry guard removal** — Users who relied on the interactive prompt to configure a local registry path will no longer see it. → Mitigation: This is the desired behavior. The prompt existed as a workaround for missing built-in config. Users who want a local registry can configure one in settings (`sources` array), which overrides the built-in by name.

**Credential store lookup on every request** — The middleware now calls the credential store for all HTTP requests, not just registry-matched ones. → Mitigation: The credential store file is read once at layer construction time and cached in-memory. The per-request lookup is a dictionary key check — negligible overhead.

**`AXM_TOKEN` leaking to non-registry hosts** — Without the `isRegistryRequest` gate, a single `resolveToken` call would inject `AXM_TOKEN` into all HTTP requests. → Mitigation: Split into `resolveStoredToken` (any origin) and `resolveAmbientToken` (default registry only). The middleware only applies ambient tokens when the request origin matches `RegistryUrl`. See Decision 6.

**Origin extraction assumes valid URLs** — `new URL(request.url).origin` throws on invalid URLs. → Mitigation: All HTTP requests in the CLI use well-formed URLs constructed by `@effect/platform`. If an invalid URL reaches the middleware, the request would fail anyway.

**Pre-existing: registry client bypasses auth middleware** — `createRegistryClient` in `client.ts` constructs a fresh `FetchHttpClient` via `Effect.provide(FetchHttpClient.layer)`, bypassing the auth-wrapped `HttpClient` in `AppLayer`. Registry HTTP requests (publish, read) go out without Bearer tokens from the middleware. Auth currently works for publish only because `withAuthGuard` pre-checks token availability — but the token is not actually injected into publish requests. This is a pre-existing issue outside the scope of this change, but worth noting as context for the middleware redesign.
