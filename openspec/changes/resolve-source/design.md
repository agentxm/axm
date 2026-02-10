## Context

`determineSourceInput` parses a user string into a `SourceInput` — coordinates only (owner/repo, path, etc.). The `Source` type in `types.ts` is defined as `SourceInput & SourceConfig` for git hosting providers, meaning it carries both coordinates and provider configuration (base URL, name). Today, nothing actually produces a `Source`. Handlers pass `SourceInput` directly to `SourceProviders.resolve`, and config values are either hardcoded (`buildCloneUrl` uses `https://github.com/...`) or fetched ad-hoc inside providers (registry meta-provider reads workspace config).

Settings store source configs as a `sources` array — each entry has a `name`, `source` discriminator, and provider-specific fields like `url` (git hosting) or `location` (registry). Built-in defaults exist for `github`, `gitlab`, and `bitbucket`. Multiple configs of the same source type are supported by the schema (e.g., `github.com` + a GitHub Enterprise instance).

## Goals / Non-Goals

**Goals:**

- Single function (`resolveSource`) that takes a user string and returns a fully-resolved `Source`
- Multi-config matching: disambiguate when multiple configs share a source type
- `SourceProviders` service accepts `Source` (not `SourceInput`), giving providers access to config fields
- `buildCloneUrl` uses config `url` field instead of hardcoded URLs

**Non-Goals:**

- Changing the parser (`determineSourceInput`) — it stays as the lower-level pure function
- Changing how registry scope routing works — the meta-provider continues to handle that internally
- Adding new source types or shorthand prefixes

## Decisions

### Decision 1: `resolveSource` function in `sources/resolve-source.ts`

New file `sources/resolve-source.ts` exports `resolveSource(input: string)`. It depends on `Workspace` (for `getConfiguredSources`).

Pipeline:

1. Call `determineSourceInput(input)` → `SourceInput`
2. Match on `source.source` discriminator
3. For git hosting types: find matching config, merge input + config → `Source`
4. For git/local/registry: pass through as-is (self-describing)

**Why a new file?** `parser.ts` is pure (no Effect services). `resolveSource` requires `Workspace`, so it belongs in a separate effectful module. `resolve-source.ts` follows the feature naming convention.

### Decision 2: Multi-config matching for git hosting providers

When multiple configs share the same `source` type, `resolveSource` disambiguates using the input pattern:

**URL/SCP inputs** — match by hostname. Compare the hostname from the parsed URL against hostnames derived from each config's `url` field. Example: `https://github.enterprise.com/owner/repo` matches config `{ name: "ghe", source: "github", url: "https://github.enterprise.com" }`.

**Shorthand inputs** — match by config name OR source type. The existing shorthand prefix is always a source type (`github:`, `gitlab:`, etc.). To support multi-config, also accept config names as prefixes. The parser's `SHORTHAND_PREFIXES` set is extended to include config names. When a shorthand prefix matches a config name, that specific config is used. When it matches a source type, the first config of that type is selected.

**Fallback** — if exactly one config exists for a source type, use it regardless of input pattern. If none exist (shouldn't happen for built-in types), fail with `ParseError`.

**Ambiguous** — if multiple configs match and the input can't disambiguate, fail with a `ParseError` listing available config names.

**Alternatives considered:**

- _Always use first config_ — simpler but prevents GitHub Enterprise use cases
- _Require explicit config name for all multi-config_ — too strict, breaks `github:owner/repo` when there's only one GitHub config

### Decision 3: Registry `Source` type simplification

`RegistrySource` changes from `RegistrySourceInput & RegistrySourceConfig` to just `RegistrySourceInput`. The registry meta-provider handles config lookup internally via `workspace.getConfiguredRegistrySources()` with scope routing. Merging a specific config into the `Source` type doesn't make sense because:

- `RegistrySourceInput` is `{ source: "registry" }` with no coordinates
- Multiple registry configs may be queried in sequence (scope routing, fallthrough)
- The meta-provider already encapsulates this complexity

This aligns `RegistrySource` with `GitRepositorySource` and `LocalSource` — all three are self-describing.

```typescript
// Before
export type RegistrySource = RegistrySourceInput & RegistrySourceConfig;

// After
export type RegistrySource = RegistrySourceInput;
```

### Decision 4: `buildCloneUrl` uses config `url` field

`buildCloneUrl` changes signature from `(source: SourceInput)` to `(source: Source)`. For git hosting sources, it constructs the clone URL from `source.url` (config base URL) + `source.owner`/`source.repo` instead of hardcoding `https://github.com/...`.

```typescript
// Before
case "github":
  return Effect.succeed(`https://github.com/${source.owner}/${source.repo}.git`);

// After
case "github":
  return Effect.succeed(`${source.url}/${source.owner}/${source.repo}.git`);
```

This enables GitHub Enterprise, self-hosted GitLab, etc. with zero additional code.

### Decision 5: `SourceProviders` interface change

`resolve` → `resolveExtension`. Parameter changes from `SourceInput` to `Source`.

```typescript
export interface SourceProvidersService {
  readonly resolveExtension: (
    source: Source,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<ExtensionRef>, SourceError | SettingsError, Scope.Scope>;

  readonly fetch: (ref: ExtensionRef) => Effect.Effect<ExtensionFiles, SourceError, Scope.Scope>;
}
```

The dispatch table in `SourceProvidersLive` continues to work unchanged — `Source` extends `SourceInput`, so `source.source` is still the discriminator.

Provider `find` signatures change from `SourceInput` to `Source` so they can access config fields. Providers that don't need config (local, git) are unaffected since `Source` for those types equals `SourceInput`.

### Decision 6: Shorthand prefix expansion for config names

The parser's `SHORTHAND_PREFIXES` set is currently built from source descriptors (static). To support config-name prefixes, `resolveSource` does a two-phase parse:

1. Try `determineSourceInput(input)` — handles all existing patterns
2. If that fails, check if the prefix before `:` matches a config name from `getConfiguredSources()`. If so, re-parse the remainder using the config's source type descriptor.

This avoids changing the pure parser. The config-name lookup happens in `resolveSource` (which already has `Workspace` access).

**Example:** Config `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`. Input `ghe:owner/repo` → prefix `ghe` doesn't match any source type → `determineSourceInput` fails → `resolveSource` finds config named `ghe` → parses `ghe:owner/repo` using the GitHub descriptor → produces `GitHubSource` with the `ghe` config merged.

## Risks / Trade-offs

**Config-name prefixes overlap with source-type prefixes** — a config named `github` is indistinguishable from the source type prefix. This is fine: the built-in config named `github` _is_ the default GitHub config. If a user names their GHE config `github`, it overrides the built-in (existing settings merge behavior). → Mitigated by convention: built-in names match source types.

**Breaking change to `SourceProviders` interface** — all call sites of `resolve` must update. → Mitigated by small number of call sites (2 handlers, 2 resolvers). Backward compatibility is a non-goal.

**Registry type simplification** — downstream code that expects `RegistrySource` to have config fields (`name`, `location`) will break. → Audit all usages of `RegistrySource` type. The meta-provider doesn't expose config fields externally, so impact should be minimal.
