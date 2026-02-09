## Context

Extensions currently install from git repositories and local filesystem paths. The install pipeline (parseSource → discoverSkills → selectSkills → buildPlan → applyPlan) copies skill files to a canonical location (`.agents/skills/{name}`) and creates symlinks into each agent's skills directory. The lockfile records source metadata; settings records the source string.

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

When resolving `@acme/code-review`, the client must know the extension type to construct the path. For `skills install` and `skills fork`, the type is always `skills`. Future `mcp-servers install` would use `mcp-servers`.

**Alternative considered:** Flat layout without type segment (`@scope/name/`). Rejected because it prevents same-named extensions of different types from coexisting in the same scope.

### 2. Source provider abstraction

A source provider unifies how all source types are accessed. Each source type (github, gitlab, bitbucket, azurerepos, git, registry, local) is implemented as a provider with capabilities appropriate to its type. Not all providers support the same operations — the abstraction uses a capability-based design.

```typescript
// Search criteria passed to find — independent of source identity
interface FindOptions {
  readonly names: ReadonlyArray<string>; // extension names to match (empty = all)
  readonly agents: ReadonlyArray<string>; // agent compatibility filter (empty = all)
  readonly type: ExtensionType | "*"; // "skill" | "mcp-server" | "*" (all)
}

// Base capabilities shared by all source providers
interface SourceProvider<S extends Source = Source> {
  readonly type: S["source"];
  readonly find: (
    source: S,
    options: FindOptions,
  ) => Effect<ReadonlyArray<ExtensionRef>, SourceError>;
  readonly fetch: (source: S, extension: ExtensionRef) => Effect<ExtensionFiles, SourceError>;
}

// Extended capabilities for registry source providers
interface RegistrySourceProvider extends SourceProvider<RegistrySource> {
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

Each ref carries `source: Source` — the source it was found at. This replaces the existing `SkillRef.path` and `SkillRef.registry` fields: a `LocalSource` carries the path, a `GitHubSource` carries owner/repo/ref, a `RegistrySource` carries scope/name. The ref always knows where it came from using the same `Source` type the rest of the system understands.

**Important:** `RegistrySource` describes the source _type_ (registry protocol with scope/name), not the transport. A registry source with a local filesystem path in settings is still a `RegistrySource` — the local vs remote distinction is handled by the provider implementation (`LocalRegistrySourceProvider` vs future remote provider), not by the `Source` type.

For git-based sources, `find` scans the repository and filters results by `names` (empty = return all discovered skills) and `agents`. For registry sources, `find` looks up the specific extensions by name from the configured registry locations. `agents` filters by compatibility in both cases.

Existing source types are migrated to the `SourceProvider` interface. For example, a `GitHubSourceProvider` implements `find` (list/filter skills in a repo) and `fetch` (clone/download files) but does not implement registry-specific methods like `publishVersion`. Many existing providers won't have all the same methods/capabilities as the registry provider — the interface is intentionally minimal at the base level.

Two registry source providers implement `RegistrySourceProvider`, dispatched by the configured location:

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

A factory function creates the appropriate provider based on the configured location in the named source configuration (Decision 3):

```typescript
// location is a local path or file:// URL → LocalRegistrySourceProvider
// location is an https:// URL → RemoteRegistrySourceProvider (stub)
const createRegistryProvider = (location: string): RegistrySourceProvider => ...
```

The dispatch is by location scheme, not by the `Source` type — a `RegistrySource` is always a `RegistrySource` regardless of whether the registry is local or remote.

**Alternative considered:** Single provider with transport abstraction (HttpTransport, FileTransport). Rejected as over-engineered — the provider interface itself is the abstraction boundary. The source provider abstraction provides a more general solution that covers all source types, not just registry.

### 3. Source configuration consolidates into named sources array

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
- **`source`**: Discriminator — `"github"`, `"gitlab"`, `"bitbucket"`, `"azurerepos"`, `"git"`, `"registry"`, `"local"`. Maps directly to `SourceType`
- **`url`**: Base URL override for git hosting providers (github, gitlab, bitbucket, azurerepos)
- **`location`**: Registry path or URL. Paths are normalized to absolute paths internally
- **`scopes`**: Optional scope filter. If present, source is only consulted for matching scopes

#### Layered source resolution

Source configurations are resolved through three layers, merged by `name` with later layers overriding earlier ones:

**1. Built-in defaults** — hardcoded in the application:

| name        | source      | config                         |
| ----------- | ----------- | ------------------------------ |
| `default`   | `registry`  | Remote registry (location TBD) |
| `github`    | `github`    | `https://github.com`           |
| `gitlab`    | `gitlab`    | `https://gitlab.com`           |
| `bitbucket` | `bitbucket` | `https://bitbucket.org`        |

**2. Global settings** (`~/.axm/settings.json` → `sources` array) — overrides built-in defaults by `name`. For example, a global entry with `"name": "github"` replaces the built-in GitHub config.

**3. Project settings** (`.axm/settings.json` → `sources` array) — overrides both global and built-in by `name`. A project entry with `"name": "default"` replaces the built-in remote registry with a project-specific one.

The merge algorithm:

1. Start with built-in defaults (ordered)
2. For each global source: if `name` matches a built-in, replace it in place; otherwise append
3. For each project source: if `name` matches an existing entry, replace it in place; otherwise append
4. Final list preserves ordering — built-in order for defaults, append order for additions

This is accessed via `Workspace`, which already has the global/local layering pattern. The `WorkspaceContextService` gains methods for scope and source resolution:

```typescript
// Discriminated union on `source`, normalized at parse time
type SourceConfig =
  | { readonly name: string; readonly source: "github"; readonly url: string }
  | { readonly name: string; readonly source: "gitlab"; readonly url: string }
  | { readonly name: string; readonly source: "bitbucket"; readonly url: string }
  | { readonly name: string; readonly source: "azurerepos"; readonly url: string }
  | { readonly name: string; readonly source: "git" }
  | {
      readonly name: string;
      readonly source: "registry";
      readonly location: string; // absolute path or URL (normalized at parse time)
      readonly scopes: Option<ReadonlyArray<string>>;
    }
  | { readonly name: string; readonly source: "local" };

export interface WorkspaceContextService {
  // ... existing fields (global, path, nonInteractive, preview, resolvePlan)

  /** Default scope (project > global > registry default > prompt).
   *  If no scope is configured and interactive, prompts the user and
   *  persists the result to project settings. */
  readonly getScope: () => Effect<string, SettingsError | PromptCancelled>;

  /** Source configurations (built-in → global → project merge). */
  readonly getSources: () => Effect<ReadonlyArray<SourceConfig>, SettingsError>;

  /** Lookup a source by name from the merged list. */
  readonly getSourceByName: (name: string) => Effect<Option<SourceConfig>, SettingsError>;

  /** Get registry sources only, optionally filtered by scope. */
  readonly getRegistrySources: (
    scope: Option<string>,
  ) => Effect<ReadonlyArray<SourceConfig & { source: "registry" }>, SettingsError>;
}
```

`SourceConfig` is validated and normalized (locations resolved to absolute paths) at parse time — no separate "resolved" type needed. `getSources()` performs the three-layer merge and caches the result for the lifetime of the workspace context. `getScope()` walks the resolution chain and prompts if needed.

#### Source resolution order (for extension lookup)

1. Collect sources whose `scopes` includes the target extension's scope
2. If no scope-matched sources, collect sources with no `scopes` field
3. Query in array order. 404 → fallthrough. Other errors → hard fail

**Location normalization:**

- `~/...` → expand home directory
- `./...` → resolve relative to workspace root
- `/...` → absolute path, used as-is
- `file://...` → strip scheme, use path
- `https://...` → future remote provider

**Alternative considered:** Keep `sources` as an object keyed by name. Rejected because array preserves ordering, which is semantically important for resolution priority.

### 4. Managed extensions live in `.axm/extensions/`

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

### 5. `skills fork` orchestrates existing operations

The `skills fork` command converts an unmanaged skill into a managed extension:

**Input:** A skill reference — either:

- Name of an installed skill (e.g., `frontend-design`)
- A source string (same formats as `skills install`)
- A glob pattern matching installed skill names (e.g., `effect-*`)

**Scope resolution** for determining the default scope of a forked extension (highest priority wins):

1. Project settings `scope` field
2. Global settings `scope` field
3. Default scope from default registry (future)
4. Logged-in user's scope (future — not implemented, out of scope for this change)
5. If none available, prompt the user for a scope — the provided value is persisted to the project settings `scope` field for future use

**Flow:** Fork reuses install's discovery pipeline (parseSource → discoverSkills → selectSkills) with additional steps for scope resolution and uniqueness checking, then builds a different plan (fork + publish + install ops instead of just install ops).

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

### 6. Publishing to local registries

`axm publish` (or `axm skills publish`) writes an extension from `.axm/extensions/` to a local registry:

**Input:**

- Extension to publish — `@scope/name`, or just `name` (resolved using default scope from `getScope()`). Defaults to current directory's extension if omitted.
- Target registry name (defaults to first writable local source)

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

### 7. Extension index and version entry schemas

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
- `yanked`: boolean

The `agents` field is intentionally string-typed rather than using `AgentIdSchema`. Registries should be agnostic of the client's agent vocabulary — a publisher may declare compatibility with agents the client doesn't know about. The client filters locally using its own `AgentId` registry.

### 8. Lockfile evolution for registry sources

Current `RegistryLockEntrySchema` has `source`, `scope`, `name`, `version`. Add:

- `checksum`: string — the `sha256:<hex>` of the installed archive (for integrity auditing)
- `resolvedVersion`: string — the exact semver version installed (distinct from the range in settings)
- `sourceName`: string — which named source it was resolved from (for `axm update` to know where to check)

The `version` field in settings remains the requested range (e.g., `^1.0.0`); `resolvedVersion` in the lockfile is the pinned version (e.g., `1.2.3`).

### 9. `axm-skill.json` manifest for managed extensions

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

This uses the existing `CommonManifestFields` from `extensions/common.ts` as the base, extended with `agents` and `dependencies`. The existing singular `author` field evolves to `authors` (array of `{name, email?, url?}`) — consistent with the index schema (Decision 7). The manifest is the source of truth for publish metadata — the registry `index.json` is derived from it.

For forked extensions, the manifest is generated with sensible defaults: version `0.1.0`, agents from workspace settings, empty dependencies.

## Handler Changes

### Modified Handlers

#### `skills install` handler (`skills/install/handler.ts`)

Currently: parses source string → discovers skills → selects → builds plan → resolves.

Changes: After parsing source, use `Workspace.getSources()` to get source configs. For registry sources, resolve version via the source provider's `find` instead of the current `discoverSkills`. Pass `FindOptions` (names from `--skills`, agents from settings, type `"skill"`). The discovery path splits: git/local sources use existing `discoverSkills`, registry sources use the source provider's `find` + `fetch`.

#### `skills install` operation (`skills/install/install-skill.ts`)

Currently: always writes to `.agents/skills/` as canonical location, copies files from a source path.

Changes: Conditional canonical path — if `source` is `registry`, use `.axm/extensions/@<scope>/skills/<name>/`; otherwise `.agents/skills/` as before. For registry sources, the archive is already extracted to the managed location (no source path copy needed). Lockfile entry gains `checksum`, `resolvedVersion`, `sourceName` fields for registry sources. The install operation pre-cleans any existing skill by the same name from all known skill directories (both `.axm/extensions/` and `.agents/skills/`), including symlinks in agent directories, before writing to the target canonical path. This ensures clean transitions when a skill moves between managed and unmanaged locations (e.g., fork workflow). The existing plan-level no-op logic (skip if already installed) remains — `--force` overrides it for explicit reinstall.

#### `skills uninstall` handler (`skills/uninstall/handler.ts`)

Currently: expands glob against lockfile keys, builds uninstall ops.

Changes: Minimal — uninstall needs to know which canonical location to clean up. Read lockfile entry's `source` field to determine whether to remove from `.axm/extensions/` or `.agents/skills/`.

#### `skills uninstall` operation (`skills/uninstall/uninstall-skill.ts`)

Changes: Look up the lockfile entry to determine canonical path. If `source: "registry"`, remove from `.axm/extensions/@<scope>/skills/<name>/`; otherwise `.agents/skills/<name>/` as before.

#### `init` handler (`init/handler.ts`)

Currently: triggers workspace initialization, displays agents.

Changes: Minimal — workspace initialization may now also display resolved source configs. No structural change to the handler itself.

### Modified Supporting Code

#### `operations.ts` (skill operation types)

`SkillRef` evolves: replace `path` + `registry` fields with `source: Source`. Add `type: "skill"` discriminator for `ExtensionRef` union. New `ForkSkillOperation` with params `source: Source` and `name: string`. New `PublishSkillOperation` with params for target registry name.

#### `source-to-lock-entry.ts`

Registry case gains `checksum`, `resolvedVersion`, `sourceName` fields — pulled from the resolved version entry in `index.json`, not from the old `SkillRef.registry`.

#### `discover-skills.ts`

Currently: monolithic function handling all source types (clone, scan, etc.).

Changes: Refactor to delegate to source providers. Each provider implements `find` — the discovery function becomes a thin dispatcher that gets the right provider from `Workspace.getSources()` and calls `provider.find(source, options)`.

#### `settings/schema.ts`

`SourcesConfigSchema` evolves from per-provider keys object to `Schema.Array` of discriminated `SourceConfig` entries. No migration — the old object format is simply replaced.

#### `workspace/service.ts`

`WorkspaceContextService` gains `getScope()`, `getSources()`, `getSourceByName()`, `getRegistrySources()` as described in Decision 3. The `make()` function performs the three-layer merge (built-in → global → project) during workspace construction.

### New Handlers

#### `skills fork` handler (new: `skills/fork/handler.ts`)

Input: skill name, source string, or glob pattern.

Flow: parse source → discover skills (same as install — may involve git shallow clone for git/hosting sources) → determine scope (layered resolution + prompt) → check uniqueness → build plan with 3 ops (fork → publish → install) → resolve plan.

#### `skills fork` operation (new: `skills/fork/fork-skill.ts`)

Copies the discovered skill's files to `.axm/extensions/@<scope>/skills/<name>/` and generates an `axm-skill.json` manifest with version `0.1.0`, agents from workspace settings, empty dependencies. No git cloning or special source handling — the fork operation receives already-fetched skill files from the discovery phase (same as install) and just writes them into the managed extension structure.

#### `skills publish` handler (new: `skills/publish/handler.ts`)

Input: extension `@scope/name` or just `name` (resolved via `getScope()` for default scope), target registry name.

Flow: resolve scope if bare name provided → validate managed extension → build archive → compute checksum → write to registry via `LocalRegistrySourceProvider.publishVersion`.

#### `skills publish` operation (new: `skills/publish/publish-skill.ts`)

Writes zip + updates `index.json` in target registry. Idempotent: same version + same checksum = no-op; same version + different checksum = error.

## Risks / Trade-offs

**[Breaking settings schema change]** → The `sources` field changes from an object with per-provider keys to a unified array of named sources. All existing per-provider fields (`github`, `gitlab`, `bitbucket`, `azurerepos`, `git`, `registry`) are consolidated into array entries discriminated by `source`. Backward compatibility is a non-concern — no migration utility needed.

**[Two canonical locations]** → Managed extensions live in `.axm/extensions/`, while git/local skills remain in `.agents/skills/`. This adds complexity to the install path. Mitigation: the `installSkill` handler already computes the canonical path — it just needs a conditional based on source type. Over time, `skills fork` provides a migration path for users who want all their extensions managed.

**[Dependencies in schema but not resolved]** → The registry index and manifest schemas include `dependencies` for forward compatibility with extension packs, but dependency resolution is not implemented in this change. This means the schema is validated but the `dependencies` field is ignored at runtime. Mitigation: this is intentional — the schema is designed ahead of implementation to avoid breaking changes when extension packs are introduced.

**[Archive format is zip]** → Zip is widely supported but lacks built-in streaming decompression. For the local provider this is irrelevant (file I/O is fast). For future remote provider, streaming matters more. Mitigation: zip is the pragmatic choice for v0.1.0; could add tar.gz support later if needed.

**[Forward-compatible agent IDs]** → Using `string[]` instead of `AgentId[]` for the registry `agents` field means publishers can declare agents the client doesn't recognize. Mitigation: the client filters locally — unknown agents are silently ignored during compatibility checks. This is intentional for ecosystem extensibility.
