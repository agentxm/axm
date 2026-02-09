## Context

Extensions currently install from git repositories and local filesystem paths. The install pipeline (parseSource → discoverSkills → selectSkills → buildPlan → applyPlan) copies skill files to a canonical location (`.agents/skills/{name}`) and creates symlinks into each agent's skills directory. The lockfile records source metadata; settings records the source string.

There is no versioning, no integrity verification, and no dependency resolution. The `RegistrySource` type exists but is a placeholder (`{url|path}` union). The settings schema has `sources.registry` as an optional field accepting one or more `{url|path}` objects.

This design introduces a local registry provider backed by a static-file layout, a canonical managed extension store, and a `skills fork` command for converting unmanaged skills into managed ones.

**Constraints:**

- Remote registry provider is out of scope (future work)
- Extension identity remains `@scope/name` (no type in identity path)
- Must coexist with existing git/local install flows
- Reuse the existing operations/plan model where possible

## Goals / Non-Goals

**Goals:**

- Define a static-file registry layout usable by both local and future remote providers
- Implement a local file registry provider for reading and writing registry data
- Introduce a registry provider abstraction that dispatches by location type
- Evolve source configuration to named sources with scope-based routing
- Establish `.axm/extensions/` as the canonical store for managed extensions
- Support installing from and publishing to local registries
- Add `skills fork` for converting unmanaged skills to managed extensions
- Integrate with existing plan-based execution model

**Non-Goals:**

- Remote/HTTP registry provider (future — the provider interface accommodates it)
- Publishing protocol (auth, validation, index regeneration for remote registries)
- Discovery feed or search index
- Lockfile pinning for dependency trees (future)
- Signature verification
- Migration of existing installed skills to the new location

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
          <version>.json
          <version>.zip
```

Extension identity remains `@scope/name`, but the directory structure includes the extension type (`skills` or `mcp-servers`) as a path segment. This keeps different extension types in separate namespaces on disk without changing the identity model.

When resolving `@acme/code-review`, the client must know the extension type to construct the path. For `skills install` and `skills fork`, the type is always `skills`. Future `mcp-servers install` would use `mcp-servers`.

**Alternative considered:** Flat layout without type segment (`@scope/name/`). Rejected because it prevents same-named extensions of different types from coexisting in the same scope.

### 2. Registry provider abstraction dispatches by location scheme

```typescript
interface RegistryProvider {
  readonly fetchIndex: (
    scope: string,
    type: ExtensionType,
    name: string,
  ) => Effect<ExtensionIndex, RegistryError>;

  readonly fetchVersionMetadata: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
  ) => Effect<VersionMetadata, RegistryError>;

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
    metadata: VersionMetadata,
  ) => Effect<void, RegistryError>;

  readonly checkNameExists: (
    scope: string,
    type: ExtensionType,
    name: string,
  ) => Effect<boolean, RegistryError>;
}
```

A factory function creates the appropriate provider based on location:

- Local path or `file://` URL → `LocalRegistryProvider` (reads/writes to filesystem)
- `https://` URL → not implemented, fails with descriptive error

The local provider translates method calls to filesystem operations against the registry layout. `fetchIndex` reads `<root>/extensions/@<scope>/skills/<name>/index.json`, `publishVersion` writes the zip and updates `index.json`, etc.

**Alternative considered:** Single provider with transport abstraction (HttpTransport, FileTransport). Rejected as over-engineered for the current scope — the provider interface itself is the abstraction boundary.

### 3. Source configuration evolves to named sources array

Current schema:

```json
{
  "sources": {
    "github": { "url": "..." },
    "registry": [{ "url": "..." }, { "path": "..." }]
  }
}
```

New schema:

```json
{
  "sources": [
    {
      "name": "local",
      "source": "registry",
      "location": ".axm/extensions"
    },
    {
      "name": "corp",
      "source": "registry",
      "location": "https://registry.corp.example.com",
      "scopes": ["@corp", "@internal"]
    },
    {
      "name": "default",
      "source": "registry",
      "location": "https://registry.agentxm.ai"
    }
  ]
}
```

Key properties:

- **`name`**: Unique identifier for CLI targeting (e.g., `axm publish --registry local`)
- **`source`**: Discriminator. Only `"registry"` for v0.1.0; future types like `"git"` possible
- **`location`**: Local path or URL. Paths are normalized to absolute paths internally
- **`scopes`**: Optional scope filter. If present, source is only consulted for matching scopes

The existing `sources.github`, `sources.gitlab`, etc. fields are unrelated to registry sources and remain unchanged. The `sources.registry` field is replaced by entries in the new `sources` array.

**Resolution order:**

1. Collect sources whose `scopes` includes the target extension's scope
2. If no scope-matched sources, collect sources with no `scopes` field
3. Query in array order. 404 → fallthrough. Other errors → hard fail

**Default source:** Every workspace implicitly has a source pointing to its own `.axm/extensions/` directory (for managed extensions). This is the "local" source and is always consulted first, before any configured sources. It does not need to be declared in settings.

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
4. Extract to `.axm/extensions/<scope>/skills/<name>/`
5. Symlink from agent dirs (reusing existing `installForAgent` logic)
6. Update lockfile and settings

The `installSkill` operation handler needs a conditional path: if the source is `registry`, use `.axm/extensions/` as canonical; otherwise use `.agents/skills/` as before.

### 5. `skills fork` orchestrates existing operations

The `skills fork` command converts an unmanaged skill into a managed extension:

**Input:** A skill reference — either:

- Name of an installed skill (e.g., `frontend-design`)
- A source string (same formats as `skills install`)

**Flow:**

1. **Resolve source skill**: If name matches an installed skill (in lockfile), read its files from the current canonical location. Otherwise, discover from the source string (same as install's discovery phase).
2. **Determine scope/name**: Default scope from settings, original skill name. Prompt user to confirm or change.
3. **Check uniqueness**: Query configured registry sources (via `checkNameExists`) to ensure `@scope/name` doesn't collide. If collision, prompt for alternate name.
4. **Create managed extension**:
   - Create `.axm/extensions/<scope>/skills/<name>/`
   - Copy `SKILL.md` and any additional files from the source
   - Generate `axm-skill.json` manifest with `name: "@scope/name"`, `version: "0.1.0"`, agent compatibility from settings
5. **Build plan with two operations**:
   - `uninstall-skill`: Remove the original (if it was installed)
   - `install-skill`: Install from the new managed location
6. **Execute via `resolvePlan`**: Display plan, confirm, apply — reusing the existing plan model

This is a new `ForkSkillOperation` at the orchestration level that decomposes into the existing `UninstallSkillOperation` + `AddSkillOperation`, or it could be a handler-level flow that calls the existing operation handlers directly. Given the plan model's job/step structure, modeling fork as a plan with two sequential jobs (uninstall then install) fits naturally.

### 6. Publishing to local registries

`axm publish` (or `axm skills publish`) writes an extension from `.axm/extensions/` to a local registry:

**Input:**

- Extension to publish (defaults to current directory's extension, or `@scope/name`)
- Target registry name (defaults to first writable local source)

**Flow:**

1. **Validate extension**: Read `axm-skill.json` from `.axm/extensions/<scope>/skills/<name>/`. Verify required fields (name, version).
2. **Build archive**: Create a zip of the extension directory rooted in `<name>/` (matching the archive format spec).
3. **Compute checksum**: SHA-256 of the zip bytes, formatted as `sha256:<hex>`.
4. **Determine agent compatibility**: Read from `axm-skill.json` or from workspace settings.
5. **Write to registry**:
   - Write `<version>.zip` to `<registry>/extensions/@<scope>/skills/<name>/`
   - Write `<version>.json` with version metadata
   - Read existing `index.json` (or create new), prepend version entry, write back
6. **Idempotency**: If the version already exists and checksum matches, no-op. If version exists with different checksum, fail (no overwrites without `--force`).

Only extensions in `.axm/extensions/` (managed extensions) can be published. Git-sourced and local-path skills are not publishable because they lack the manifest and versioning metadata.

### 7. Extension index and version metadata schemas

Defined as Effect Schemas for validation:

**ExtensionIndex** (`index.json`):

- `name`: string (extension name without scope)
- `scope`: string (including `@` prefix)
- `type`: `"skill" | "mcp-server"`
- `description`: optional string
- `repository`: optional string
- `license`: optional string
- `authors`: optional array of `{name, url?, email?}`
- `versions`: array of VersionEntry (newest first)

**VersionEntry** (inside `index.json` and standalone `<version>.json`):

- `version`: string (semver)
- `published`: string (ISO 8601)
- `agents`: array of strings (agent identifiers — stored as strings, not validated against `AgentId` exhaustive list, for forward compatibility)
- `dependencies`: record of `@scope/name` → semver range
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
  "author": { "name": "Acme Corp" }
}
```

This uses the existing `CommonManifestFields` from `extensions/common.ts` as the base, extended with `agents` and `dependencies`. The manifest is the source of truth for publish metadata — the registry `index.json` is derived from it.

For forked extensions, the manifest is generated with sensible defaults: version `0.1.0`, agents from workspace settings, empty dependencies.

## Risks / Trade-offs

**[Breaking settings schema change]** → The `sources` field changes from an object with per-provider keys to an array of named sources. Mitigation: the old `sources.github`, `sources.gitlab`, etc. fields remain unchanged (they configure git hosting providers, not registries). Only `sources.registry` is replaced. A migration utility can convert `sources.registry` entries to the new array format on first read.

**[Two canonical locations]** → Managed extensions live in `.axm/extensions/`, while git/local skills remain in `.agents/skills/`. This adds complexity to the install path. Mitigation: the `installSkill` handler already computes the canonical path — it just needs a conditional based on source type. Over time, `skills fork` provides a migration path for users who want all their extensions managed.

**[Local-only dependency resolution]** → Dependency resolution for local registries requires all transitive dependencies to be available in a configured local source. Mitigation: acceptable for v0.1.0 where the primary use case is local/corporate registries. Remote resolution will address this in a future version.

**[No lockfile pinning for dependency trees]** → The lockfile records the directly installed extension but not its resolved dependency tree. Mitigation: defer to a future lockfile evolution. For v0.1.0, dependencies are resolved at install time and the flat extension store in `.axm/extensions/` serves as the de facto lock.

**[Archive format is zip]** → Zip is widely supported but lacks built-in streaming decompression. For the local provider this is irrelevant (file I/O is fast). For future remote provider, streaming matters more. Mitigation: zip is the pragmatic choice for v0.1.0; could add tar.gz support later if needed.

**[Forward-compatible agent IDs]** → Using `string[]` instead of `AgentId[]` for the registry `agents` field means publishers can declare agents the client doesn't recognize. Mitigation: the client filters locally — unknown agents are silently ignored during compatibility checks. This is intentional for ecosystem extensibility.
