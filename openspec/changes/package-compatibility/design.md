## Context

Extension discovery today is entirely keyword-driven via `axm skills search`. Users must know what to look for. There is no mechanism to connect an extension to the ecosystem packages it supports, nor for library authors to recommend extensions alongside their packages.

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
- Describe how Tier 1 ecosystem parsers and readers (npm, pypi) are structured
- Clarify how packs surface aggregated package-compatibility context
- Describe how `axm skills install --preview` surfaces compatibility context

**Non-Goals:**

- Backward compatibility with existing manifest schemas
- Tier 2–5 ecosystem parser/reader implementations (incremental, same pattern as Tier 1)
- axm remote registry ecosystem indexing (deferred per proposal)
- Recommendation ranking or scoring
- Auto-installation of discovered extensions
- VERS version constraint parsing (start with versionless and exact match; VERS is additive)
- Modifying ecosystem files (axm is read-only for project manifests)

## Decisions

### 1. purl library: `packageurl-js`

Use the `packageurl-js` reference implementation rather than a custom parser.

**Why:** purl normalization rules are non-trivial (type-specific lowercasing, percent-encoding for scoped npm names, namespace splitting for Maven/Go). The reference implementation is maintained by the purl-spec team, handles all registered purl types, and aligns with ECMA-427. A custom parser risks spec divergence and duplicates work.

**Wrapping:** Define a `PurlString` branded type via Effect Schema that validates strings through `packageurl-js`. This gives schema-level validation at manifest parse time and publish time without exposing the `PackageURL` class in the manifest schema.

```typescript
// packages/core/src/unstable/purl/purl-string.ts
const PurlString = Schema.String.pipe(
  Schema.filter((s) =>
    Effect.try(() => PackageURL.fromString(s)).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    ),
  ),
  Schema.brand("PurlString"),
);
```

**Alternative considered:** Custom minimal parser — lower dependency count but higher risk of purl spec non-compliance, especially for edge cases (Go module path splitting, percent-encoding, `pkg:generic` qualifiers).

### 2. `compatiblePackages` on `CommonManifestFields`

Add `compatiblePackages` as an optional field on `CommonManifestFields` so it applies to all extension types (skills, commands, MCP servers).

```typescript
// In CommonManifestFields schema
compatiblePackages: Schema.optionalWith(Schema.Array(PurlString), { exact: true });
```

**Why `CommonManifestFields`:** Every extension type can express package relationships. Placing it in common avoids duplicating the field across manifest schemas. Packs do not use this field directly — they aggregate compatibility from their constituent extensions (see Decision 7).

**Validation:** At publish time, each purl string is parsed by `packageurl-js`. Invalid purls fail schema validation and block publishing. The registry additionally validates that purl types use registered types (rejecting invented types like `pkg:imaginary/foo`).

**Alternative considered:** Per-manifest-type fields — rejected because the field semantics are identical across types and would cause schema duplication.

### 3. Registry discover endpoint

New endpoint on the registry client interface:

```typescript
// Added to RegistryClient interface
discoverExtensions(args: {
  readonly purls: ReadonlyArray<string>
}): Effect<DiscoverExtensionsResponse, AppError>
```

**Request:** `POST /extensions/discover` with body `{ purls: string[] }`. The CLI sends purls detected from local manifest files.

**Response schema:**

```typescript
interface DiscoverExtensionsResponse {
  readonly results: ReadonlyArray<{
    readonly detectedPurl: string;
    readonly extensions: ReadonlyArray<{
      readonly fqn: string;
      readonly type: ExtensionType;
      readonly name: string;
      readonly owner: string;
      readonly description: string;
      readonly latestVersion: string;
      readonly signal: "compatible" | "recommended";
    }>;
  }>;
}
```

Results are grouped by `detectedPurl` so the CLI can present per-package attribution without reshuffling. The `signal` field distinguishes compatible (from `compatiblePackages` declarations) vs recommended (from package author metadata). An extension matching multiple detected purls appears in multiple groups.

**Why a single endpoint:** The proposal specifies that the CLI sends all detected purls in one request and the registry returns all matches. This avoids per-ecosystem round trips and lets the registry do version matching server-side. The response shape maps directly to the CLI's grouped output format.

**Alternative considered:** Per-purl queries — rejected because it creates N network round trips proportional to the user's dependency count. Batch query is both simpler and faster.

### 4. Local registry discover implementation: scan at query time

The local registry implements `discoverExtensions` by scanning all published extensions at query time rather than maintaining a pre-built index.

**Algorithm:**

1. Walk `<registry-root>/extensions/` directories
2. Read each extension's `index.json` to get the latest version's metadata
3. Read the manifest from the latest version's archive to check `compatiblePackages`
4. For each detected purl in the request, match against each extension's `compatiblePackages`
5. Return grouped results

**Matching rules (initial scope):**

- Normalize both purls (type, namespace, name) using `packageurl-js`
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
                         │
            ┌────────────┼────────────┐
            ▼                         ▼
  ┌─────────────────┐      ┌─────────────────────┐
  │ readLocal(purls) │      │ queryRegistry(purls) │
  └────────┬────────┘      └──────────┬───────────┘
           │                          │
           └────────────┬─────────────┘
                        ▼
              ┌─────────────────┐
              │  merge + present │
              └─────────────────┘
```

1. **Detect** — Run all registered ecosystem detectors in parallel (`Effect.forEach` with concurrency). Each detector scans for its manifest files and produces `ReadonlyArray<DetectedPackage>`. Results are deduplicated by normalized purl.

2. **Read local** and **Query registry** run in parallel (`Effect.all`). Local reading checks installed packages for recommendation metadata. Registry query sends detected purls and receives compatible extensions.

3. **Merge** — Combine local recommendations (signal: `recommended`) with registry results (signal: `compatible`). If the same extension appears in both, the `recommended` signal wins (stronger trust).

4. **Present** — Group by package, sort packages alphabetically, show extensions under each with signal badge.

**Where it lives:**

```
packages/core/src/unstable/
  purl/
    index.ts                    # barrel
    purl-string.ts              # PurlString branded Schema type
  extensions/
    detection/
      index.ts                  # barrel, exports all detectors
      detector.ts               # EcosystemDetector interface
      detect.ts                 # orchestrator: runs all detectors
      npm.ts                    # Tier 1: package.json parser
      pypi.ts                   # Tier 1: requirements.txt, pyproject.toml parser
    recommendations/
      index.ts                  # barrel
      reader.ts                 # EcosystemReader interface
      read.ts                   # orchestrator: runs applicable readers
      npm.ts                    # Tier 1: node_modules package.json "axm" field
      pypi.ts                   # Tier 1: .dist-info/entry_points.txt + axm.json
    discover/
      index.ts                  # barrel
      discover.ts               # full pipeline: detect + read + query + merge
  registry/
    discover-schema.ts          # DiscoverExtensionsRequest/Response schemas

packages/cli/src/root/
  discover/
    command.ts                  # CLI command definition + flags
    handler.ts                  # handler wiring: discover pipeline → renderer
```

Detection and recommendation logic lives in `@axm.sh/core` because it is reusable (the registry could also run detection). The CLI command is a thin shell that wires the pipeline to output.

### 6. Ecosystem detector and reader interfaces

**Detector interface:**

```typescript
interface EcosystemDetector {
  readonly ecosystem: string; // e.g. "npm", "pypi"
  readonly purlType: string; // e.g. "npm", "pypi"
  readonly detect: (
    projectDir: string,
  ) => Effect<ReadonlyArray<DetectedPackage>, never, FileSystem | Path>;
}

interface DetectedPackage {
  readonly purl: string; // normalized purl string
  readonly ecosystem: string; // source ecosystem
  readonly source: string; // file that produced this purl (for diagnostics)
}
```

Detectors never fail with typed errors — a missing manifest file or parse issue is a non-error (the ecosystem simply does not apply). Detectors log warnings for malformed entries and skip them. This keeps the orchestrator simple: run all detectors, collect all results, no error handling branches.

**Reader interface:**

```typescript
interface EcosystemReader {
  readonly ecosystem: string;
  readonly purlType: string;
  readonly read: (
    pkg: DetectedPackage,
  ) => Effect<Option<ReadonlyArray<string>>, never, FileSystem | Path>;
}
```

A reader returns `Option.none()` if the package has no recommendation metadata, or `Option.some(extensionRefs)` with the `recommendedExtensions` array from the axm metadata schema. Like detectors, readers do not fail with typed errors — missing metadata is the normal case.

**Why no typed errors:** Detection and reading are best-effort. A parser encountering a malformed `package.json` should warn and continue, not abort discovery. Typed error channels would force the orchestrator to handle ecosystem-specific failure modes that all resolve the same way (skip and continue).

**Registration:** Detectors and readers are registered in arrays exported from their respective barrel files. The orchestrator iterates the array. Adding a new ecosystem means creating the detector/reader module and adding it to the array — no plugin registry or dynamic loading.

### 7. Pack compatibility aggregation

Packs do not declare `compatiblePackages` on their own manifest. Instead, compatibility is derived from constituent extensions at query time.

**In discover results:** The registry discover endpoint returns individual extensions, not packs. If a user's detected packages match extensions that belong to a pack, the individual extensions appear in results. The pack relationship is not surfaced in discover output.

**In pack preview:** When `axm packs install --preview` shows a pack's contents, each constituent extension's `compatiblePackages` is fetched from the registry and displayed alongside the extension name. This is an enhancement to the existing preview rendering, not a new endpoint.

**Why not aggregate on the pack manifest:** Pack authors would need to manually maintain an aggregated `compatiblePackages` list that mirrors their extensions. This drifts as extensions are updated. Deriving at query time is always accurate and requires no pack author action.

### 8. `axm skills install --preview` compatibility context

When `--preview` is specified, the install handler already fetches extension metadata from the registry. If the extension's `compatiblePackages` is non-empty, the preview output includes a "Compatible packages" section showing the purl list.

This is a rendering change, not a data change — the `compatiblePackages` field is already present in the manifest which the preview reads.

### 9. `axm-package-meta.json` schema definition

The shared recommendation metadata schema used by library authors across all ecosystems is published as a JSON Schema at a well-known URL. The schema source lives in the repository:

```
packages/core/src/unstable/purl/axm-package-meta.schema.json
```

This schema is also represented as an Effect Schema (`AxmPackageMeta`) for validation when the CLI reads recommendation metadata from installed packages:

```typescript
const AxmPackageMeta = Schema.Struct({
  $schema: Schema.optionalWith(Schema.String, { exact: true }),
  recommendedExtensions: Schema.Array(Schema.String),
});
```

Extension refs in `recommendedExtensions` are validated as FQN-with-version-constraint strings (`@scope/type/name@constraint`). Invalid entries are warned and skipped, not fatal — library authors may publish before the referenced extension exists.

### 10. npm detector specifics (Tier 1)

Parses `package.json` in the project directory. Extracts dependencies from `dependencies`, `devDependencies`, and `peerDependencies` objects.

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

For each detected npm package, reads `node_modules/<name>/package.json` and checks for an `"axm"` field. If present, validates against `AxmPackageMeta` schema and extracts `recommendedExtensions`.

**Scoped packages:** `pkg:npm/%40scope/name` → `node_modules/@scope/name/package.json`. The percent-encoded `@` in the purl is decoded to the filesystem path.

**Missing `node_modules`:** If `node_modules` does not exist or the package directory is absent, returns `Option.none()`. This is the normal case for projects that haven't installed dependencies.

### 12. pypi detector specifics (Tier 1)

Parses Python dependency files in priority order, deduplicating across files:

1. `pyproject.toml` — `[project.dependencies]` and `[project.optional-dependencies]`
2. `requirements.txt` — one dependency per line (with `-r` include support)
3. `setup.cfg` — `[options] install_requires`
4. `Pipfile` — `[packages]` section

**Name normalization:** Python package names are case-insensitive and treat `-`, `_`, and `.` as equivalent. Normalize to lowercase with underscores replaced by dashes per purl spec (e.g., `Flask_RESTful` → `pkg:pypi/flask-restful`).

**Version handling:** PEP 440 version specifiers (e.g., `>=3.0,<4.0`) are not included in the purl — the detection is versionless. Exact pins (`==3.2.1`) produce versioned purls.

### 13. pypi reader specifics (Tier 1)

For each detected pypi package, locates the installed package's `.dist-info` directory and checks for axm metadata:

1. Scan `site-packages/` (or virtualenv equivalent) for `<normalized_name>-*.dist-info/`
2. Read `entry_points.txt` and check for an `[axm]` group
3. If present, locate `axm.json` from the package data directory
4. Validate against `AxmPackageMeta` schema

**No Python dependency:** The CLI reads `entry_points.txt` (INI format) and `axm.json` (JSON) directly — no Python interpreter is needed.

**Virtual environments:** The reader checks `$VIRTUAL_ENV/lib/python*/site-packages/` if `$VIRTUAL_ENV` is set, otherwise falls back to the system site-packages. This aligns with how Python projects typically operate.

### 14. Registry `VersionEntry` schema update

Add `compatiblePackages` to the `VersionEntry` schema in `registry/schema.ts`:

```typescript
// In VersionEntry schema
compatiblePackages: Schema.optionalWith(Schema.Array(PurlString), { exact: true });
```

This stores compatibility metadata per-version in the registry index. The publish pipeline extracts `compatiblePackages` from the manifest and includes it in the version entry. The discover endpoint reads this field during matching.

### 15. Project directory detection for `axm discover`

The command operates from the current working directory by default. It does not walk up the directory tree to find a project root — it scans the cwd for manifest files directly. This matches how tools like `npm install` and `pip install` operate.

An optional `--path <dir>` flag allows scanning a different directory.

In monorepo contexts, the command scans only the specified (or current) directory. This avoids the unbounded purl set problem noted in the proposal's open questions. Users can run `axm discover` from a subdirectory to scope results.

## Risks / Trade-offs

**Large dependency sets** — Projects with hundreds of dependencies produce large purl arrays sent to the registry. The discover endpoint should enforce a reasonable limit (e.g., 500 purls) and return an error if exceeded. The CLI can also cap detection with a diagnostic message. [Risk] → Limit enforcement at both CLI and registry.

**`packageurl-js` dependency** — Adds a runtime dependency. The package is well-maintained (reference implementation) and has no transitive dependencies. [Risk] → Low; the alternative (custom parser) carries higher maintenance risk.

**Parser accuracy** — Manifest files have ecosystem-specific edge cases (npm aliases, Python extras, Gradle Kotlin DSL). Tier 1 parsers may miss edge cases initially. [Risk] → Unit tests against real-world manifests; warn-and-skip for unparseable entries.

**Local reader portability** — Reading `node_modules` and `.dist-info` directories assumes standard ecosystem layouts. Non-standard setups (e.g., pnpm's symlink structure, Poetry's virtualenv locations) may require reader adjustments. [Risk] → Start with standard layouts; extend reader logic based on user reports.

**Privacy** — Detected purls reveal the user's dependency set. Scoped npm names could expose organization identity. Mitigations from the proposal apply: explicit invocation only, no transitive dependencies, local-only fallback for recommendations. [Risk] → Already addressed by proposal-level mitigations; no additional design-level action needed.

**Discover results for uninstalled packages** — When a dependency is listed in a manifest but not installed, the reader returns no recommendations. The user sees only `compatible` results from the registry, missing potential `recommended` results. This is acceptable — the proposal notes that the axm remote registry can fill this gap in the future. [Risk] → Acceptable limitation documented in proposal scope.
