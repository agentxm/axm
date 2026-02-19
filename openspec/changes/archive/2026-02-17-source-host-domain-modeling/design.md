## Context

The source domain currently uses a two-level model: `SourceInput` (parsed coordinates) and `Source` (input + config from settings). This works but conflates several concerns:

- **Two competing `ExtensionRef` types**: `resolution/types.ts` has a flat `ExtensionRef` (source is a `SourceType` string, carries `origin`, `ref`, `name`, `path`, `metadata`), while `sources/provider.ts` has a discriminated `ExtensionRef = SkillRef | McpServerRef` (carries full `SourceInput`, `location`, `version`). These serve different layers but represent the same concept.
- **Host config is implicit**: Git hosting providers need a URL from settings (`SourceConfig`), but this is intersected at the `Source` level rather than modeled as a distinct concept. Local and git sources are "self-describing" — they don't need config — but this isn't expressed in the type system. Registry sources are similar — `RegistrySource = RegistrySourceInput` (no config intersection); the registry URL and scopes live only in `RegistrySourceConfig` in settings and are never present on the resolved `Source`.
- **Provider capabilities are ad hoc**: `RegistrySourceProvider` extends `SourceProvider` with extra methods (`publishVersion`, etc.) but there's no formal way to ask "does this provider support publishing?"
- **Settings SourceConfig ≠ Source types**: `SourceConfig` in settings has `name` (for user reference) and `url`, while `SourceInput` types carry coordinates (`owner`, `repo`, etc.). The mapping between them is implicit.

The codebase is `@experimental` throughout these modules, so backward compatibility is a non-goal.

## Goals / Non-Goals

**Goals:**

- Establish a clear three-layer type hierarchy: `SourceHost` → `SourceParams` → `Source`
- Unify the two `ExtensionRef` types into a single `SourceExtensionRef`
- Formalize `SourceHostProvider` with declared operation capabilities
- Make `sources/types.ts` the single source of truth for all source domain types
- Enable type-safe operation dispatch (e.g., only call publish on providers that support it)

**Non-Goals:**

- Adding new source types (e.g., well-known, Mintlify) — that's future work that this model enables
- Changing runtime behavior of resolution or discovery — this is a type/structural refactor
- Modifying the lockfile format on disk — lock entries stay compatible (schema changes are internal)
- Changing the settings file format on disk — `SourceConfig` shape stays the same for users

## Decisions

### 1. Flat intersection for Source types (not nested composition)

**Decision**: `Source = SourceHost & SourceParams` as a flat type intersection, with `type` as the shared discriminator.

**Why**: Matches the examples in AXM-17 and keeps pattern matching simple — `switch (source.type)` gives access to all fields directly. Nested `source.host.url` / `source.params.owner` adds indirection without benefit.

**Alternative considered**: Nested composition (`{ host: GitHubSourceHost; params: GitHubSourceParams }`). Rejected because it makes destructuring awkward and doesn't improve type safety — the `type` discriminator already tells you which fields exist.

### 2. SourceHost is the domain type; settings name stays in settings

**Decision**: `SourceHost` contains only the information needed to _access_ a source (type + url + scopes). The user-assigned `name` label from settings does not live on `SourceHost` — it stays in a settings-layer wrapper: `SourceHostConfig = { readonly name: string } & ConfiguredSourceHost`.

**Why**: The `name` is a settings/UX concern (user labels their configured sources), not a domain concern. Keeping it off `SourceHost` avoids a field collision with `RegistrySourceParams.name` (extension name) and keeps the domain model clean. The lockfile's `sourceName` field references the settings name where needed, without the domain types carrying it.

```typescript
// Before: SourceConfig { name, type, url } + SourceInput { type, owner, repo, ... } → Source
// After:  SourceHost { type, url } + SourceParams { type, owner, repo, ... } → Source
//         Settings stores: SourceHostConfig = { name } & SourceHost
```

Self-describing sources (local, git) have `SourceHost` variants with no configuration fields beyond `type`. Their host is implicit — the type itself tells you how to access them.

### 3. SourceHostProvider with two-tier interface

**Decision**: `SourceHostProvider` is the base interface with `find` and `fetch` (all providers support these). `PublishableSourceHostProvider` extends it with registry-specific operations. No runtime capability tags — the type system handles dispatch.

```typescript
interface SourceHostProvider<S extends Source = Source, R = never> {
  readonly type: S["type"];
  readonly find: (
    source: S,
    options: FindOptions,
  ) => Effect<ReadonlyArray<SourceExtensionRef>, CliError, R>;
  readonly fetch: (source: S, ref: SourceExtensionRef) => Effect<ExtensionFiles, CliError, R>;
}

interface PublishableSourceHostProvider<
  S extends Source = Source,
  R = never,
> extends SourceHostProvider<S, R> {
  readonly publishVersion: (
    namespace: string,
    type: RegistryExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect<void, CliError, R>;
}
```

**Why**: Callers that need publish operations already know they're working with a registry source — they type their variable as `PublishableSourceHostProvider` directly. Runtime capability checks would be redundant with the type hierarchy. The `publishVersion` method accepts the full publication payload (scope, extension type, name, version, archive bytes, version metadata) because the calling handler already constructs all of these — the provider shouldn't need to rediscover them.

**Alternative considered**: All operations optional with capability tags only. Rejected because it makes the common `find`/`fetch` path require null checks everywhere.

**Alternative considered**: Separate interfaces (Discoverable, Fetchable, Publishable) composed via intersection. Rejected as over-engineered — we have exactly two tiers (base and publishable), not an arbitrary composition.

### 4. Unified SourceExtensionRef replaces both ExtensionRef types

**Decision**: `SourceExtensionRef` is a two-dimensional discriminated union: extension type × source type. Each combination has exactly the fields it needs — no `Option` wrappers for inapplicable fields.

Source-specific details are factored into reusable types:

```typescript
// Source-specific ref details
interface GitHostedRefDetails {
  readonly location: string; // file:// URL to cloned directory
  readonly gitTreeSha: Option<string>;
}
interface RegistryRefDetails {
  readonly version: string;
  readonly checksum: string;
}
interface LocalRefDetails {
  readonly location: string; // file:// URL to local directory
}

// Skill refs = SkillRefBase & source-specific details
interface SkillRefBase {
  readonly type: "skill";
  readonly skill: {
    readonly name: string;
    readonly description: string;
    readonly metadata: Option<Record.ReadonlyRecord<string, unknown>>;
  };
}
type GitHubSkillRef = SkillRefBase & { source: GitHubSource } & GitHostedRefDetails;
type RegistrySkillRef = SkillRefBase & { source: RegistrySource } & RegistryRefDetails;
type LocalSkillRef = SkillRefBase & { source: LocalSource } & LocalRefDetails;
// ... etc for each source type
```

**Why**: The current split between resolution's `ExtensionRef` (flat, carries `SourceType` string) and provider's `ExtensionRef` (carries full `SourceInput`) means information is lost or duplicated depending on which layer you're in. A single two-dimensional type eliminates the translation layer and ensures each ref carries exactly the right fields for its source.

**Migration**: Resolution resolvers currently produce the flat `ExtensionRef` — they'll be updated to produce `SourceExtensionRef` with full `Source` attached. This is possible because resolvers already have access to the source they resolved from.

### 5. Providers own URL matching via `match`

**Decision**: `SourceHostProvider` includes a `match(url: URL)` method that returns `Effect<boolean, CliError, R>`. The method answers "does this URL belong to me?" — nothing more. Parsing the URL into `SourceParams` is handled by the existing per-provider parsers (e.g., `github.parseUrl`, `gitlab.parseUrl`), which the resolution layer calls after `match` returns `true`.

```typescript
interface SourceHostProvider<S extends Source = Source, R = never> {
  readonly type: S["type"]
  readonly match: (url: URL) => Effect<boolean, CliError, R>
  readonly find: ...
  readonly fetch: ...
}
```

**Why**: Matching a URL to a source type can require I/O — e.g., fetching `/.well-known/skills/index.json` to confirm a well-known source, or checking a registry API. Keeping this in the parser would force effectful logic into what should be a pure classifier. Providers already have the domain knowledge to recognize their own URLs. Returning `boolean` (not `SourceParams`) keeps the method focused — URL-to-params parsing is a separate concern already handled by existing provider parsers.

**Resolution flow**: The parser handles known patterns (`github.com/...` → `GitHubSourceParams`). For unrecognized URLs, the resolution pipeline asks providers via `match()` until one claims the URL. Once claimed, the resolution layer calls the claiming provider's parser to produce `SourceParams`, then combines with `SourceHost` to produce `Source`. This enables source refinement (`url → well-known`, `url → mintlify`) without hardcoding patterns in the parser.

### 6. Option fields stay on SourceParams, not SourceHost

**Decision**: `ref` (git ref), `subPath`, and `versionConstraint` are `SourceParams` fields (they're coordinates, not host configuration). They remain `Option<string>` per project conventions.

**Why**: These are user-specified per-resolution, not per-source-configuration. The host knows _how_ to reach GitHub; the params know _which repo/ref/path_ to fetch.

### 7. `builtin` is a source type

**Decision**: Add `"builtin"` to `SourceType` as a full member, with `BuiltinSourceHost`, `BuiltinSourceParams`, `BuiltinSource`, and a `BuiltinSourceHostProvider`. Both host and params are trivial (just `{ type: "builtin" }`) — like `LocalSourceHost` but even simpler.

**Why**: `"builtin"` currently exists only in the lockfile schema's `type` discriminator, not in `SourceType` (`sources/types.ts`). This means `lockEntryToSourceInput` throws for builtin entries, `printSourceInput` can't handle them, and exhaustive switches on `SourceType` need exclusion branches. Adding it to `SourceType` eliminates all of these. The union aligns 1:1 with the lockfile's `type` discriminator, making conversions mechanical. The provider is a simple in-memory lookup of bundled extensions — trivial, but uniform.

### 8. `sourceName` stays at the lockfile boundary, not on `RegistryRefDetails`

**Decision**: `RegistryRefDetails` carries only `version` and `checksum` (intrinsic to the resolved ref). Registry scope and name are accessed via `ref.source.scope` / `ref.source.name` (from `RegistrySourceParams`). The `sourceName` (which named registry config was used) is injected at the lock-entry conversion boundary, not carried on the ref.

**Why**: `sourceName` is a settings cross-reference — it maps the ref back to a named `SourceHostConfig` in the user's settings. It's analogous to keeping `name` off `SourceHost` (Decision 2). The ref describes _what was found_; the lockfile records _which config found it_. The current pattern of injecting `sourceName` at `sourceToLockEntry` time is correct and continues unchanged.

### 9. Resolution layer produces `Source`, not `SourceExtensionRef`

**Decision**: Resolution resolvers classify input strings into `Source` (coordinates + host config). They no longer produce their own `ExtensionRef`. The resolution layer's `ExtensionRef` and `ExtensionMetadata` types are eliminated. Extension discovery is exclusively the provider's responsibility via `find()`.

**Why**: The current resolution `ExtensionRef` conflates two concerns: "which source does this input refer to?" (routing) and "what extensions exist there?" (discovery). Some resolvers (e.g., `resolveAxmName`) shortcut by scanning the filesystem directly, duplicating provider logic. With the new model:

- **Resolution**: `string → Source` (parse and classify)
- **Providers**: `Source → SourceExtensionRef[]` (discover extensions)

This eliminates the translation layer between two incompatible `ExtensionRef` types and ensures all discovery goes through providers. Resolvers that currently scan the filesystem (e.g., looking for installed extensions) will instead produce a `LocalSource` and let the local provider handle discovery.

**Concrete pipeline**: `resolveSource` in `sources/resolve-source.ts` already returns `Source` — it classifies input strings via pattern matching (URL, shorthand, name, path, registry, slash) and routes to the appropriate parser. The current `resolveExtension` in `resolution/resolver.ts` (which returns the resolution-layer `ExtensionRef[]`) is eliminated. Callers that need extension discovery use `resolveSource` + `SourceHostProviders.find()`:

```typescript
// Before: resolution returned discovered refs directly
const refs = yield * resolveExtension(input, options); // ExtensionRef[] from resolution/types.ts

// After: resolution produces Source, discovery is separate
const source = yield * resolveSource(input); // Source
const refs = yield * providers.find(source, findOptions); // SourceExtensionRef[]
```

The resolution module's individual resolvers (`resolveAxmName`, `resolveBareName`, `resolveLocalPath`, `resolveExplicitSource`, `resolveUrl`, `resolveAmbiguous`) are subsumed by `resolveSource`, which already handles all pattern types. `ResolutionOptions` is simplified or removed — source/type filtering moves to `FindOptions`, and workspace context is already available via the `Workspace` service dependency.

**NameInput resolution** (bare name like `my-skill`) fits this model without special handling:

- **Tier 1 — lockfile lookup**: Finds the skill by name in the lockfile → resolves to `LocalSource` pointing to the installed directory. The `LocalSourceParams.path` is derived from the workspace layout (e.g., `<extensions-dir>/skills/<name>` for external sources, `<registry-dir>/<namespace>/skills/<name>` for registry sources), not stored in the lock entry. The resolution layer answers "where is this extension now?" — the caller then does `find(localSource)` to discover what's there. For operations that need the _original_ source (e.g., update checks), the update handler reads the lockfile entry directly and reconstructs the original `Source` from lock entry fields (see below).
- **Tier 2 — configured skills**: Finds the skill in settings → recursively calls `resolveSource()` on the configured source string → returns whatever `Source` that string resolves to.

**Lockfile-to-Source reconstruction** (for update/reinstall from original source):

- Self-describing sources (local, builtin): trivial — lock entry fields map directly to `Source`.
- Registry sources: lock entry carries `sourceName` → look up `RegistrySourceHost` from settings, combine with `RegistrySourceParams` from lock entry fields (`scope`, `name`).
- Git hosting sources: lock entry fields (`owner`, `repo`, etc.) map to `SourceParams`. The `SourceHost` is looked up from settings by type. If multiple configs exist for the same type (e.g., github.com + GHE), disambiguation is a future concern — for now, match the first config of that type. Adding `sourceName` to git hosting lock entries (like registry already has) is a natural follow-up.

### 10. Provider factories accept `SourceHost` at construction time

**Decision**: Configured providers are constructed with their `SourceHost`: `createGitHostingProvider(host: GitHubSourceHost)`. Self-describing providers (local, git) take no constructor args. The `find` and `fetch` methods receive the full `Source` (host + params).

**Why**: The host config is static per provider instance — it comes from settings and doesn't change between calls. Passing it at construction avoids re-extracting it from `Source` on each operation. This also makes the type parameter concrete: `SourceHostProvider<GitHubSource>` rather than the current loose `SourceProvider<SourceInput>` that accepts any input even though the provider only handles one source type.

```typescript
// Current: provider doesn't know its host config
const provider = createGitHubProvider();
// Service merges config, then passes full Source
provider.find(source, options); // source: SourceInput (too loose)

// New: provider constructed with host
const provider = createGitHostingProvider(host); // host: GitHubSourceHost
provider.find(source, options); // source: GitHubSource (exact)
```

### 11. Registry provider populates `checksum` during discovery

**Decision**: The registry provider's `find()` returns `SourceExtensionRef` with `checksum` populated from the registry index metadata. Checksum is an intrinsic property of a registry ref — it's known at discovery time, not computed later.

**Why**: Currently, `SkillRef` doesn't carry a checksum — it's either hardcoded as `""` or computed during lock-entry conversion. This is a data integrity gap. The registry index already stores (or can store) checksums per version. Moving checksum population to `find()` means the ref is self-contained: callers don't need to separately compute or inject it.

### 12. Operation args take `SourceExtensionRef` directly

**Decision**: `InstallSkillOperationArgs` takes a `SkillExtensionRef` instead of flat fields extracted from the ref. Similarly for `CopySkillOperationArgs`. Lock-entry conversion (`sourceToLockEntry`) switches on `ref.source.type` and pulls all fields from the ref.

**Why**: Currently `InstallSkillOperationArgs` manually destructures `source`, `skill`, `location`, `version`, and `gitTreeSha` from a `SkillRef` into flat fields — then `sourceToLockEntry` needs a separate `registry?` sidecar for checksum/version because the ref doesn't carry them. With `SkillExtensionRef`, the ref is self-contained: all source-specific details (location, gitTreeSha, version, checksum) are on the ref itself. The operation args simplify to ref + operational params:

```typescript
// Before: flat extraction from SkillRef + registry sidecar
type InstallSkillOperationArgs = {
  readonly source: SourceInput;
  readonly skill: Skill;
  readonly location: string;
  readonly version: Option<string>;
  readonly gitTreeSha: Option<string>;
  readonly agents: ReadonlyArray<string>;
  readonly force: boolean;
  readonly skipSettings?: boolean;
};

// After: ref carries everything, operation adds only operational params
type InstallSkillOperationArgs = {
  readonly ref: SkillExtensionRef;
  readonly agents: ReadonlyArray<string>;
  readonly force: boolean;
  readonly skipSettings?: boolean;
};
```

`CopySkillOperationArgs` simplifies similarly — the ref carries source and location:

```typescript
// Before: flat fields
type CopySkillOperationArgs = {
  readonly source: SourceInput;
  readonly targetName: string;
  readonly location: string;
};

// After: ref carries source + location, operation adds only the target name
type CopySkillOperationArgs = {
  readonly ref: SkillExtensionRef;
  readonly targetName: string;
};
```

`sourceToLockEntry` switches on `ref.source.type` — registry refs carry `version` and `checksum` on the ref details, with `scope` and `name` from `ref.source`; git refs carry `gitTreeSha`; local refs carry `location`. Only `sourceName` is injected at the boundary (Decision 8).

### 13. SourceParams comparison uses `Data.struct` for structural equality

**Decision**: `SourceParams` variants are plain interfaces (matching the domain model definitions). At comparison sites, wrap with `Data.struct()` for structural equality via `Equal.equals()`. This eliminates the manual field-by-field comparison logic currently in the update handler.

**Why**: `update/handler.ts` has a ~30-line switch statement comparing sources by type-narrowing and checking `owner`/`repo`/`scope`/`name` individually. `Data.struct()` wraps any plain object with structural equality — nested `Option` values compare correctly because `Option` implements `Equal`. This avoids `Data.TaggedClass` (which produces class instances incompatible with flat intersection via spread for `Source` construction per Decision 1).

**Bug fix**: The current comparison has a latent bug — Azure Repos sources fall through the same case as GitHub/GitLab/Bitbucket, which checks `owner`/`repo`, but Azure Repos has `organization`/`project`/`repo`. The `Data.struct` approach fixes this automatically since structural equality compares all fields.

**Caveat**: `Data.struct` falls back to `===` for values that don't implement `Equal`. `GitSourceParams.url` is a `URL` object (no `Equal` implementation), so two distinct `URL` instances with the same href would fail equality. This is acceptable — generic git source comparison is not a current use case. If needed in the future, compare `url.href` strings or wrap `URL` in an `Equal`-implementing type.

```typescript
// Before: manual comparison with type narrowing (update/handler.ts:143-170)
if (resolved.type !== sourceArg.type) return Option.none();
switch (resolved.type) {
  case "github":
    if (sourceArg.type === resolved.type && "owner" in sourceArg)
      return resolved.owner === sourceArg.owner && resolved.repo === sourceArg.repo
        ? Option.some(...)
        : Option.none();
  // ... 20 more lines for other source types
}

// After: structural equality via Data.struct
Equal.equals(Data.struct(resolvedParams), Data.struct(sourceArgParams))
  ? Option.some(...)
  : Option.none()
```

### 14. Source merging is type-safe — no `as Source` assertions

**Decision**: The intersection `SourceHost & SourceParams = Source` is type-safe by construction. The service layer intersects a known `SourceHost` (from settings) with `SourceParams` (from resolution/parsing) to produce `Source` without type assertions.

**Why**: `resolve-source.ts` currently has 6 instances of `({ ...si, ...config }) as Source` — manual merges of `SourceInput` with `SourceConfig` that require `as` because TypeScript can't prove the intersection is valid. With the new model, providers claim URLs via `match()` (returns boolean), then the resolution layer calls the provider's parser to produce `SourceParams` and intersects with the provider's `SourceHost` — since both share the same `type` discriminator, the intersection is provably a `Source` variant. No `as` needed.

```typescript
// Before: 6 instances of unsafe merge in resolve-source.ts
Effect.map(parse(url, hostname), (si) => ({ ...si, ...config }) as Source);

// After: type-safe merge — provider claims URL, parser extracts params, host intersects cleanly
const matched = yield * provider.match(url); // boolean
const params = yield * parseUrl(url, hostname); // GitHubSourceParams
const source = { ...host, ...params }; // GitHubSourceHost & GitHubSourceParams = GitHubSource ✓
```

### 15. Clone URL and origin building move into the service

**Decision**: `buildCloneUrl` and `getOrigin` become methods on `SourceHostProvidersService` (not individual `SourceHostProvider` instances). The service dispatches internally by source type. Individual providers don't implement these methods — only git-based providers need clone URLs, and forcing registry/local/builtin providers to implement `cloneUrl` (returning `None`) would pollute the interface.

**Why**: `clone-url.ts` has two exhaustive switches that duplicate provider-specific knowledge (GitHub URL format, Azure Repos `_git` path, etc.). Moving these into the service centralizes the logic while keeping the individual provider interface focused on `match`/`find`/`fetch`. Eliminates `clone-url.ts` entirely.

```typescript
// Before: standalone switch in clone-url.ts
export const buildCloneUrl = (source: Source) => {
  switch (source.type) {
    case "github":
      return `${source.url.origin}/${source.owner}/${source.repo}.git`;
    case "azurerepos":
      return `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`;
    // ... etc
  }
};

// After: service method (dispatches internally by source type)
interface SourceHostProvidersService {
  // ... find, fetch ...
  readonly cloneUrl: (source: Source) => Option<string>;
  readonly origin: (source: Source) => string;
}
```

### 16. Incremental migration via type aliases

**Decision**: Introduce new types in `sources/types.ts`. Add temporary type aliases (`SourceInput = SourceParams`, `Source = Source`) so existing consumers compile during migration. Remove aliases after all consumers are updated.

**Why**: A big-bang rename across 50+ files is risky and hard to review. Type aliases let us land the new model first, then migrate consumers file-by-file in follow-up PRs.

## Domain Model

The complete TypeScript domain model. All types live in `sources/types.ts` unless noted otherwise.

### SourceType

```typescript
// "builtin" is new — currently only in lockfile schema, not in SourceType (see Decision 7)
type SourceType =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "azurerepos"
  | "git"
  | "registry"
  | "local"
  | "builtin";
```

### SourceHost — how to reach a source

Each variant carries the access information for its source type. Configured sources (git hosting, registry) require a URL. Self-describing sources (git, local) need no host configuration — the coordinates themselves contain everything needed.

```typescript
interface GitHubSourceHost {
  readonly type: "github";
  /** Instance URL (e.g., https://github.com or GHE instance) */
  readonly url: URL;
}

interface GitLabSourceHost {
  readonly type: "gitlab";
  readonly url: URL;
}

interface BitbucketSourceHost {
  readonly type: "bitbucket";
  readonly url: URL;
}

interface AzureReposSourceHost {
  readonly type: "azurerepos";
  readonly url: URL;
}

/** Self-describing — the git URL lives in SourceParams */
interface GitSourceHost {
  readonly type: "git";
}

/**
 * Elevates `url` and `scopes` from settings-only (`RegistrySourceConfig`) into the domain model.
 * Currently `RegistrySource = RegistrySourceInput` carries no host config — the registry URL
 * is only available via `RegistrySourceConfig` in settings. After this change, `RegistrySource`
 * gains `url` and `scopes` via the `SourceHost & SourceParams` intersection.
 *
 * `scopes` migrates from `RegistrySourceConfig.scopes?: string[]` to `Option<ReadonlyArray<string>>`.
 * The on-disk settings format is unchanged — the Schema uses `optionFromNullishOr` to bridge
 * the optional array to `Option`.
 */
interface RegistrySourceHost {
  readonly type: "registry";
  readonly url: URL;
  /** Scopes this registry handles; None = catch-all */
  readonly namespaces: Option<ReadonlyArray<string>>;
}

/** Self-describing — the filesystem path lives in SourceParams */
interface LocalSourceHost {
  readonly type: "local";
}

/** Self-describing — bundled extensions, no configuration needed */
interface BuiltinSourceHost {
  readonly type: "builtin";
}

type SourceHost =
  | GitHubSourceHost
  | GitLabSourceHost
  | BitbucketSourceHost
  | AzureReposSourceHost
  | GitSourceHost
  | RegistrySourceHost
  | LocalSourceHost
  | BuiltinSourceHost;
```

### SourceParams — coordinates within a source

Each variant carries the user-specified coordinates needed to locate an extension within a source. Defined as plain interfaces — at comparison sites, wrap with `Data.struct()` for structural equality (see Decision 13).

```typescript
interface GitHubSourceParams {
  readonly type: "github";
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option<string>;
  readonly subPath: Option<string>;
}

interface GitLabSourceParams {
  readonly type: "gitlab";
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option<string>;
  readonly subPath: Option<string>;
}

interface BitbucketSourceParams {
  readonly type: "bitbucket";
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option<string>;
  readonly subPath: Option<string>;
}

interface AzureReposSourceParams {
  readonly type: "azurerepos";
  readonly organization: string;
  readonly project: string;
  readonly repo: string;
  readonly ref: Option<string>;
  readonly subPath: Option<string>;
}

/** No subPath — generic git sources resolve the whole repo (matches current GitRepositorySourceInput) */
interface GitSourceParams {
  readonly type: "git";
  readonly url: URL;
  readonly ref: Option<string>;
}

interface RegistrySourceParams {
  readonly type: "registry";
  readonly namespace: string;
  readonly name: string;
  readonly versionConstraint: Option<string>;
}

interface LocalSourceParams {
  readonly type: "local";
  readonly path: string;
}

interface BuiltinSourceParams {
  readonly type: "builtin";
}

type SourceParams =
  | GitHubSourceParams
  | GitLabSourceParams
  | BitbucketSourceParams
  | AzureReposSourceParams
  | GitSourceParams
  | RegistrySourceParams
  | LocalSourceParams
  | BuiltinSourceParams;
```

### Source — SourceHost & SourceParams

Flat intersections. `switch (source.type)` gives access to all host and params fields.

```typescript
type GitHubSource = GitHubSourceHost & GitHubSourceParams;
type GitLabSource = GitLabSourceHost & GitLabSourceParams;
type BitbucketSource = BitbucketSourceHost & BitbucketSourceParams;
type AzureReposSource = AzureReposSourceHost & AzureReposSourceParams;
type GitSource = GitSourceHost & GitSourceParams;
type RegistrySource = RegistrySourceHost & RegistrySourceParams;
type LocalSource = LocalSourceHost & LocalSourceParams;
type BuiltinSource = BuiltinSourceHost & BuiltinSourceParams;

type Source =
  | GitHubSource
  | GitLabSource
  | BitbucketSource
  | AzureReposSource
  | GitSource
  | RegistrySource
  | LocalSource
  | BuiltinSource;
```

### Convenience unions

```typescript
/** Git hosting providers that require a configured URL */
type GitHostingSourceHost =
  | GitHubSourceHost
  | GitLabSourceHost
  | BitbucketSourceHost
  | AzureReposSourceHost;

type GitHostingSourceParams =
  | GitHubSourceParams
  | GitLabSourceParams
  | BitbucketSourceParams
  | AzureReposSourceParams;

type GitHostingSource = GitHubSource | GitLabSource | BitbucketSource | AzureReposSource;

/** All git-based sources (hosting providers + generic git) */
type GitBasedSource = GitHostingSource | GitSource;

/** Sources that require host configuration from settings */
type ConfiguredSourceHost = GitHostingSourceHost | RegistrySourceHost;

/** Sources that are self-describing (no settings config needed) */
type SelfDescribingSourceHost = GitSourceHost | LocalSourceHost | BuiltinSourceHost;
```

### Settings integration

The settings `name` (user-assigned label) wraps `SourceHost` at the settings layer only. This replaces the current `SourceConfig`.

`ConfiguredSourceHost` is defined in `sources/types.ts` as the canonical domain type. `SourceHostConfig` is defined in `settings/schema.ts` (where settings schemas live) and asserts `satisfies` against the domain types to ensure alignment.

```typescript
// sources/types.ts — domain type
type ConfiguredSourceHost = GitHostingSourceHost | RegistrySourceHost;

// settings/schema.ts — settings layer wraps domain type with user label
type SourceHostConfig = { readonly name: string } & ConfiguredSourceHost;

// Settings schema shape (on-disk format unchanged):
// { sources: SourceHostConfig[] }
//
// Example:
// { name: "my-github", type: "github", url: "https://github.com" }
// { name: "my-registry", type: "registry", url: "file:///path", namespaces: ["@myorg"] }
```

#### Schema definition

The Effect Schema encodes/decodes `SourceHostConfig` for the on-disk settings format. `URL` fields use `Schema.transform` (string ↔ URL). Registry `scopes` uses `Schema.optionFromNullishOr` to bridge the optional JSON array to `Option<ReadonlyArray<string>>` without changing the on-disk format.

```typescript
// settings/schema.ts

const GitHubSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("github"),
  url: Schema.URL,
});

const GitLabSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("gitlab"),
  url: Schema.URL,
});

const BitbucketSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("bitbucket"),
  url: Schema.URL,
});

const AzureReposSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("azurerepos"),
  url: Schema.URL,
});

const RegistrySourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("registry"),
  url: Schema.URL,
  namespaces: Schema.optionFromNullishOr(Schema.Array(Schema.String), undefined),
});

const SourceHostConfigSchema = Schema.Union(
  GitHubSourceHostConfigSchema,
  GitLabSourceHostConfigSchema,
  BitbucketSourceHostConfigSchema,
  AzureReposSourceHostConfigSchema,
  RegistrySourceHostConfigSchema,
);

type SourceHostConfig = typeof SourceHostConfigSchema.Type;
// SourceHostConfig satisfies { readonly name: string } & ConfiguredSourceHost
```

On-disk JSON is unchanged — `scopes` remains an optional array. The schema handles the `undefined | string[] ↔ Option<ReadonlyArray<string>>` conversion transparently.

### SourceExtensionRef — extension type × source type

Replaces both `resolution/types.ts::ExtensionRef` and `sources/provider.ts::ExtensionRef`. Two-dimensional: each ref variant is specific to both its extension type and source type.

```typescript
// ExtensionType stays in extensions/common.ts (canonical definition, with Schema).
// The duplicate in resolution/types.ts is removed. Imported here for reference.
type ExtensionType = "skill" | "command" | "pack" | "mcp-server";

// FindableExtensionType is new, defined in sources/types.ts (source-discovery-specific).
/** Findable extension types — excludes "command" until CommandExtensionRef is implemented */
type FindableExtensionType = "skill" | "pack" | "mcp-server";

// ---------------------------------------------------------------------------
// Source-specific ref details
// ---------------------------------------------------------------------------

/** Ref details for git-hosted sources (GitHub, GitLab, Bitbucket, AzureRepos, Git) */
interface GitHostedRefDetails {
  /** file:// URL to cloned directory */
  readonly location: string;
  /** Git tree SHA for integrity verification */
  readonly gitTreeSha: Option<string>;
}

/** Ref details for registry sources. Scope and name come from `ref.source` (RegistrySourceParams). */
interface RegistryRefDetails {
  /** Resolved semver version */
  readonly version: string;
  /** Archive checksum for integrity verification */
  readonly checksum: string;
}

/** Ref details for local filesystem sources */
interface LocalRefDetails {
  /** file:// URL to local directory */
  readonly location: string;
}

/** Ref details for builtin sources — bundled extensions, no external location */
interface BuiltinRefDetails {
  // No additional fields — builtin extensions are resolved from bundled data
}

// ---------------------------------------------------------------------------
// Skill extension refs
// ---------------------------------------------------------------------------

interface SkillRefBase {
  readonly type: "skill";
  readonly skill: {
    readonly name: string;
    readonly description: string;
    readonly metadata: Option<Record.ReadonlyRecord<string, unknown>>;
  };
}

type GitHubSkillRef = SkillRefBase & { readonly source: GitHubSource } & GitHostedRefDetails;
type GitLabSkillRef = SkillRefBase & { readonly source: GitLabSource } & GitHostedRefDetails;
type BitbucketSkillRef = SkillRefBase & { readonly source: BitbucketSource } & GitHostedRefDetails;
type AzureReposSkillRef = SkillRefBase & {
  readonly source: AzureReposSource;
} & GitHostedRefDetails;
type GitSkillRef = SkillRefBase & { readonly source: GitSource } & GitHostedRefDetails;
type RegistrySkillRef = SkillRefBase & { readonly source: RegistrySource } & RegistryRefDetails;
type LocalSkillRef = SkillRefBase & { readonly source: LocalSource } & LocalRefDetails;
type BuiltinSkillRef = SkillRefBase & { readonly source: BuiltinSource } & BuiltinRefDetails;

type SkillExtensionRef =
  | GitHubSkillRef
  | GitLabSkillRef
  | BitbucketSkillRef
  | AzureReposSkillRef
  | GitSkillRef
  | RegistrySkillRef
  | LocalSkillRef
  | BuiltinSkillRef;

// ---------------------------------------------------------------------------
// MCP server extension refs
// ---------------------------------------------------------------------------

interface McpServerRefBase {
  readonly type: "mcp-server";
  readonly server: {
    readonly name: string;
  };
}

type GitHubMcpServerRef = McpServerRefBase & {
  readonly source: GitHubSource;
} & GitHostedRefDetails;
type RegistryMcpServerRef = McpServerRefBase & {
  readonly source: RegistrySource;
} & RegistryRefDetails;
type LocalMcpServerRef = McpServerRefBase & { readonly source: LocalSource } & LocalRefDetails;
type BuiltinMcpServerRef = McpServerRefBase & {
  readonly source: BuiltinSource;
} & BuiltinRefDetails;
// Other source variants (GitLab, Bitbucket, AzureRepos, Git) deferred until those providers support MCP servers

type McpServerExtensionRef =
  | GitHubMcpServerRef
  | RegistryMcpServerRef
  | LocalMcpServerRef
  | BuiltinMcpServerRef;

// ---------------------------------------------------------------------------
// Pack extension refs
// ---------------------------------------------------------------------------

type RegistryPackRef = {
  readonly type: "pack";
  readonly source: RegistrySource;
} & RegistryRefDetails;

type BuiltinPackRef = {
  readonly type: "pack";
  readonly pack: { readonly namespace: string; readonly name: string; readonly version: string };
  readonly source: BuiltinSource;
} & BuiltinRefDetails;

type PackExtensionRef = RegistryPackRef | BuiltinPackRef;

// ---------------------------------------------------------------------------
// Command extension refs (deferred — not yet implemented)
// ---------------------------------------------------------------------------

// CommandExtensionRef is deferred until the command extension type is implemented.
// It will follow the same two-dimensional pattern (extension type × source type).

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

type SourceExtensionRef = SkillExtensionRef | McpServerExtensionRef | PackExtensionRef;
```

### SourceHostProvider — operations against a source host

```typescript
interface FindOptions {
  readonly names: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
  readonly type: FindableExtensionType | "*";
}

interface ExtensionFiles {
  readonly directory: string;
}

/**
 * Base provider — all source types support match, find, and fetch.
 *
 * @typeParam S - The Source variant this provider handles
 * @typeParam R - Effect requirements for provider operations
 */
interface SourceHostProvider<S extends Source = Source, R = never> {
  readonly type: S["type"];
  /** Check if a URL belongs to this provider. */
  readonly match: (url: URL) => Effect<boolean, CliError, R>;
  readonly find: (
    source: S,
    options: FindOptions,
  ) => Effect<ReadonlyArray<SourceExtensionRef>, CliError, R>;
  readonly fetch: (source: S, ref: SourceExtensionRef) => Effect<ExtensionFiles, CliError, R>;
}

/**
 * Extended provider for registry sources — adds publish operations.
 * Callers construct the archive, determine version, and compute metadata
 * before calling publishVersion — the provider handles storage only.
 */
interface PublishableSourceHostProvider<
  S extends Source = Source,
  R = never,
> extends SourceHostProvider<S, R> {
  readonly publishVersion: (
    namespace: string,
    type: RegistryExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect<void, CliError, R>;
}
```

### SourceHostProviders service

The Effect service that dispatches to the correct provider. Replaces the current `SourceProviders` service.

```typescript
interface SourceHostProvidersService {
  /** Find extensions matching the given source and search criteria. */
  readonly find: (
    source: Source,
    options: FindOptions,
  ) => Effect<ReadonlyArray<SourceExtensionRef>, CliError, Scope>;
  /** Fetch and materialize extension files for a found ref. */
  readonly fetch: (ref: SourceExtensionRef) => Effect<ExtensionFiles, CliError, Scope>;
  /** Build a git clone URL for this source. Returns None for non-git sources. */
  readonly cloneUrl: (source: Source) => Option<string>;
  /** Canonical origin string for display/comparison (e.g., "github.com/owner/repo"). */
  readonly origin: (source: Source) => string;
}

class SourceHostProviders extends Context.Tag("@axm.sh/cli/SourceHostProviders")<
  SourceHostProviders,
  SourceHostProvidersService
>() {}
```

### Concrete providers

Each provider is constructed with its `SourceHost` configuration (if applicable) and implements the `SourceHostProvider` interface.

#### Git hosting providers (GitHub, GitLab, Bitbucket)

Shared implementation via `createGitHostingProvider<S>()` factory. All three work the same way — only the source type and clone URL construction differ.

|                 | GitHub                                                       | GitLab      | Bitbucket   |
| --------------- | ------------------------------------------------------------ | ----------- | ----------- |
| **Status**      | Implemented                                                  | Implemented | Implemented |
| **Host config** | `url: URL` (instance)                                        | `url: URL`  | `url: URL`  |
| **match**       | URL hostname matches configured instance                     | Same        | Same        |
| **find**        | Shallow clone → scan for SKILL.md → enrich with git tree SHA | Same        | Same        |
| **fetch**       | Return cloned directory                                      | Same        | Same        |
| **Publishable** | No                                                           | No          | No          |

`match` checks if the URL hostname matches the configured `SourceHost.url`. This means a GHE instance at `github.mycompany.com` matches URLs from that domain — the provider knows its own host.

#### Azure Repos

|                 | Azure Repos                                        |
| --------------- | -------------------------------------------------- |
| **Status**      | Stub (not yet implemented)                         |
| **Host config** | `url: URL`                                         |
| **match**       | URL matches `dev.azure.com` or configured instance |
| **find**        | Not yet implemented                                |
| **fetch**       | Not yet implemented                                |
| **Publishable** | No                                                 |

Same shape as git hosting providers but with `organization/project/repo` params instead of `owner/repo`.

#### Git (generic)

|                 | Git                                                      |
| --------------- | -------------------------------------------------------- |
| **Status**      | Stub (not yet implemented)                               |
| **Host config** | None (self-describing)                                   |
| **match**       | Matches `git://`, `ssh://`, `git@...` URL schemes        |
| **find**        | Not yet implemented (will clone + scan like git hosting) |
| **fetch**       | Not yet implemented                                      |
| **Publishable** | No                                                       |

No host configuration — the URL in `GitSourceParams` is the full clone target. `match` is pure (scheme-based), no I/O needed.

#### Local

|                 | Local                                                      |
| --------------- | ---------------------------------------------------------- |
| **Status**      | Implemented                                                |
| **Host config** | None (self-describing)                                     |
| **match**       | Matches `file://` URLs and absolute/relative paths         |
| **find**        | Scan directory for SKILL.md files                          |
| **fetch**       | Return directory path directly (no materialization needed) |
| **Publishable** | No                                                         |

No host configuration — the path in `LocalSourceParams` is the target. `match` is pure (path detection), no I/O needed.

#### Registry (meta-provider)

|                 | Registry                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**      | Implemented (local); stub (remote)                                                                                                                                                |
| **Host config** | `url: URL`, `namespaces: Option<ReadonlyArray<string>>`                                                                                                                           |
| **match**       | Matches URLs from known registry hosts (e.g., `agentxm.ai`) — resolves extension coordinates from the URL path. `@scope/name` patterns are classified by the parser, not `match`. |
| **find**        | Scope routing → iterate configured registries → read index.json → version selection → populate checksum from index                                                                |
| **fetch**       | Read archive → verify checksum → extract                                                                                                                                          |
| **Publishable** | Yes — `PublishableSourceHostProvider`                                                                                                                                             |

The registry meta-provider wraps N configured registry hosts into a single provider. It applies scope routing: scope-matched registries first, then catch-all registries. Each underlying registry can be local (filesystem) or remote (HTTPS, stubbed).

Additional operations via `PublishableSourceHostProvider`:

- `publishVersion` — store a pre-built archive and version metadata to the registry. The calling handler handles archive creation, version determination, and checksum computation; the provider handles storage and index management.

#### Builtin

|                 | Builtin                                                          |
| --------------- | ---------------------------------------------------------------- |
| **Status**      | Implemented                                                      |
| **Host config** | None (self-describing)                                           |
| **match**       | Never matches — builtin sources are not resolved from user input |
| **find**        | In-memory lookup of bundled extensions                           |
| **fetch**       | Return bundled extension directory                               |
| **Publishable** | No                                                               |

No host configuration, no params. The provider knows the bundled extensions at construction time. `match` always returns `false` — builtin extensions are installed by init/bootstrap, not resolved from user input.

### Migration type aliases (temporary)

During incremental migration, these aliases keep existing consumers compiling while new types are adopted file-by-file. Removed once migration is complete.

```typescript
/** @deprecated Use SourceParams */
type SourceInput = SourceParams;

/** @deprecated Use SourceExtensionRef */
type ExtensionRef = SourceExtensionRef; // was in sources/provider.ts

/** @deprecated Use SourceHostProvider */
type SourceProvider<S extends Source = Source, R = never> = SourceHostProvider<S, R>;

/** @deprecated Use SourceHostProviders */
type SourceProviders = SourceHostProviders;
```

Note: `resolution/types.ts::ExtensionRef` and `ExtensionMetadata` are removed outright (no alias needed) — the type shape is fundamentally different (flat `SourceType` string vs full `Source` object), so an alias would be misleading. All consumers of the resolution `ExtensionRef` must be migrated atomically in the same change that removes these types.

### Mapping: old types → new types

| Old type                      | Location                        | New type                                        | Notes                                                                                                  |
| ----------------------------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SourceInput`                 | `sources/types.ts`              | `SourceParams`                                  | Parsed coordinates                                                                                     |
| `Source`                      | `sources/types.ts`              | `Source`                                        | Now `SourceHost & SourceParams` (was `SourceInput & SourceConfig`)                                     |
| `SourceConfig`                | `settings/schema.ts`            | `SourceHostConfig`                              | `{ name } & ConfiguredSourceHost` — settings layer only                                                |
| `GitHubSourceConfig`          | `settings/schema.ts`            | `GitHubSourceHost`                              | `url` field, no `name`                                                                                 |
| `SourceType`                  | `sources/types.ts`              | `SourceType`                                    | Adds `"builtin"` (see Decision 7)                                                                      |
| `ExtensionRef`                | `resolution/types.ts`           | _(removed)_                                     | Resolution produces `Source`, not refs; discovery moves to providers                                   |
| `ExtensionRef`                | `sources/provider.ts`           | `SourceExtensionRef`                            | Unified type, carries full `Source`                                                                    |
| `SkillRef`                    | `sources/provider.ts`           | `SkillExtensionRef`                             | Union of per-source variants (e.g., `GitHubSkillRef`, `RegistrySkillRef`)                              |
| `McpServerRef`                | `sources/provider.ts`           | `McpServerExtensionRef`                         | Union of per-source variants                                                                           |
| `SourceProvider`              | `sources/provider.ts`           | `SourceHostProvider`                            | Parameterized on `Source` (was `SourceInput`); constructed with `SourceHost`                           |
| `RegistrySourceProvider`      | `sources/providers/registry.ts` | `PublishableSourceHostProvider<RegistrySource>` | Formalized interface                                                                                   |
| `SourceProviders`             | `sources/service.ts`            | `SourceHostProviders`                           | Service tag renamed                                                                                    |
| `ProviderRegistry`            | `sources/provider.ts`           | _(removed)_                                     | Internal dispatch is an implementation detail of `SourceHostProviders` service                         |
| `ExtensionMetadata`           | `resolution/types.ts`           | _(removed)_                                     | Resolution no longer produces refs; discovery metadata lives on `SourceExtensionRef`                   |
| `ResolutionOptions`           | `resolution/types.ts`           | _(removed)_                                     | `resolveSource()` uses `Workspace` service for context; type/agent filtering moves to `FindOptions`    |
| `resolveExtension()`          | `resolution/resolver.ts`        | _(removed)_                                     | Subsumed by `resolveSource()`; callers use `resolveSource()` + `SourceHostProviders.find()`            |
| `GitRepositorySourceInput`    | `sources/types.ts`              | `GitSourceParams`                               | Renamed; no `subPath` (matches current shape)                                                          |
| `GitHostingProviderSource`    | `sources/types.ts`              | `GitHostingSource`                              | Renamed                                                                                                |
| `GitSource`                   | `sources/types.ts`              | `GitBasedSource`                                | Renamed to avoid confusion with `GitSource` (git-only)                                                 |
| `RegistrySourceConfig.scopes` | `settings/schema.ts`            | `RegistrySourceHost.scopes`                     | Migrates from settings-only to domain model; `Option<ReadonlyArray<string>>` via `optionFromNullishOr` |
| `buildCloneUrl()`             | `sources/clone-url.ts`          | `SourceHostProvidersService.cloneUrl()`         | Moved into service; `clone-url.ts` eliminated                                                          |
| `getOrigin()`                 | `sources/clone-url.ts`          | `SourceHostProvidersService.origin()`           | Moved into service; `clone-url.ts` eliminated                                                          |
| `lockEntryToSourceInput()`    | `sources/`                      | `lockEntryToSourceParams()`                     | Mechanical rename; `builtin` entries no longer need special-casing                                     |
| `printSourceInput()`          | `sources/`                      | `SourceHostProvidersService.origin()`           | Display formatting moves to service; standalone function eliminated                                    |
| source comparison             | `update/handler.ts`             | `Equal.equals()`                                | Wrap `SourceParams` with `Data.struct()` for structural equality (also fixes Azure Repos bug)          |

## Risks / Trade-offs

**[Wide blast radius]** → Nearly every file that touches sources or extension refs needs updating. Mitigated by incremental migration with type aliases — the core type change lands first, consumer migration follows.

**[Flat intersection field collisions]** → If `SourceHost` and `SourceParams` both define a field with the same name but different types, the intersection breaks. Mitigated by keeping the settings `name` off `SourceHost` entirely (it lives in `SourceHostConfig` at the settings layer). The only shared field is `type`, which always agrees between host and params of the same source type.

**[Two-tier provider hierarchy]** → Adding a third tier (e.g., providers that support find but not fetch) would require restructuring. Acceptable because all current and foreseeable providers support both find and fetch.

**[Self-describing sources have trivial SourceHost]** → `LocalSourceHost = { type: "local" }` carries no data beyond the discriminator. This is intentional — it makes the type algebra uniform even when no configuration is needed.
