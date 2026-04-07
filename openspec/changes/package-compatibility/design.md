## Context

Extension discovery today is entirely keyword-driven via `axm skills search`. Users must know what to look for. There is no mechanism to connect an extension to the packages it supports, nor for library authors to recommend extensions alongside their packages.

The extension manifest schemas (`CommonManifestFields` in `@axm.sh/core/unstable/extensions`) define shared fields across skills, commands, MCP servers, and packs. The registry client (`RegistryClient` interface) provides `getExtensionIndex`, `publishExtension`, and scope-based search — but no package-aware discovery endpoint. The local registry is filesystem-based, storing `index.json` and versioned archives under `<registry-root>/extensions/@<owner>/<type-plural>/<name>/`.

This design introduces package-aware extension discovery by adding `compatiblePackages` to extension manifests, a registry discover endpoint, local dependency detection, and recommendation reading from installed packages.

## Goals / Non-Goals

**Goals:**

- Define the `compatiblePackages` manifest field schema and validation
- Design the registry discover endpoint contract (request, response, matching)
- Establish the dependency detection pipeline (manifest parsing to purls)
- Establish the recommendation reading pipeline (installed package metadata to extension refs)
- Define the `axm discover` command architecture and output
- Specify the local registry discover implementation
- Describe how Tier 1 package type parsers and readers (npm, pypi) are structured
- Clarify how packs surface aggregated package-compatibility context
- Describe how `axm skills install --preview` surfaces compatibility context

**Non-Goals:**

- Backward compatibility with existing manifest schemas
- Tier 2–5 package type parser/reader implementations (incremental, same pattern as Tier 1)
- axm remote registry indexing of ecosystem registries (deferred per proposal)
- Recommendation ranking or scoring
- Auto-installation of discovered extensions
- VERS version constraint parsing (start with versionless and exact match; VERS is additive)
- Modifying project manifest files (axm is read-only)
- Visual distinction beyond the `recommended`/`compatible` badge (proposal Q1)
- Discover result caching and offline behavior (proposal Q2)
- Parser/reader plugin model for community-contributed adapters (proposal Q5)

## Decisions

### 1. purl library: `packageurl-js`

Use the `packageurl-js` reference implementation rather than a custom parser.

**Why:** purl normalization rules are non-trivial (type-specific lowercasing, percent-encoding for scoped npm names, namespace splitting for Maven/Go). The reference implementation is maintained by the purl-spec team, handles all registered purl types, and aligns with ECMA-427. A custom parser risks spec divergence and duplicates work.

**Wrapping:** Define a `PackageUrl` branded type via Effect Schema that **normalizes** strings through `packageurl-js` at decode time using `Schema.decodeTo` + `SchemaTransformation.transformOrFail`. This follows the same pattern used by `RegistrySourcePatternSchema` and `DateFromIsoDateTimeStringSchema` in the codebase. Normalization at decode time means the branded type always carries the canonical purl form (e.g., type lowercased, scoped npm names percent-encoded), so downstream matching can use string equality.

```typescript
// packages/core/src/unstable/packaging/package-url.ts
const PackageUrlSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transformOrFail({
      decode: (input: string) => {
        try {
          return Effect.succeed(PackageURL.fromString(input).toString());
        } catch {
          return Effect.fail(
            new SchemaIssue.Forbidden(Option.some(input), {
              message: `Expected valid purl, got: ${input}`,
            }),
          );
        }
      },
      encode: (value) => Effect.succeed(value),
    }),
  ),
  Schema.brand("PackageUrl"),
);

type PackageUrl = Schema.Schema.Type<typeof PackageUrlSchema>;
```

Decoding parses with `packageurl-js` and re-serializes via `.toString()`, producing the canonical form. This ensures consistent normalization regardless of input formatting. Encoding is a passthrough — the branded string is already normalized.

**Alternative considered:** `Schema.check` + `Schema.makeFilter` for validation-only (no normalization). Rejected because purl matching requires normalized strings; deferring normalization to each matching call-site would scatter `packageurl-js` usage and risk inconsistency.

> **Naming:** The branded type is `PackageUrl` and the schema is `PackageUrlSchema`, following the project's Effect Schema naming conventions.

### 2. `compatiblePackages` on `CommonManifestBaseFields`

Add `compatiblePackages` as an optional field on `CommonManifestBaseFields` so it applies to all extension types (skills, commands, MCP servers).

```typescript
// In CommonManifestBaseFields schema
compatiblePackages: Schema.optionalKey(Schema.Array(PackageUrlSchema)),
```

**Why `CommonManifestBaseFields`:** Every extension type can express package relationships. Placing it in the base fields avoids duplicating the field across manifest schemas. Packs do not use this field directly — they aggregate compatibility from their constituent extensions (see Decision 7).

**Validation:** At publish time, each purl string is parsed by `packageurl-js`. Invalid purls fail schema validation and block publishing. The registry additionally validates that purl types use registered types (rejecting invented types like `pkg:imaginary/foo`).

**Alternative considered:** Per-manifest-type fields — rejected because the field semantics are identical across types and would cause schema duplication.

> **Note:** The design uses `CommonManifestBaseFields` to match the actual schema name in `packages/core/src/unstable/extensions/common.ts`.

### 3. Registry discover endpoint

New endpoint on the registry client interface:

```typescript
// Added to RegistryClient interface
discoverExtensions(args: {
  readonly packages: ReadonlyArray<PackageUrl>;
  readonly workspaceRecommendedExtensions?: ReadonlyArray<FullyQualifiedRef>;
}): Effect<DiscoverExtensionsResponse, AppError>
```

**Request:** `POST /extensions/discover` with body `{ packages: string[], workspaceRecommendedExtensions?: string[] }`. The CLI sends purls detected from local manifest files as `packages`, and extension refs read from local recommendation metadata as `workspaceRecommendedExtensions`.

The registry performs two independent lookups:

1. **Package matching** — match `packages` purls against published extensions' `compatiblePackages` declarations
2. **Extension resolution** — resolve `workspaceRecommendedExtensions` refs to full extension metadata via index lookups

**Response schema:**

```typescript
// packages/core/src/unstable/registry/discover-schema.ts
const DiscoverExtensionEntrySchema = Schema.Struct({
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  owner: HandleSchema,
  description: Schema.String,
  latestVersion: ExactSemverVersionSchema,
});

const DiscoverExtensionsResponseSchema = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      detectedPackage: PackageUrlSchema,
      extensions: Schema.Array(DiscoverExtensionEntrySchema),
    }),
  ),
  resolvedRecommendations: Schema.Array(DiscoverExtensionEntrySchema),
});
```

`results` are grouped by `detectedPackage` so the CLI can present per-package attribution without reshuffling. An extension matching multiple detected packages appears in multiple groups. `resolvedRecommendations` is a flat list of full metadata for the requested `workspaceRecommendedExtensions` refs (those that exist in the registry).

The response contains no `signal` field — the registry is agnostic about why the CLI asked. The CLI assigns `compatible` or `recommended` signals during its own merge step based on provenance (see Decision 5).

**Why a single endpoint:** The proposal specifies that the CLI sends all detected purls in one request and the registry returns all matches. This avoids per-ecosystem round trips and lets the registry do version matching server-side. The batch approach handles both package matching and recommendation resolution in one round trip.

**Pagination:** Not needed at initial scope (local registry, Tier 1 ecosystems). The remote registry implementation should consider pagination or result-count caps if the response grows large for projects with many matched extensions.

**Alternative considered:** Per-purl queries — rejected because it creates N network round trips proportional to the user's dependency count. Batch query is both simpler and faster.

### 4. Local registry discover implementation: scan at query time

The local registry implements `discoverExtensions` by scanning all published extensions at query time rather than maintaining a pre-built index.

**Algorithm:**

1. Use `fs.readDirectory(extensionsRoot)` to list owner directories, then `fs.readDirectory` per owner to list type/name directories
2. Read each extension's `index.json` via `fs.readFileString` + `Schema.decodeUnknownEffect(ExtensionIndexSchema)` to get the latest version's `VersionEntry` (which includes `compatiblePackages` per Decision 14)
3. For each purl in the request's `packages`, match against each extension's `compatiblePackages`
4. For each ref in the request's `workspaceRecommendedExtensions`, look up full metadata from the matching extension's index
5. Group results by package using `Array.groupBy` and return `results` + `resolvedRecommendations` (flat list)

**Matching rules (initial scope):**

- Both purls are already normalized at decode time (Decision 1), so matching uses string comparison on type/namespace/name components. Use `PackageURL.fromString` to decompose when version-aware matching is needed.
- If the declaration is versionless → match any detected version (or versionless)
- If the detection is versionless → match any declaration (versionless or versioned)
- If both have exact versions → match only if versions are equal
- VERS constraint matching is deferred (see Non-Goals)

**Why scan vs index:** The local registry is used for development and testing with a small number of extensions. Scanning is simpler, avoids index staleness issues, and is fast enough for local use. The remote registry should build a reverse index (purl → extensions) at publish time for production-scale queries — that implementation is out of scope here but the endpoint contract is the same.

**Alternative considered:** File-based reverse index updated at publish time — adds complexity to local publish without meaningful performance benefit at local scale.

### 5. `axm discover` pipeline architecture

The CLI command orchestrates four stages:

```
┌─────────────────┐
│  detect(cwd)    │ ── manifests → purls
└────────┬────────┘
         ▼
┌─────────────────┐
│ readLocal(purls) │ ── installed packages → extension refs
└────────┬────────┘
         ▼
┌──────────────────────────┐
│ queryRegistry(packages,  │
│   workspaceRecommended)  │ ── registry → matches + resolutions
└────────────┬─────────────┘
             ▼
┌─────────────────┐
│  merge + present │
└─────────────────┘
```

1. **Detect** — Run all registered package type detectors via `Effect.forEach(detectors, (d) => d.detect(projectDir), { concurrency: "unbounded" })`. Each detector scans for its manifest files and produces `ReadonlyArray<DetectedPackage>`. Flatten results with `Array.flatten`, then deduplicate by normalized purl with `Array.dedupeWith` comparing the branded `purl` string (already normalized at decode time per Decision 1).

2. **Read local** — For each detected package, check installed package metadata for recommendation refs via `Effect.forEach(packages, (pkg) => findReader(pkg.type).read(pkg), { concurrency: "unbounded" })`. Collect results into a `HashMap<PackageUrl, ReadonlyArray<FullyQualifiedRef>>` using `HashMap.fromIterable` over the `Option.some` results.

3. **Query registry** — Send detected purls as `packages` and all collected recommendation refs as `workspaceRecommendedExtensions` in a single `discoverExtensions` call. Wrap with `Effect.result` to capture failure without propagating — this follows the same pattern as `resolve-source.ts`'s `firstSuccess` helper. The registry returns compatible extensions grouped by package (`results`) and resolved recommendation metadata (`resolvedRecommendations`).

4. **Merge + present** — The CLI assigns signals based on provenance:
   - Extensions from `results` are `compatible`
   - Extensions from `resolvedRecommendations` (or `results` entries that also appear in local recommendations for that purl) are `recommended`
   - If an extension is both compatible and recommended for the same package, `recommended` wins
   - Use `Array.groupBy` to group by package, sort packages alphabetically, show extensions under each with signal badge

**Registry unreachable:** When `Effect.result` returns a `Failure` for the registry query, the pipeline degrades gracefully. Locally-derived `recommended` results from the `readLocal` step are still presented. A warning diagnostic (via `Effect.logWarning`) indicates that `compatible` results are unavailable due to the registry error. The command exits with a non-zero code to signal incomplete results.

**Where it lives:**

```
packages/core/src/unstable/
  packaging/
    index.ts                    # barrel
    package-type.ts             # PackageType branded Schema type (PackageTypeSchema)
    package-url.ts              # PackageUrl branded Schema type (PackageUrlSchema)
    axm-package-meta.ts         # AxmPackageMeta Effect Schema
    axm-package-meta.schema.json # JSON Schema for library authors
    types.ts                    # PackageDetector, PackageReader interfaces, DetectedPackage
    detect.ts                   # orchestrator: runs all detectors in parallel
    read.ts                     # orchestrator: runs all readers in parallel
    npm.ts                      # Tier 1: npm detector + reader
    pypi.ts                     # Tier 1: pypi detector + reader
  discover/
    index.ts                    # barrel
    discover.ts                 # full pipeline: packaging detect/read + registry query + merge
  registry/
    discover-schema.ts          # DiscoverExtensionsRequest/Response schemas

packages/cli/src/root/
  discover/
    command.ts                  # CLI command definition + flags
    handler.ts                  # handler wiring: discover pipeline → renderer
```

Packaging-related code (purl types, ecosystem detectors, recommendation readers, and their orchestrators) lives in `@axm.sh/core/unstable/packaging` because it is reusable (the registry could also run detection). The `packaging` module never touches the registry — it owns package ecosystem knowledge only. The `discover` module is a thin pipeline that wires packaging detection/reading with the registry query and merge logic. The CLI command wires the pipeline to output.

### 6. Package detector and reader interfaces

`PackageType` is a branded string identifying a package ecosystem (e.g., `"npm"`, `"pypi"`, `"zig"`). Every value originates from a statically registered detector or reader — there is no case where an unknown package type is constructed at runtime.

```typescript
// packages/core/src/unstable/packaging/package-type.ts
const PackageTypeSchema = Schema.String.pipe(Schema.brand("PackageType"));

type PackageType = Schema.Schema.Type<typeof PackageTypeSchema>;
```

**Detector interface:**

```typescript
interface PackageDetector {
  readonly type: PackageType;
  readonly detect: (
    projectDir: string,
  ) => Effect<ReadonlyArray<DetectedPackage>, never, FileSystem | Path>;
}

interface DetectedPackage {
  readonly purl: PackageUrl;
  readonly type: PackageType;
  readonly source: string; // file that produced this purl (for diagnostics)
}
```

Each detector encapsulates purl construction internally — most map `type` directly to the purl type (e.g., `npm` → `pkg:npm/...`), while Tier 5 detectors construct `pkg:generic/<type>/...` purls.

Detectors never fail with typed errors — a missing manifest file or parse issue is a non-error (the package type simply does not apply). Detectors log warnings for malformed entries and skip them. This keeps the orchestrator simple: run all detectors, collect all results, no error handling branches.

**Filesystem error handling:** Detectors use `Effect.catchTag` on `PlatformError` to handle filesystem errors structurally. A `NotFound` from `fs.readFileString` (manifest doesn't exist) returns an empty array — the ecosystem doesn't apply. Other `SystemError` tags (`PermissionDenied`, etc.) are logged as warnings and also produce empty results.

```typescript
// Pattern for file-existence checks in detectors
const content =
  yield *
  fs.readFileString(manifestPath).pipe(
    Effect.catchTag("SystemError", (e) => {
      if (e.reason === "NotFound") return Effect.succeed(undefined);
      yield * Effect.logWarning(`Cannot read ${manifestPath}: ${e.message}`);
      return Effect.succeed(undefined);
    }),
  );
if (content === undefined) return [];
```

**Reader interface:**

```typescript
interface PackageReader {
  readonly type: PackageType;
  readonly read: (
    pkg: DetectedPackage,
  ) => Effect<Option<ReadonlyArray<FullyQualifiedRef>>, never, FileSystem | Path>;
}
```

A reader returns `Option.none()` if the package has no recommendation metadata, or `Option.some(extensionRefs)` with the `recommendedExtensions` array from the axm metadata schema. Like detectors, readers do not fail with typed errors — missing metadata is the normal case.

**Schema validation in readers:** Readers validate metadata JSON against `AxmPackageMeta` using `Schema.decodeUnknownOption`. When decoding returns `Option.none()` (malformed metadata), the reader logs a warning with `Effect.logWarning` and returns `Option.none()` — the same result as missing metadata.

```typescript
// Pattern for metadata validation in readers
const meta = Schema.decodeUnknownOption(AxmPackageMetaSchema)(parsed);
if (Option.isNone(meta)) {
  yield * Effect.logWarning(`Malformed axm metadata in ${pkg.purl}`);
  return Option.none();
}
return Option.some(meta.value.recommendedExtensions);
```

**Why no typed errors:** Detection and reading are best-effort. A parser encountering a malformed `package.json` should warn and continue, not abort discovery. Typed error channels would force the orchestrator to handle package-type-specific failure modes that all resolve the same way (skip and continue).

**Registration:** Detectors and readers are co-located per package type (e.g., `npm.ts` exports both) and registered in arrays exported from the barrel file. The orchestrator iterates the array. Adding a new package type means creating the module and adding it to the arrays — no plugin registry or dynamic loading.

### 7. Pack compatibility aggregation

Packs do not declare `compatiblePackages` on their own manifest. Instead, compatibility is derived from constituent extensions at query time.

**In discover results:** The registry discover endpoint returns individual extensions, not packs. If a user's detected packages match extensions that belong to a pack, the individual extensions appear in results. The pack relationship is not surfaced in discover output. Surfacing pack membership (e.g., "3 of these extensions are part of @vercel/packs/nextjs") is a natural future enhancement but is deferred from initial scope.

**In pack preview:** When `axm packs install --preview` shows a pack's contents, each constituent extension's `compatiblePackages` is fetched from the registry and displayed alongside the extension name. This is an enhancement to the existing preview rendering, not a new endpoint.

**Why not aggregate on the pack manifest:** Pack authors would need to manually maintain an aggregated `compatiblePackages` list that mirrors their extensions. This drifts as extensions are updated. Deriving at query time is always accurate and requires no pack author action.

### 8. `axm skills install --preview` compatibility context

When `--preview` is specified, the install handler already fetches extension metadata from the registry. If the extension's `compatiblePackages` is non-empty, the preview output includes a "Compatible packages" section showing the purl list.

This is a rendering change, not a data change — the `compatiblePackages` field is already present in the manifest which the preview reads.

### 9. `axm-package-meta.json` schema definition

The shared recommendation metadata schema used by library authors across all package types is published as a JSON Schema at a well-known URL. The **Effect Schema is the single source of truth** — the JSON Schema file is generated from it using `Schema.toJsonSchemaDocument`, not hand-maintained. This eliminates drift between the runtime validation schema and the published JSON Schema.

```typescript
// packages/core/src/unstable/packaging/axm-package-meta.ts
const AxmPackageMetaSchema = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  recommendedExtensions: Schema.Array(FullyQualifiedRefSchema),
}).annotate({
  identifier: "AxmPackageMeta",
  title: "axm Package Metadata",
  description: "Recommendation metadata shipped by library authors to surface axm extensions.",
});

// Generated at build time or checked into the repo:
// Schema.toJsonSchemaDocument(AxmPackageMetaSchema) → axm-package-meta.schema.json
```

The generated JSON Schema file lives at:

```
packages/core/src/unstable/packaging/axm-package-meta.schema.json
```

Schema annotations (`identifier`, `title`, `description`) on the Effect Schema flow through to the generated JSON Schema, providing documentation for library authors who reference the `$schema` URL.

`FullyQualifiedRef` is a branded string for extension references with an optional version constraint (`@owner/type/name` or `@owner/type/name@^1.0.0`). It validates that the FQN portion is a valid `FullyQualifiedName` and, when a constraint suffix is present, that it is a valid `VersionConstraint`. This type lives alongside `FullyQualifiedNameSchema` in the extensions module.

```typescript
// packages/core/src/unstable/extensions/common.ts
export const FullyQualifiedRefSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      // validate FQN portion and optional @constraint suffix
    }),
  ),
  Schema.brand("FullyQualifiedRef"),
);

export type FullyQualifiedRef = Schema.Schema.Type<typeof FullyQualifiedRefSchema>;
```

Invalid entries are warned and skipped, not fatal — library authors may publish before the referenced extension exists.

> **Note:** The existing `FullyQualifiedNameSchema` uses `Schema.check` but does not apply `Schema.brand`. Branding `FullyQualifiedNameSchema` to match is a worthwhile follow-up but is outside this change's scope.

### 10. npm detector specifics (Tier 1)

Parses `package.json` in the project directory via `fs.readFileString` + `JSON.parse` (wrapped in `Effect.try`). Extracts dependencies from `dependencies`, `devDependencies`, and `peerDependencies` objects.

Purl construction uses `PackageURL` from `packageurl-js` to build canonical purls, then decodes through `PackageUrlSchema` to produce branded values. This ensures all purls are normalized at creation.

**Dependency mapping rules:**

- `"react": "18.2.0"` (exact) → `pkg:npm/react@18.2.0`
- `"react": "^18.2.0"` (range) → `pkg:npm/react` (versionless)
- `"@angular/core": "^17.0.0"` (scoped) → `pkg:npm/%40angular/core`
- `"lodash-es": "npm:lodash@^4.17.0"` (alias) → `pkg:npm/lodash` (real package name)
- `"my-lib": "file:../my-lib"` (local) → skipped
- `"my-lib": "workspace:*"` (workspace) → skipped
- `"my-lib": "git+https://..."` (git) → skipped
- URL-based specifiers → skipped

**Why include `peerDependencies`:** Peer dependencies express framework relationships (e.g., a React component library declares `react` as a peer dependency). These are relevant for discovering framework-specific extensions.

### 11. npm reader specifics (Tier 1)

For each detected npm package, reads `node_modules/<name>/package.json` via `fs.readFileString` and checks for an `"axm"` field. If present, validates against `AxmPackageMetaSchema` using `Schema.decodeUnknownOption` and extracts `recommendedExtensions`. Malformed metadata returns `Option.none()` with a warning.

**Scoped packages:** `pkg:npm/%40scope/name` → `node_modules/@scope/name/package.json`. Use `PackageURL.fromString(purl)` to decompose the purl and reconstruct the filesystem path from the decoded namespace and name.

**Missing `node_modules`:** `fs.readFileString` produces a `SystemError` with `reason: "NotFound"` when the file is absent. The reader catches this via `Effect.catchTag("SystemError", ...)` and returns `Option.none()`. This is the normal case for projects that haven't installed dependencies.

### 12. pypi detector specifics (Tier 1)

Parses Python dependency files in priority order, deduplicating across files:

1. `pyproject.toml` — `[project.dependencies]` and `[project.optional-dependencies]`
2. `requirements.txt` — one dependency per line (with `-r` include support)
3. `setup.cfg` — `[options] install_requires`
4. `Pipfile` — `[packages]` section

`setup.py` is excluded — it is executable Python code, not a static manifest, and reliable parsing would require running the Python interpreter or fragile regex heuristics. The other four files cover the vast majority of Python projects.

**Name normalization:** Python package names are case-insensitive and treat `-`, `_`, and `.` as equivalent. Normalize to lowercase with underscores replaced by dashes per purl spec (e.g., `Flask_RESTful` → `pkg:pypi/flask-restful`).

**Version handling:** PEP 440 version specifiers (e.g., `>=3.0,<4.0`) are not included in the purl — the detection is versionless. Exact pins (`==3.2.1`) produce versioned purls.

### 13. pypi reader specifics (Tier 1)

For each detected pypi package, locates the installed package's `.dist-info` directory and checks for axm metadata:

1. Scan `site-packages/` (or virtualenv equivalent) via `fs.readDirectory` for `<normalized_name>-*.dist-info/`
2. Read `entry_points.txt` via `fs.readFileString` and check for an `[axm]` group
3. If present, locate `axm.json` from the package data directory
4. Validate against `AxmPackageMetaSchema` using `Schema.decodeUnknownOption` — malformed metadata returns `Option.none()` with a warning

**No Python dependency:** The CLI reads `entry_points.txt` (INI format) and `axm.json` (JSON) directly via `fs.readFileString` — no Python interpreter is needed.

**Virtual environments:** The reader checks `$VIRTUAL_ENV/lib/python*/site-packages/` if `$VIRTUAL_ENV` is set, otherwise falls back to the system site-packages. Use `fs.readDirectory` with pattern filtering to locate the `python*` directory under `lib/`. This aligns with how Python projects typically operate.

### 14. Registry `VersionEntry` schema update

Add `compatiblePackages` to the `VersionEntry` schema in `registry/schema.ts`:

```typescript
// In VersionEntry schema
compatiblePackages: Schema.optionalKey(Schema.Array(PackageUrlSchema)),
```

This stores compatibility metadata per-version in the registry index. The discover endpoint reads this field during matching.

**Publish pipeline changes:** Each extension type's publish operation constructs a `VersionEntry` before calling `client.publishExtension`. The following publish handlers need to extract `manifest.compatiblePackages` and spread it into the version entry when present:

- `packages/core/src/unstable/skills/operations/publish.ts`
- `packages/core/src/unstable/commands/operations/publish.ts`
- `packages/core/src/unstable/mcp-servers/operations/publish.ts`

Packs do not declare `compatiblePackages` (see Decision 7), so the pack publish handler is unchanged.

### 15. Project directory detection for `axm discover`

The command operates from the current working directory by default. It does not walk up the directory tree to find a project root — it scans the cwd for manifest files directly. This matches how tools like `npm install` and `pip install` operate.

An optional `--path <dir>` flag allows scanning a different directory.

In monorepo contexts, the command scans only the specified (or current) directory. This avoids the unbounded purl set problem noted in the proposal's open questions. Users can run `axm discover` from a subdirectory to scope results.

**Machine-readable output:** `axm discover` supports `--json` via the existing CLI renderer infrastructure. When `--json` is active, the command outputs the raw `DiscoverExtensionsResponse` as JSON, following the same renderer pattern used by other commands.

## Testing

Use `@effect/vitest` helpers (`it.effect`, `it.scoped`, `it.layer`) for all Effect tests. Detectors and readers require `FileSystem | Path` — provide test layers with in-memory or temp-dir file fixtures.

### Branded types

- `PackageUrlSchema` — valid purls accepted, invalid strings rejected, **normalization applied at decode time** (e.g., `PKG:NPM/React` decodes to `pkg:npm/react`; `pkg:npm/%40scope/name` round-trips correctly). Verify via `Schema.decodeUnknownSync` and `Schema.decodeUnknownOption`.
- `PackageTypeSchema` — brand applied, values round-trip through schema
- `FullyQualifiedRefSchema` — FQN-only accepted, FQN with valid constraint accepted, invalid FQN rejected, invalid constraint rejected

### Schema generation

- `Schema.toJsonSchemaDocument(AxmPackageMetaSchema)` produces valid JSON Schema with correct `required` fields, `$schema` as optional, and `recommendedExtensions` as array of strings.

### Detectors

- **npm** — each mapping rule in Decision 10 is a test case: exact versions, ranges, scoped packages, aliases, and skipped specifiers (`file:`, `workspace:`, `git:`, URL). Empty/missing `package.json` produces empty results (via `SystemError`/`NotFound` catch path). Malformed entries are warned and skipped.
- **pypi** — each file format (pyproject.toml, requirements.txt, setup.cfg, Pipfile). Name normalization (case, underscores, dashes). Exact pins produce versioned purls; ranges produce versionless. `-r` include resolution in requirements.txt.

### Readers

- **npm** — `"axm"` field present with valid `AxmPackageMeta`, missing `"axm"` field, malformed metadata (`Schema.decodeUnknownOption` returns `Option.none()` + warning logged), scoped package path decoding via `PackageURL.fromString`, missing `node_modules` (via `SystemError`/`NotFound` catch path).
- **pypi** — `[axm]` entry point group present with valid `axm.json`, missing `.dist-info`, `$VIRTUAL_ENV` resolution.

### Local registry discover

- Each matching rule from Decision 4: versionless declaration matches versioned detection, versionless detection matches versioned declaration, exact version match, exact version mismatch.
- Recommendation resolution: valid refs resolve to full metadata, unknown refs omitted.
- No published extensions returns empty results.

### Pipeline orchestration

- Empty project (no manifest files) — produces no results, no error.
- Packages detected but no matches — clean "no results" output.
- Deduplication — same package detected from multiple manifest files appears once (`Array.dedupeWith` on normalized branded purl strings).
- Registry unreachable — `Effect.result` returns `Failure`, locally-derived recommended results still presented with warning via `Effect.logWarning`.

### Publish pipeline

- `compatiblePackages` present in manifest — included in `VersionEntry`.
- `compatiblePackages` absent — field omitted from `VersionEntry` (existing behavior unchanged).
- Invalid purls in `compatiblePackages` — `PackageUrlSchema` decode fails at publish time (normalization step rejects via `SchemaIssue.Forbidden`).

## Risks / Trade-offs

**Large dependency sets** — Projects with hundreds of dependencies produce large purl arrays sent to the registry. The discover endpoint should enforce a reasonable limit (e.g., 500 purls) and return an error if exceeded. The CLI can also cap detection with a diagnostic message. [Risk] → Limit enforcement at both CLI and registry.

**`packageurl-js` dependency** — Adds a runtime dependency. The package is well-maintained (reference implementation) and has no transitive dependencies. [Risk] → Low; the alternative (custom parser) carries higher maintenance risk.

**Parser accuracy** — Manifest files have package-type-specific edge cases (npm aliases, Python extras, Gradle Kotlin DSL). Tier 1 parsers may miss edge cases initially. [Risk] → Unit tests against real-world manifests; warn-and-skip for unparseable entries.

**Local reader portability** — Reading `node_modules` and `.dist-info` directories assumes standard installed-package layouts. Non-standard setups (e.g., pnpm's symlink structure, Poetry's virtualenv locations) may require reader adjustments. [Risk] → Start with standard layouts; extend reader logic based on user reports.

**Privacy** — Detected purls reveal the user's dependency set. Scoped npm names could expose organization identity. Mitigations from the proposal apply: explicit invocation only, no transitive dependencies, local-only fallback for recommendations. [Risk] → Already addressed by proposal-level mitigations; no additional design-level action needed.

**Discover results for uninstalled packages** — When a dependency is listed in a manifest but not installed, the reader returns no recommendations. The user sees only `compatible` results from the registry, missing potential `recommended` results. This is acceptable — the proposal notes that the axm remote registry can fill this gap in the future. [Risk] → Acceptable limitation documented in proposal scope.
