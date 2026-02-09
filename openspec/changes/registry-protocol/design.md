## Context

Extensions currently install from git repositories and local filesystem paths. The install pipeline (parseSource → discoverSkills → selectSkills → buildOperations → buildPlan → resolvePlan) copies skill files to a canonical location (`.agents/skills/{name}`) and creates symlinks into each agent's skills directory. The lockfile records source metadata; settings records the source string.

There is no versioning, no integrity verification, and no dependency resolution. The `RegistrySource` type exists but is a placeholder (`{url|path}` union). The settings schema has `sources.registry` as an optional field accepting one or more `{url|path}` objects.

This design introduces a source provider abstraction that unifies all source types, a local registry source provider backed by a static-file layout, a canonical managed extension store, and a `skills fork` command for converting unmanaged skills into managed ones.

**Constraints:**

- Remote registry source provider is out of scope (future work)
- Extension identity remains `@scope/name` (no type in identity path)
- Must coexist with existing git/local install flows
- Reuse the existing operations/plan model where possible
- Extensions from non-registry sources cannot share names with registry-sourced extensions (name uniqueness across source types)
- Pre-existing or externally-installed extensions (axm-unaware) are out of scope

## Goals / Non-Goals

**Goals:**

- Define a static-file registry layout usable by both local and future remote providers
- Introduce a source provider abstraction that unifies how all source types are accessed
- Migrate existing source types (github, gitlab, bitbucket, azurerepos, git, local) to the source provider model
- Implement a local registry source provider for reading and writing registry data
- Evolve source configuration to named sources with scope-based routing
- Establish `.axm/extensions/` as the canonical store for managed extensions
- Support installing from and publishing to local registries
- Add `skills fork` for converting unmanaged skills to managed extensions (including glob-based batch forking)
- Integrate with existing plan-based execution model

**Non-Goals:**

- Remote/HTTP registry provider (future — the provider interface accommodates it)
- Publishing protocol (auth, validation, index regeneration for remote registries)
- Discovery feed or search index
- Dependency resolution implementation and testing (schemas include `dependencies` for forward compatibility with extension packs, but resolution is not implemented in this change)
- Lockfile pinning for dependency trees (future)
- Signature verification
- Migration of existing installed skills to the new location (publish command supports this workflow — fork first, then publish)
- Handling pre-existing or externally-installed extensions that are axm-unaware (future — may use something like `settings.skills.skill-name: 'external'`)
- Source enforcement/restriction mechanisms (e.g., limiting which sources are allowed) and custom priority configuration

## Decisions

### 1. Registry layout uses extension type as a directory segment

The registry layout is:

```
<registry-root>/
  extensions/
    @<scope>/
      <skills|mcp-servers>/
        <name>/
          index.json
          <version>.zip
```

Extension identity remains `@scope/name`, but the directory structure includes the extension type (`skills` or `mcp-servers`) as a path segment. This keeps different extension types in separate namespaces on disk without changing the identity model.

When resolving `@acme/code-review`, the client must know the extension type to construct the path. For `skills install` and `skills fork`, the type is always `skills`. Future `mcp-servers install` would use `mcp-servers`. The extension type is singular in code (`"skill" | "mcp-server"`) and pluralized for directory segments (`skills/`, `mcp-servers/`).

**Alternative considered:** Flat layout without type segment (`@scope/name/`). Rejected because it prevents same-named extensions of different types from coexisting in the same scope.

### 2. Source provider interface

A source provider unifies how all source types are accessed. Each source type (github, gitlab, bitbucket, azurerepos, git, registry, local) is implemented as a provider with capabilities appropriate to its type. Not all providers support the same operations — the abstraction uses a capability-based design.

```typescript
// Search criteria passed to find — independent of source identity
interface FindOptions {
  readonly names: ReadonlyArray<string>; // extension names to match (empty = all)
  readonly agents: ReadonlyArray<string>; // agent compatibility filter (empty = all)
  readonly type: ExtensionType | "*"; // "skill" | "mcp-server" | "*" (all)
}

// Base capabilities shared by all source providers (R = Effect requirements)
interface SourceProvider<S extends Source = Source, R = never> {
  readonly type: S["source"];
  readonly find: (
    source: S,
    options: FindOptions,
  ) => Effect<ReadonlyArray<ExtensionRef>, SourceError, R>;
  readonly fetch: (source: S, extension: ExtensionRef) => Effect<ExtensionFiles, SourceError, R>;
}

// Internal: provider registry maps source type → provider implementation
// R propagation mirrors the operation handler pattern (apply-plan.ts):
// - SourceProvider has open R — each provider declares its own dependencies
// - Providers are assembled into a static record (like Handlers)
// - ProviderContext<T> extracts the R union (like ExecutionContext<T>)
// These types are internal to the SourceProviders service (Decision 4) — handlers don't see them
type ProviderRegistry = {
  [K in Source["source"]]: SourceProvider<Extract<Source, { source: K }>, any>;
};
type ProviderContext<T extends ProviderRegistry> = {
  [K in keyof T]: T[K] extends SourceProvider<any, infer R> ? R : never;
}[keyof T];
```

The `Source` type (from `sources/types.ts`) describes _where_ to look — the repository, registry location, or local path. `FindOptions` describes _what_ to look for — extension names, agent compatibility, and extension type. These concerns are independent: the same source can be searched for different extensions, and the same extension can be found across different sources.

**`ExtensionRef`** is a discriminated union returned by `find` and consumed by `fetch`:

```typescript
type ExtensionRef = SkillRef | McpServerRef;

interface SkillRef {
  readonly type: "skill";
  readonly skill: Skill;
  readonly source: Source; // where this skill was found
  readonly gitTreeSha: Option<string>;
}

interface McpServerRef {
  readonly type: "mcp-server";
  readonly name: string;
  readonly source: Source; // where this server was found
}
```

> **Note:** `McpServerRef` is defined for forward compatibility. Only `SkillRef` is used in this change.

Each ref carries `source: Source` — the source it was found at. This replaces the existing `SkillRef.path` and `SkillRef.registry` fields: a local source carries the filesystem path, a GitHub source carries owner/repo/ref, a registry source identifies the registry it was found at. Scope and name are part of the extension identity (the `Skill` type and `FindOptions`), not the source. The ref always knows where it came from using the same `Source` type the rest of the system understands.

**Important:** `RegistrySource` as a standalone type goes away — the registry variant of `Source` carries the source type and the config name it was resolved from (`{ source: "registry"; name: string }`). The `name` identifies which configured registry source this came from (matching `SourceConfig.name` — see Decision 5), enabling `fetch` to find the right provider and the lockfile to record provenance. Extension scope/name are identity, not source — they live on `Skill` and `FindOptions`. The local vs remote distinction is handled by the provider implementation, not by the `Source` type.

For git-based sources, `find` scans the repository and filters results by `names` (empty = return all discovered skills) and `agents`. For registry sources, `find` looks up the specific extensions by name from the configured registry locations. `agents` filters by compatibility in both cases.

Existing source types are migrated to the `SourceProvider` interface. For example, a `GitHubSourceProvider` implements `find` (list/filter skills in a repo) and `fetch` (clone/download files) but does not implement registry-specific methods like `publishVersion`. Many existing providers won't have all the same methods/capabilities as the registry provider — the interface is intentionally minimal at the base level.

**Alternative considered:** Single provider with transport abstraction (HttpTransport, FileTransport). Rejected as over-engineered — the provider interface itself is the abstraction boundary. The source provider abstraction provides a more general solution that covers all source types, not just registry.

### 3. Registry source providers

Registry source providers extend the base `SourceProvider` (Decision 2) with registry-specific operations:

```typescript
// Extended capabilities for registry source providers
// Methods take (scope, type, name) — consider an ExtensionCoord struct if this becomes unwieldy
interface RegistrySourceProvider extends SourceProvider {
  readonly type: "registry";
  readonly fetchIndex: (
    scope: string,
    type: ExtensionType,
    name: string,
  ) => Effect<ExtensionIndex, RegistryError>;
  readonly fetchArchive: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
  ) => Effect<Uint8Array, RegistryError>;
  readonly publishVersion: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect<void, RegistryError>;
  readonly checkNameExists: (
    scope: string,
    type: ExtensionType,
    name: string,
  ) => Effect<boolean, RegistryError>;
}
```

Two implementations dispatch by the configured location (see Decision 5 for `SourceConfig`):

```typescript
// Local filesystem registry (implemented in this change)
class LocalRegistrySourceProvider implements RegistrySourceProvider {
  readonly type = "registry";
  // find/fetch: read from filesystem using registry layout
  // fetchIndex: read <root>/extensions/@<scope>/skills/<name>/index.json
  // publishVersion: write zip + update index.json
  // All operations are filesystem I/O against the static-file layout
}

// Remote HTTPS registry (out of scope — stub that fails with descriptive error)
class RemoteRegistrySourceProvider implements RegistrySourceProvider {
  readonly type = "registry";
  // All operations fail with "remote registry not yet supported" error
}
```

A factory function creates the appropriate provider based on location scheme:

```typescript
// location is a local path or file:// URL → LocalRegistrySourceProvider
// location is an https:// URL → RemoteRegistrySourceProvider (stub)
const createRegistryProvider = (location: string): RegistrySourceProvider => ...
```

The dispatch is by location scheme, not by the `Source` type — a registry source is always `source: "registry"` regardless of whether the registry is local or remote.

### 4. SourceProviders service and registry meta-provider

A **registry meta-provider** wraps the multi-registry iteration (scope routing, fallthrough) into a single `SourceProvider` entry for the provider registry. From the outside it's one provider — internally it reads configured registry sources from the workspace service on each call, creating per-location providers and applying Decision 6's resolution order:

```typescript
// Wraps N configured registries into a single SourceProvider
// Reads workspace.getRegistrySources() lazily on each find/fetch — always reflects current config
const createRegistryMetaProvider = (): SourceProvider<Source, FileSystem | Path | WorkspaceContext> => ({
  find: (source, options) =>
    // workspace.getRegistrySources(scope) → iterate: scope-matched first, then catch-all
    // 404 → fallthrough, other errors → hard fail
    // per-location provider via createRegistryProvider(location)
  fetch: (source, ref) =>
    // ref.source.name → workspace.getSourceByName(name) → delegate to right per-location provider
});
```

Because the meta-provider reads from workspace lazily, it always sees the latest source configuration — including any registry sources added by the registry guard (Decision 13) mid-handler.

**`SourceProviders` service** — rather than assembling a provider registry in every handler, providers are exposed as an Effect service constructed once and provided at the edge:

```typescript
interface SourceProviders {
  readonly resolve: (
    source: Source,
    options: FindOptions,
  ) => Effect<ReadonlyArray<ExtensionRef>, SourceError>;
  readonly fetch: (ref: ExtensionRef) => Effect<ExtensionFiles, SourceError>;
}
```

The service is backed by the provider registry (one provider per source type). It delegates to `workspace.getSources()` for ordering and to individual providers for execution. Handlers consume it via `yield* SourceProviders` — no assembly, no wiring. The registry meta-provider's lazy reads from workspace mean the service never goes stale.

This keeps the provider registry pattern uniform — one provider per source type, including registry, and `resolve`/`fetch` dispatch without branching.

### 5. Source configuration schema

Current schema uses per-provider keys:

```json
{
  "sources": {
    "github": { "url": "..." },
    "registry": [{ "url": "..." }, { "path": "..." }]
  }
}
```

New schema consolidates all source types into a single array, discriminated by `source`:

```json
{
  "sources": [
    { "name": "github.acme", "source": "github", "url": "https://github.acme.corp" },
    { "name": "corp-gitlab", "source": "gitlab", "url": "https://gitlab.corp.com" },
    {
      "name": "local",
      "source": "registry",
      "location": "~/my-extension-registry"
    },
    {
      "name": "corp",
      "source": "registry",
      "location": "https://registry.corp.example.com",
      "scopes": ["@corp", "@internal"]
    }
  ]
}
```

Key properties:

- **`name`**: Unique identifier for CLI targeting (e.g., `axm publish --registry local`). Must match `^[a-z0-9][a-z0-9.-]*$` — lowercase alphanumeric, hyphens, and dots
- **`source`**: Discriminator — `"github"`, `"gitlab"`, `"bitbucket"`, `"azurerepos"`, `"registry"`. Git and local sources don't need configuration (URLs/paths come from the source string)
- **`url`**: Base URL override for git hosting providers (github, gitlab, bitbucket, azurerepos)
- **`location`**: Registry path or URL. Paths are normalized to absolute paths internally
- **`scopes`**: Optional scope filter. If present, source is only consulted for matching scopes

#### SourceConfig type

```typescript
// Discriminated union on `source`, normalized at parse time
type SourceConfig =
  | { readonly name: string; readonly source: "github"; readonly url: string }
  | { readonly name: string; readonly source: "gitlab"; readonly url: string }
  | { readonly name: string; readonly source: "bitbucket"; readonly url: string }
  | { readonly name: string; readonly source: "azurerepos"; readonly url: string }
  | {
      readonly name: string;
      readonly source: "registry";
      readonly location: string; // absolute path or URL (normalized at parse time)
      readonly scopes: Option<ReadonlyArray<string>>;
    };
```

`SourceConfig` is validated and normalized (locations resolved to absolute paths) at parse time — no separate "resolved" type needed.

#### Layered source resolution

Source configurations are resolved through three layers. Project sources take highest priority, followed by global, followed by built-in. Name-based deduplication cascades downward — a source in a higher-priority layer shadows any same-named source in lower layers.

**1. Project settings** (`.axm/settings.json` → `sources` array) — highest priority. These appear first in the resolved list.

**2. Global settings** (`~/.axm/settings.json` → `sources` array) — fills in sources not defined at the project level. A global entry whose `name` matches any project entry is excluded.

**3. Built-in defaults** — defined by the workspace service (the single source of truth for source configuration), lowest priority. A built-in entry whose `name` matches any project or global entry is excluded.

| name        | source      | config                  |
| ----------- | ----------- | ----------------------- |
| `github`    | `github`    | `https://github.com`    |
| `gitlab`    | `gitlab`    | `https://gitlab.com`    |
| `bitbucket` | `bitbucket` | `https://bitbucket.org` |

Built-in defaults are owned by the workspace service — not scattered across resolver code or parser logic. This ensures the merge algorithm, resolution order, and provider construction all derive from the same ordered list. No built-in registry source is included. A built-in `default` registry source will be added when the remote registry provider is functional. Until then, users must configure registry sources explicitly (see Decision 13).

The merge algorithm:

1. Start with project sources (preserving array order)
2. Collect project source names
3. Append global sources whose `name` is not in the project set (preserving array order)
4. Collect project + global source names
5. Append built-in sources whose `name` is not in the project or global set (preserving built-in order)
6. Result: project sources first → global additions → built-in additions

This is accessed via `Workspace`, which already has the global/local layering pattern. The `WorkspaceContextService` gains methods for scope and source resolution:

```typescript
export interface WorkspaceContextService {
  // ... existing fields (global, path, nonInteractive, preview, resolvePlan)

  /** Default scope (project > global > registry default > prompt).
   *  If no scope is configured and interactive, prompts the user and
   *  persists the result to project settings. */
  readonly getScope: () => Effect<string, SettingsError | PromptCancelled>;

  /** Source configurations (project → global → built-in merge). */
  readonly getSources: () => Effect<ReadonlyArray<SourceConfig>, SettingsError>;

  /** Lookup a source by name from the merged list. */
  readonly getSourceByName: (name: string) => Effect<Option<SourceConfig>, SettingsError>;

  /** Get registry sources only, optionally filtered by scope. */
  readonly getRegistrySources: (
    scope: Option<string>,
  ) => Effect<ReadonlyArray<SourceConfig & { source: "registry" }>, SettingsError>;
}
```

`getSources()` performs the three-layer merge and caches the result for the lifetime of the workspace context. `getScope()` walks the resolution chain and prompts if needed.

#### Location normalization

- `~/...` → expand home directory
- `./...` → resolve relative to workspace root
- `/...` → absolute path, used as-is
- `file://...` → strip scheme, use path
- `https://...` → future remote provider

**Alternative considered:** Keep `sources` as an object keyed by name. Rejected because array preserves ordering, which is semantically important for resolution priority.

### 6. Source resolution order

The merged sources list from `getSources()` (Decision 5) is the single ordering mechanism for **all** resolution — both registry scope routing and ambiguous input resolution.

#### Registry scope routing

Within the registry meta-provider (Decision 4):

1. Collect registry sources whose `scopes` includes the target extension's scope
2. If no scope-matched sources, collect registry sources with no `scopes` field
3. Query in array order. 404 → fallthrough. Other errors → hard fail

> **Note:** Scope routing only applies to registry sources — they are the only `SourceConfig` variant with a `scopes` field.

#### Ambiguous input resolution

The current resolver hardcodes a try-order of GitHub → GitLab → Bitbucket. This is replaced by the merged sources list: for ambiguous patterns that could match multiple git-hosting providers, the resolver iterates the full `getSources()` list filtered to applicable source types, in order. First successful resolution wins; 404 → fallthrough.

1. Call `getSources()` on the workspace service
2. Filter to git-hosting source types (`github`, `gitlab`, `bitbucket`, `azurerepos`)
3. Try each in array order — first successful resolution wins, 404 → fallthrough

This means:

- **Default behavior** (no user config): built-in order (github, gitlab, bitbucket) — same as today
- **User customization**: a user who places `gitlab` before `github` in project settings gets GitLab tried first
- **Multiple sources of same type**: if both `github` (github.com) and `github.acme` (github.acme.corp) are configured, both are tried in array order — iteration is over the full merged list, not deduplicated by type

**Explicit source prefixes** (`github:owner/repo`, `gitlab:owner/repo`, etc.) bypass ambiguous resolution entirely — they dispatch directly to the named source type. The ordering only matters when the input is ambiguous.

### 7. Managed extensions live in `.axm/extensions/`

```
.axm/
  extensions/
    @<scope>/
      skills/
        <name>/
          axm-skill.json
          SKILL.md
          ...additional files
      mcp-servers/
        <name>/
          axm-mcp-server.json
          ...
  settings.json
  axm-lock.yaml
```

This is the canonical store for all axm-managed extensions (registry-sourced or forked). The existing `.agents/skills/{name}` location continues to be used for non-managed skills installed from git/local sources. Agent directories still receive symlinks to whichever canonical location applies.

When installing a registry-sourced extension, the pipeline becomes:

1. Resolve version from registry `index.json`
2. Download/read archive
3. Verify SHA-256 checksum
4. Extract to `.axm/extensions/@<scope>/skills/<name>/`
5. Symlink from agent dirs (reusing existing `installForAgent` logic)
6. Update lockfile and settings

The `installSkill` operation handler needs a conditional path: if the source is `registry`, use `.axm/extensions/` as canonical; otherwise use `.agents/skills/` as before.

### 8. `skills fork` orchestrates existing operations

The `skills fork` command converts an unmanaged skill into a managed extension:

**Input:** A skill reference — either:

- Name of an installed skill (e.g., `frontend-design`)
- A source string (same formats as `skills install`)
- A glob pattern matching installed skill names (e.g., `effect-*`)

**Scope resolution** for determining the default scope of a forked extension (highest priority wins):

1. Project settings `scope` field
2. Global settings `scope` field
3. If none available, prompt the user for a scope — the provided value is persisted to the project settings `scope` field for future use

Future scope sources (default registry scope, logged-in user scope) will be inserted into this chain when available.

**Flow:** Fork reuses install's discovery pipeline (parseSource → provider.find → selectSkills) with additional steps for scope resolution and uniqueness checking, then builds a different plan (fork + publish + install ops instead of just install ops).

1. **Resolve source skill**: Same as install's discovery phase. If name matches an installed skill (in lockfile), read its files from the current canonical location instead.
2. **Determine scope/name**: Use scope resolution above for default scope, original skill name. Prompt user to confirm or change.
3. **Check uniqueness**: Query configured registry sources (via `checkNameExists`) to ensure `@scope/name` doesn't collide. If collision, prompt for alternate name.
4. **Build plan with three operations**:
   - `fork-skill`: Copy the discovered skill's files to `.axm/extensions/@<scope>/skills/<name>/`, generate `axm-skill.json` manifest with `name: "@scope/name"`, `version: "0.1.0"`, agent compatibility from settings
   - `publish-skill`: Publish the newly created managed extension to the target registry
   - `install-skill`: Install from registry (new `@scope/name` identity, so not a no-op)
5. **Execute via `resolvePlan`**: Display plan, confirm, apply — reusing the existing plan model

The `ForkSkillOperation` is a new operation type with params `source` (where to fork from) and `name` (target `@scope/name`). The full fork flow decomposes into three sequential operations: fork → publish → install. This fits naturally into the plan model's job/step structure.

**Glob-based forking:** When the input is a glob pattern (e.g., `effect-*`), the handler:

1. Reads installed skills from the lockfile
2. Matches skill names against the glob pattern
3. Builds a plan with fork operations for each match
4. Displays the full plan (all matched skills) for confirmation
5. Executes sequentially (each skill goes through the full fork → publish → install flow)

### 9. Publishing to local registries

`axm publish` (or `axm skills publish`) writes an extension from `.axm/extensions/` to a local registry:

**Input:**

- Extension to publish — `@scope/name`, or just `name` (resolved using default scope from `getScope()`)
- Target registry — defaults to the `default` named registry or the first configured registry source. A `--registry` flag specifies a named source (e.g., `axm skills publish --registry local`)

**Flow:**

1. **Validate extension**: Read `axm-skill.json` from `.axm/extensions/@<scope>/skills/<name>/`. Verify required fields (name, version).
2. **Build archive**: Create a zip of the extension directory rooted in `<name>/` (matching the archive format spec).
3. **Compute checksum**: SHA-256 of the zip bytes, formatted as `sha256:<hex>`.
4. **Determine agent compatibility**: Read from `axm-skill.json` or from workspace settings.
5. **Write to registry**:
   - Write `<version>.zip` to `<registry>/extensions/@<scope>/skills/<name>/`
   - Read existing `index.json` at `<registry>/extensions/@<scope>/skills/<name>/index.json` (or create new), prepend version entry, write back
6. **Idempotency**: If the version already exists and checksum matches, no-op. If version exists with different checksum, fail (no overwrites without `--force`).

Only extensions in `.axm/extensions/` (axm-managed extensions) can be published. Git-sourced and local-path skills are not publishable because they lack the manifest and versioning metadata — they must be forked first using `skills fork` to become managed extensions, then published. This makes fork a prerequisite for the migration workflow: fork converts unmanaged → managed, publish distributes managed → registry.

### 10. Extension index and version entry schemas

Defined as Effect Schemas for validation:

**ExtensionIndex** (`index.json`):

- `name`: string (extension name without scope)
- `scope`: string (including `@` prefix)
- `type`: `"skill" | "mcp-server"`
- `description`: optional string
- `repository`: optional string
- `license`: optional string
- `authors`: optional array of `{name, email?, url?}`
- `versions`: array of VersionEntry (newest first)

**VersionEntry** (inside `index.json` `versions` array):

- `version`: string (semver)
- `published`: string (ISO 8601)
- `agents`: array of strings (agent identifiers — stored as strings, not validated against `AgentId` exhaustive list, for forward compatibility)
- `dependencies`: optional record of `@scope/name` → semver range (only used by extension packs — included in schema for forward compatibility, not resolved in this change)
- `engines`: optional record (e.g., `{"axm": ">=0.2.0"}`)
- `checksum`: string (`sha256:<hex>`)

The `agents` field is intentionally string-typed rather than using `AgentIdSchema`. Registries should be agnostic of the client's agent vocabulary — a publisher may declare compatibility with agents the client doesn't know about. The client filters locally using its own `AgentId` registry.

### 11. Lockfile evolution for registry sources

Current `RegistryLockEntrySchema` has `source`, `scope`, `name`, and optional `version`. The existing `version` field is renamed to `resolvedVersion` and made required. Additional fields:

- `resolvedVersion`: string — the exact semver version installed (renamed from `version`; distinct from the range in settings)
- `checksum`: string — the `sha256:<hex>` of the installed archive (for integrity auditing)
- `sourceName`: string — which named source it was resolved from (populated from `source.name` on the ref; for `axm update` to know where to check)

The `version` field in settings remains the requested range (e.g., `^1.0.0`); `resolvedVersion` in the lockfile is the pinned version (e.g., `1.2.3`).

### 12. `axm-skill.json` manifest for managed extensions

Managed extensions require a manifest file:

```json
{
  "name": "@acme/code-review",
  "version": "1.0.0",
  "description": "Automated code review",
  "agents": ["claude-code", "cursor"],
  "dependencies": {},
  "license": "MIT",
  "authors": [{ "name": "Acme Corp" }]
}
```

This uses the existing `CommonManifestFields` from `extensions/common.ts` as the base, extended with `agents` and `dependencies`. The existing singular `author` field evolves to `authors` (array of `{name, email?, url?}`) — consistent with the index schema (Decision 10). The manifest is the source of truth for publish metadata — the registry `index.json` is derived from it.

For forked extensions, the manifest is generated with sensible defaults: version `0.1.0`, agents from workspace settings, empty dependencies.

### 13. Registry configuration guard

No built-in registry source exists until the remote provider ships (Decision 5). Commands that depend on a registry (`skills fork`, `skills publish`, `skills install @scope/name`) must detect this and guide the user.

`getRegistrySources()` returns an empty list when no registry sources are configured. Registry-dependent handlers call a shared guard at the top of their flow:

**Interactive (TTY):**

1. Inform the user that no registry is configured
2. Prompt for a local registry path (text input with path validation — must be an existing directory or a path the user wants created)
3. Persist the source to project settings as `{ "name": "local", "source": "registry", "location": "<path>" }`
4. Continue the original operation using the newly configured source

The default source name is `local`. The prompt normalizes the path using the same rules as other registry locations (home directory expansion, relative path resolution, etc.).

**Non-interactive (CI / `--yes`):**

Fail with a typed `RegistryNotConfiguredError` whose message explains how to add a registry source to settings:

```
No registry source configured. Add one to .axm/settings.json:

{
  "sources": [
    { "name": "local", "source": "registry", "location": "/path/to/registry" }
  ]
}
```

This guard is called by:

- `skills fork` handler — needs a registry to publish the forked extension to
- `skills publish` handler — needs a registry to write to
- `skills install` handler — when the source is a registry reference (`@scope/name@version`)

The guard persists configuration changes to settings. Because the `SourceProviders` service reads from the workspace service lazily (Decision 4), any registry source the guard adds is immediately visible to subsequent `resolve`/`fetch` calls — handlers don't need to re-query or pass sources explicitly.

## Handler Changes

All handlers use the `SourceProviders` service (Decision 4) for discovery via `yield* SourceProviders`. Registry-dependent handlers call the registry guard (Decision 13) as a precondition — config changes are visible to subsequent provider calls via lazy workspace reads (Decision 4).

### `skills install` handler

```
handleInstall(args)
│
├─ parseSource(args.source)
│
├─ if source.source === "registry":
│    └─ registryGuard()                     # ensure registry configured (Decision 13)
│
├─ sources = yield* SourceProviders
│
├─ refs = sources.resolve(source, { names, agents, type: "skill" })
│
├─ selected = selectSkills(refs, ...)        # unchanged interactive selection
│
├─ for each selected ref:
│    └─ files = sources.fetch(ref)          # dispatches by ref.source
│
├─ build AddSkillOperations
├─ buildPlan(ops, lockfile, ...)
└─ ws.resolvePlan(plan, { "install-skill": installSkill })
```

**Provider implementations for `find`:**

- `GitHubSourceProvider.find` / `GitLabSourceProvider.find` / `BitbucketSourceProvider.find` — shallow clone to scoped temp dir, scan for SKILL.md using existing 3-phase discovery algorithm, enrich with git tree SHA. The temp dir lifetime is managed by `Effect.acquireRelease` within a caller-provided scope (same pattern as today)
- `LocalSourceProvider.find` — scan filesystem directly using existing `discoverSkillsInDir`
- `RegistrySourceProvider.find` — read `index.json` from configured registry locations, select version by semver range + agent compatibility filter, return `ExtensionRef` with resolved version metadata

**Provider implementations for `fetch`:**

- Git-based providers — files already available in temp clone dir from `find`; `fetch` reads from that path
- `LocalSourceProvider.fetch` — reads files from the local path
- `RegistrySourceProvider.fetch` — reads/extracts archive, verifies SHA-256 checksum

### `install-skill` operation executor

```
installSkill(op)
│
├─ determine canonical path:
│    ├─ registry source → .axm/extensions/@<scope>/skills/<name>/
│    └─ other sources   → .agents/skills/<sanitized-name>/
│
├─ pre-clean: remove existing skill from ALL known locations
│    (both .axm/extensions/ and .agents/skills/, including agent symlinks)
│    ensures clean transitions when source type changes (e.g., fork workflow)
│
├─ write files to canonical path:
│    ├─ registry source → extract archive (already fetched + verified)
│    └─ other sources   → copy from source path (existing logic)
│
├─ installForAgent(...)                     # symlinks from agent dirs, unchanged
│
├─ update lockfile:
│    ├─ registry entries gain: checksum, resolvedVersion, sourceName
│    └─ other entries: unchanged
│
└─ update settings
```

### `skills uninstall` handler

Minimal changes. Reads lockfile entry's `source` field to determine canonical location for cleanup: `.axm/extensions/@<scope>/skills/<name>/` for registry sources, `.agents/skills/<name>/` for others.

### `skills fork` handler (new)

```
handleFork(args)
│
├─ registryGuard()                          # Decision 13
│
├─ resolve input:
│    ├─ glob pattern? → match against lockfile keys → multiple skills
│    ├─ installed skill name? → read from lockfile, get files from current location
│    └─ source string? → parseSource → sources.resolve(...) (same as install)
│
├─ for each matched skill:
│    ├─ determineScope()                    # Decision 8
│    │   ├─ project settings scope
│    │   ├─ global settings scope
│    │   └─ prompt user → persist to project settings
│    │
│    ├─ checkUniqueness()
│    │   └─ registryProvider.checkNameExists(scope, "skill", name)
│    │       └─ collision? → prompt for alternate name
│    │
│    └─ build 3 sequential ops:
│         ├─ ForkSkillOperation    { source, targetName: "@scope/name" }
│         ├─ PublishSkillOperation  { name: "@scope/name", registryName: "local" }
│         └─ AddSkillOperation     { source: Source (registry variant), ... }
│
├─ buildPlan(ops, lockfile, "Fork skill(s)", ...)
│    └─ single job, concurrency: 1 (must be sequential: fork → publish → install)
│
└─ ws.resolvePlan(plan, {
     "fork-skill": forkSkill,
     "publish-skill": publishSkill,
     "install-skill": installSkill,        # reused from install
   })
```

### `fork-skill` operation executor (new)

```
forkSkill(op)
│
├─ resolve source files (from discovery or existing install location)
├─ write to .axm/extensions/@<scope>/skills/<name>/
└─ generate axm-skill.json manifest:
     { name: "@scope/name", version: "0.1.0", agents: [...], dependencies: {} }
```

### `skills publish` handler (new)

```
handlePublish(args)
│
├─ registryGuard()                          # Decision 13
├─ resolve scope if bare name provided (via getScope())
├─ validate managed extension exists in .axm/extensions/
├─ build PublishSkillOperation
├─ buildPlan(ops, lockfile, ...)
└─ ws.resolvePlan(plan, { "publish-skill": publishSkill })
```

### `publish-skill` operation executor (new)

```
publishSkill(op)
│
├─ read axm-skill.json from .axm/extensions/@<scope>/skills/<name>/
├─ build zip archive of extension directory
├─ compute SHA-256 checksum
├─ get target registry provider (by registryName from op args)
├─ provider.publishVersion(scope, "skill", name, version, archive, metadata)
│    ├─ write <version>.zip to registry layout path
│    └─ update/create index.json (prepend version entry)
└─ idempotency: same version + same checksum = no-op; different checksum = error
```

### New operation types

```typescript
export type ForkSkillArgs = {
  readonly source: Source; // where to fork from
  readonly targetName: string; // "@scope/name"
  readonly agents: ReadonlyArray<string>;
};
export type ForkSkillOperation = Operation<"fork-skill", ForkSkillArgs>;

export type PublishSkillArgs = {
  readonly name: string; // "@scope/name"
  readonly registryName: string; // named source to publish to (e.g. "local")
};
export type PublishSkillOperation = Operation<"publish-skill", PublishSkillArgs>;
```

`AddSkillOperation` retains the same shape. `SkillRef` evolves: `path` + `registry` fields replaced by `source: Source` — the source discriminator tells the executor which canonical path and lockfile shape to use.

### Modified supporting code

- **`operations.ts`**: `SkillRef` gains `source: Source`, drops `path`/`registry`. New `ForkSkillOperation` and `PublishSkillOperation` types
- **`source-to-lock-entry.ts`**: Registry case gains `checksum`, `resolvedVersion`, `sourceName`
- **`discover-skills.ts`**: Discovery logic moves into source provider implementations (Decisions 2–4). File becomes the `SourceProviders` service
- **`settings/schema.ts`**: `SourcesConfigSchema` evolves to `Schema.Array` of discriminated `SourceConfig` entries (Decision 5)
- **`workspace/service.ts`**: Gains `getScope()`, `getSources()`, `getSourceByName()`, `getRegistrySources()` (Decision 5)
- **`resolution/resolvers/ambiguous.ts`**: Hardcoded try-order replaced by `getSources()` iteration (Decision 6). Gains `WorkspaceContext` dependency
- **`sources/parser.ts`**: `resolveSlashPattern` removed — ambiguous resolution moves to resolver layer (Decision 6)

## Risks / Trade-offs

**[Breaking settings schema change]** → The `sources` field changes from an object with per-provider keys to a unified array of named sources. Existing per-provider fields that have configuration (`github`, `gitlab`, `bitbucket`, `azurerepos`, `registry`) become array entries discriminated by `source`. Fields with no configuration (`git`) are dropped entirely — git and local sources don't need SourceConfig entries. Backward compatibility is a non-concern — no migration utility needed.

**[Two canonical locations]** → Managed extensions live in `.axm/extensions/`, while git/local skills remain in `.agents/skills/`. This adds complexity to the install path. Mitigation: the `installSkill` handler already computes the canonical path — it just needs a conditional based on source type. Over time, `skills fork` provides a migration path for users who want all their extensions managed.

**[Dependencies in schema but not resolved]** → The registry index and manifest schemas include `dependencies` for forward compatibility with extension packs, but dependency resolution is not implemented in this change. This means the schema is validated but the `dependencies` field is ignored at runtime. Mitigation: this is intentional — the schema is designed ahead of implementation to avoid breaking changes when extension packs are introduced.

**[Archive format is zip]** → Zip is widely supported but lacks built-in streaming decompression. For the local provider this is irrelevant (file I/O is fast). For future remote provider, streaming matters more. Mitigation: zip is the pragmatic choice for v0.1.0; could add tar.gz support later if needed.

**[Forward-compatible agent IDs]** → Using `string[]` instead of `AgentId[]` for the registry `agents` field means publishers can declare agents the client doesn't recognize. Mitigation: the client filters locally — unknown agents are silently ignored during compatibility checks. This is intentional for ecosystem extensibility.
