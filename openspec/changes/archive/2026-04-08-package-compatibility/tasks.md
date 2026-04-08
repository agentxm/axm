> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Foundation: Packaging Schemas

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** None — this is the first phase.

- [x] 1.1 Add `packageurl-js` as a runtime dependency in `packages/core/package.json` and run `pnpm install`
- [x] 1.2 Write tests for `PackageTypeSchema`: brand applied, values round-trip through schema
- [x] 1.3 Create `packages/core/src/unstable/packaging/package-type.ts` with `PackageTypeSchema` branded string schema and `PackageType` type
- [x] 1.4 Run `pnpm typecheck` for core package and fix any issues
- [x] 1.5 Write tests for `PackageUrlSchema`: valid purls decode to `PackageUrlParts` with correct typed fields, invalid strings rejected, scoped npm packages round-trip correctly, encode roundtrip produces canonical form (e.g., `PKG:NPM/React` normalizes to `pkg:npm/react`)
- [x] 1.6 Create `packages/core/src/unstable/packaging/package-url.ts` with `PackageUrlPartsSchema`, `PackageUrlSchema` (String → Parts via `Schema.decodeTo` + `SchemaTransformation.transformOrFail` with `Result` returns), and `PackageUrlParts` type
- [x] 1.7 Run `pnpm typecheck` for core package and fix any issues
- [x] 1.8 Write tests for structural equivalence: `Schema.toEquivalence(PackageUrlPartsSchema)` identifies identical packages and distinguishes different ones, handles optional fields (namespace, version) correctly
- [x] 1.9 Create barrel file `packages/core/src/unstable/packaging/index.ts` exporting all public types and schemas
- [x] 1.10 Run `pnpm typecheck` and fix any issues
- [x] 1.11 Run `pnpm lint` and fix any issues
- [x] 1.12 Run `pnpm test` and fix any failures
- [x] 1.13 Kill any vitest worker processes

## 2. Foundation: Extension & Recommendation Schemas

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 1 must be complete.

- [x] 2.1 Write tests for `FullyQualifiedRefSchema`: FQN-only accepted, FQN with valid version constraint accepted, invalid FQN rejected, invalid constraint rejected
- [x] 2.2 Create `FullyQualifiedRefSchema` branded string in `packages/core/src/unstable/extensions/common.ts` with `Schema.check` + `Schema.brand("FullyQualifiedRef")` — validates FQN portion and optional `@constraint` suffix
- [x] 2.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 2.4 Write tests for `AxmPackageMetaSchema`: valid metadata with `recommendedExtensions`, optional `$schema`, invalid `recommendedExtensions` type rejected, extra fields tolerated
- [x] 2.5 Create `packages/core/src/unstable/packaging/axm-package-meta.ts` with `AxmPackageMetaSchema` Effect Schema using `FullyQualifiedRefSchema` for array entries
- [x] 2.6 Run `pnpm typecheck` for core package and fix any issues
- [x] 2.7 Write tests for `compatiblePackages` on extension manifests per spec `extension-package-compatibility`: skill/command/MCP server with field validates, absent field validates to `undefined`, empty array validates, invalid purl strings rejected at decode
- [x] 2.8 Add `compatiblePackages: Schema.optional(Schema.Array(PackageUrlSchema))` to `CommonManifestBaseFields` in `packages/core/src/unstable/extensions/common.ts`
- [x] 2.9 Run `pnpm typecheck` for core package and fix any issues
- [x] 2.10 Write tests for `VersionEntrySchema` with `compatiblePackages`: present array encodes to purl strings, absent key omitted
- [x] 2.11 Add `compatiblePackages: Schema.optional(Schema.Array(PackageUrlSchema))` to `VersionEntrySchema` in the registry schema module
- [x] 2.12 Update packaging barrel file and extensions barrel to export new types
- [x] 2.13 Run `pnpm typecheck` and fix any issues
- [x] 2.14 Run `pnpm lint` and fix any issues
- [x] 2.15 Run `pnpm test` and fix any failures
- [x] 2.16 Kill any vitest worker processes

## 3. Publish Pipeline Updates

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 2 must be complete.
> **Parallelization:** Tasks 3.1–3.3, 3.4–3.6, and 3.7–3.9 are independent — launch as parallel subagents.

- [x] 3.1 Write tests for skills publish: manifest with `compatiblePackages` propagates to `VersionEntry`, manifest without `compatiblePackages` omits field
- [x] 3.2 Update `packages/core/src/unstable/skills/operations/publish.ts` to extract `manifest.compatiblePackages` and spread into `VersionEntry` when present
- [x] 3.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 3.4 Write tests for commands publish: same propagation behavior as skills
- [x] 3.5 Update `packages/core/src/unstable/commands/operations/publish.ts` with same pattern
- [x] 3.6 Run `pnpm typecheck` for core package and fix any issues
- [x] 3.7 Write tests for MCP servers publish: same propagation behavior
- [x] 3.8 Update `packages/core/src/unstable/mcp-servers/operations/publish.ts` with same pattern
- [x] 3.9 Run `pnpm typecheck` for core package and fix any issues
- [x] 3.10 Write test verifying pack publish handler does NOT propagate `compatiblePackages`
- [x] 3.11 Write test verifying invalid purls in `compatiblePackages` cause publish to fail at schema decode
- [x] 3.12 Run `pnpm typecheck` and fix any issues
- [x] 3.13 Run `pnpm lint` and fix any issues
- [x] 3.14 Run `pnpm test` and fix any failures
- [x] 3.15 Run `pnpm test:e2e` and fix any failures
- [x] 3.16 Kill any vitest worker processes

## 4. Registry Discover Schemas + Interface

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 2 must be complete.

- [x] 4.1 Write tests for `DiscoverExtensionEntrySchema`, `DiscoverExtensionsResponseSchema`: encode/decode roundtrip, `results` grouped by `detectedPackage`, `resolvedRecommendations` flat list, no `signal` field
- [x] 4.2 Create `packages/core/src/unstable/registry/discover-schema.ts` with request/response schemas per Design Decision 3
- [x] 4.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 4.4 Add `discoverExtensions` method signature to `RegistryClient` interface: accepts `{ packages, workspaceRecommendedExtensions? }`, returns `Effect<DiscoverExtensionsResponse, AppError>`
- [x] 4.5 Export from registry barrel file
- [x] 4.6 Run `pnpm typecheck` and fix any issues
- [x] 4.7 Run `pnpm lint` and fix any issues
- [x] 4.8 Run `pnpm test` and fix any failures
- [x] 4.9 Kill any vitest worker processes

## 5. Detector/Reader Infrastructure

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 1 must be complete.

- [x] 5.1 Create `packages/core/src/unstable/packaging/types.ts` with `PackageDetector` interface (`type: PackageType`, `detect: (projectDir) => Effect<ReadonlyArray<DetectedPackage>, never, FileSystem | Path>`), `PackageReader` interface (`type: PackageType`, `read: (pkg) => Effect<Option<ReadonlyArray<FullyQualifiedRef>>, never, FileSystem | Path>`), and `DetectedPackage` type (`purl: PackageUrlParts`, `type: PackageType`, `source: string`)
- [x] 5.2 Write tests for detect orchestrator: empty detectors array, multiple detectors run, results flattened and deduplicated by `Schema.toEquivalence(PackageUrlPartsSchema)`, `Effect.forEach` with `concurrency: "unbounded"`
- [x] 5.3 Create `packages/core/src/unstable/packaging/detect.ts` with `detectPackages` orchestrator wrapped in `Effect.withSpan("discover.detect")`
- [x] 5.4 Run `pnpm typecheck` for core package and fix any issues
- [x] 5.5 Write tests for read orchestrator: empty readers array, reader returns `Option.none`, reader returns `Option.some(refs)`, results collected into `HashMap<string, ReadonlyArray<FullyQualifiedRef>>` keyed by encoded purl
- [x] 5.6 Create `packages/core/src/unstable/packaging/read.ts` with `readLocalRecommendations` orchestrator wrapped in `Effect.withSpan("discover.readLocal")`
- [x] 5.7 Update `packages/core/src/unstable/packaging/index.ts` barrel to export interfaces, types, and orchestrators
- [x] 5.8 Run `pnpm typecheck` and fix any issues
- [x] 5.9 Run `pnpm lint` and fix any issues
- [x] 5.10 Run `pnpm test` and fix any failures
- [x] 5.11 Kill any vitest worker processes

## 6. npm Detector + Reader (Tier 1)

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete.

- [x] 6.1 Write tests for npm detector per spec `cli-detect-npm`: exact version → versioned purl, semver/tilde/star range → versionless purl, scoped packages (`@scope/name` → `pkg:npm/%40scope/name`), npm aliases (`npm:real-name` → real package), skipped specifiers (`file:`, `workspace:`, `git:`, URL), `peerDependencies` included, missing `package.json` → empty array, malformed JSON → warning + empty array, no dependency sections → empty array
- [x] 6.2 Implement npm detector in `packages/core/src/unstable/packaging/npm.ts` — parse `package.json` via `fs.readFileString` + `Effect.try(JSON.parse)`, extract from `dependencies`/`devDependencies`/`peerDependencies`, construct purls via `packageurl-js`, decode through `PackageUrlSchema`, catch `SystemError` NotFound → empty
- [x] 6.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 6.4 Write tests for npm reader per spec `cli-read-npm`: valid `"axm"` field extracts `recommendedExtensions`, missing `"axm"` field → `Option.none`, malformed metadata → warning + `Option.none`, extra fields tolerated, scoped package path from `PackageUrlParts` namespace/name, missing `node_modules` → `Option.none`
- [x] 6.5 Implement npm reader in `packages/core/src/unstable/packaging/npm.ts` — read `node_modules/<name>/package.json`, validate `"axm"` field with `Schema.decodeUnknownResult(AxmPackageMetaSchema)`, reconstruct scoped paths from purl parts
- [x] 6.6 Run `pnpm typecheck` for core package and fix any issues
- [x] 6.7 Register npm detector and reader in packaging barrel arrays
- [x] 6.8 Run `pnpm typecheck` and fix any issues
- [x] 6.9 Run `pnpm lint` and fix any issues
- [x] 6.10 Run `pnpm test` and fix any failures
- [x] 6.11 Kill any vitest worker processes

## 7. pypi Detector + Reader (Tier 1)

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete.

- [x] 7.1 Write tests for pypi detector per spec `cli-detect-pypi`: `pyproject.toml` `[project.dependencies]` and `[project.optional-dependencies]`, `requirements.txt` one-per-line with `-r` include, `setup.cfg` `[options] install_requires`, `Pipfile` `[packages]`, name normalization (case-insensitive, underscores → dashes), exact pins (`==`) → versioned purl, PEP 440 ranges → versionless, deduplication across files, missing files → empty, malformed files → warning + skip
- [x] 7.2 Implement pypi detector in `packages/core/src/unstable/packaging/pypi.ts` — parse files in priority order, normalize names per purl spec
- [x] 7.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 7.4 Write tests for pypi reader per spec `cli-read-pypi`: `[axm]` entry point group in `.dist-info/entry_points.txt`, locate `axm.json` from package data, validate with `Schema.decodeUnknownResult(AxmPackageMetaSchema)`, missing `.dist-info` → `Option.none`, `$VIRTUAL_ENV` resolution
- [x] 7.5 Implement pypi reader in `packages/core/src/unstable/packaging/pypi.ts` — scan site-packages for `.dist-info`, read `entry_points.txt`, locate and validate `axm.json`
- [x] 7.6 Run `pnpm typecheck` for core package and fix any issues
- [x] 7.7 Register pypi detector and reader in packaging barrel arrays
- [x] 7.8 Run `pnpm typecheck` and fix any issues
- [x] 7.9 Run `pnpm lint` and fix any issues
- [x] 7.10 Run `pnpm test` and fix any failures
- [x] 7.11 Kill any vitest worker processes

## 8. Local Registry Discover Implementation

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phases 2 and 4 must be complete.

- [x] 8.1 Write tests for `purlMatch` function per Design Decision 4: versionless declaration matches any detected version, versionless detection matches any declaration, both exact versions match only if equal, both versionless always match, namespace presence/absence handled correctly
- [x] 8.2 Implement `purlMatch` and `purlIdentityMatch` helper functions using direct `PackageUrlParts` field comparison
- [x] 8.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 8.4 Write tests for local registry `discoverExtensions` per spec `registry-discover-query`: packages only, packages + recommendations, empty packages with recommendations, extension matches multiple packages appears in both groups, package with no matches omitted from results, recommendation resolution for valid refs, unknown refs omitted, no published extensions → empty, entry contains required fields (type, name, owner, description, latestVersion), no signal field in response
- [x] 8.5 Implement `discoverExtensions` in local registry — scan `extensionsRoot` directories, read `index.json` for each extension, match request purls against `compatiblePackages`, resolve `workspaceRecommendedExtensions` refs, group results by `detectedPackage` using `Array.groupBy`
- [x] 8.6 Run `pnpm typecheck` and fix any issues
- [x] 8.7 Run `pnpm lint` and fix any issues
- [x] 8.8 Run `pnpm test` and fix any failures
- [x] 8.9 Run `pnpm test:e2e` and fix any failures
- [x] 8.10 Kill any vitest worker processes

## 9. Discover Pipeline + CLI Command

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phases 6, 7, and 8 must be complete.

- [x] 9.1 Write tests for discover pipeline per spec `cli-discover`: full pipeline (detect → read → query → merge), empty project → no results no error, packages detected but no matches → clean output, deduplication across detectors, signal assignment (registry `results` → `compatible`, `resolvedRecommendations` → `recommended`, both → `recommended` wins), registry unreachable → `Effect.result` Failure → local recommended results shown + warning via `Effect.logWarning`
- [x] 9.2 Implement `packages/core/src/unstable/discover/discover.ts` — four-stage pipeline with `Effect.withSpan` per stage, `Effect.annotateLogs({ command: "discover", projectDir })`, `Effect.result` wrapping registry query
- [x] 9.3 Create `packages/core/src/unstable/discover/index.ts` barrel
- [x] 9.4 Run `pnpm typecheck` for core package and fix any issues
- [x] 9.5 Create `packages/cli/src/root/discover/command.ts` — CLI command definition with `--path <dir>` flag (default: cwd) and `--json` flag
- [x] 9.6 Create `packages/cli/src/root/discover/handler.ts` — wire discover pipeline to CLI renderer, format per-package attribution output with `compatible`/`recommended` badges, summary line
- [x] 9.7 Register discover command in CLI app (`packages/cli/src/app.ts`)
- [x] 9.8 Run `pnpm typecheck` for cli package and fix any issues
- [x] 9.9 Write tests for command output rendering: per-package grouping, badge display, summary ("Found N compatible extensions for M of K detected packages"), `--json` outputs raw `DiscoverExtensionsResponse`
- [x] 9.10 Run `pnpm typecheck` and fix any issues
- [x] 9.11 Run `pnpm lint` and fix any issues
- [x] 9.12 Run `pnpm test` and fix any failures
- [x] 9.13 Run `pnpm test:e2e` and fix any failures
- [x] 9.14 Kill any vitest worker processes

## 10. Skills Install Preview Enhancement

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 2 must be complete.

- [x] 10.1 Write tests per spec `cli-skills-install`: `--preview` shows "Compatible packages" section listing purls in human-readable form when `compatiblePackages` is non-empty, section omitted when field absent or empty
- [x] 10.2 Update skills install preview renderer to display "Compatible packages" section showing package name and ecosystem (e.g., `react (npm)`) from `compatiblePackages` metadata
- [x] 10.3 Run `pnpm typecheck` and fix any issues
- [x] 10.4 Run `pnpm lint` and fix any issues
- [x] 10.5 Run `pnpm test` and fix any failures
- [x] 10.6 Kill any vitest worker processes

## 11. Pack Preview Enhancement

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 2 must be complete.

- [x] 11.1 Write tests per spec `extension-packs`: pack install `--preview` shows per-extension `compatiblePackages` alongside extension names, pack with no compatible extensions shows no compatibility info, discover returns individual extensions not packs
- [x] 11.2 Update pack install preview renderer to display per-extension `compatiblePackages` from fetched registry metadata
- [x] 11.3 Run `pnpm typecheck` and fix any issues
- [x] 11.4 Run `pnpm lint` and fix any issues
- [x] 11.5 Run `pnpm test` and fix any failures
- [x] 11.6 Kill any vitest worker processes

## 12. JSON Schema Generation

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 2 must be complete.

- [x] 12.1 Add `AxmPackageMetaSchema` entry to `packages/cli/scripts/generate-schemas.ts` with output to `packages/core/site-content/__generated__/schemas/axm-package-meta.schema.json` using `JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(...))`
- [x] 12.2 Run schema generation (`pnpm generate`) and verify output is valid Draft-07 JSON Schema with `$schema` optional, `recommendedExtensions` required as array of strings
- [x] 12.3 Run `pnpm typecheck` and fix any issues
- [x] 12.4 Run `pnpm lint` and fix any issues
- [x] 12.5 Run `pnpm test` and fix any failures
- [x] 12.6 Kill any vitest worker processes

## 13. Tier 2: golang Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with Phases 14–17.

- [x] 13.1 Write tests for golang detector per spec `cli-detect-golang`: parse `go.mod` `require` directives, filter `// indirect` comments, handle v2+ module path splitting (namespace = path prefix, name = last element), missing `go.mod` → empty, malformed → warning + empty
- [x] 13.2 Implement golang detector in `packages/core/src/unstable/packaging/golang.ts`
- [x] 13.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 13.4 Write tests for golang reader per spec `cli-read-golang`: read `axm.json` from `$GOPATH/pkg/mod/<module>@<version>/`, missing file → `Option.none`, malformed metadata → warning + `Option.none`
- [x] 13.5 Implement golang reader in `packages/core/src/unstable/packaging/golang.ts`
- [x] 13.6 Register golang detector and reader in packaging barrel arrays
- [x] 13.7 Run `pnpm typecheck` and fix any issues
- [x] 13.8 Run `pnpm lint` and fix any issues
- [x] 13.9 Run `pnpm test` and fix any failures
- [x] 13.10 Kill any vitest worker processes

## 14. Tier 2: cargo Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with Phases 13, 15–17.

- [x] 14.1 Write tests for cargo detector per spec `cli-detect-cargo`: parse `Cargo.toml` `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, shorthand string syntax, inline table syntax (`{ version = "1.0" }`), case-sensitive names preserved, exact versions (`=1.28.0`) → versioned purl, ranges → versionless, missing `Cargo.toml` → empty, malformed TOML → warning + empty
- [x] 14.2 Implement cargo detector in `packages/core/src/unstable/packaging/cargo.ts`
- [x] 14.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 14.4 Write tests for cargo reader per spec `cli-read-cargo`: use `cargo metadata --format-version 1` JSON output, extract `metadata.axm` from matching package, validate with `AxmPackageMetaSchema`, no metadata field → `Option.none`, `cargo` not available → `Option.none`
- [x] 14.5 Implement cargo reader in `packages/core/src/unstable/packaging/cargo.ts`
- [x] 14.6 Register cargo detector and reader in packaging barrel arrays
- [x] 14.7 Run `pnpm typecheck` and fix any issues
- [x] 14.8 Run `pnpm lint` and fix any issues
- [x] 14.9 Run `pnpm test` and fix any failures
- [x] 14.10 Kill any vitest worker processes

## 15. Tier 2: gem Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with Phases 13–14, 16–17.

- [x] 15.1 Write tests for gem detector per spec `cli-detect-gem`: parse `Gemfile` (`gem 'name'` lines), `*.gemspec` (`add_dependency`, `add_runtime_dependency`, `add_development_dependency`), optional platform qualifier, missing files → empty, malformed → warning + empty
- [x] 15.2 Implement gem detector in `packages/core/src/unstable/packaging/gem.ts`
- [x] 15.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 15.4 Write tests for gem reader per spec `cli-read-gem`: read `axm_*` keys from gemspec metadata hash in `<gem-dir>/specifications/<gem>.gemspec`, missing gemspec → `Option.none`, no axm keys → `Option.none`
- [x] 15.5 Implement gem reader in `packages/core/src/unstable/packaging/gem.ts`
- [x] 15.6 Register gem detector and reader in packaging barrel arrays
- [x] 15.7 Run `pnpm typecheck` and fix any issues
- [x] 15.8 Run `pnpm lint` and fix any issues
- [x] 15.9 Run `pnpm test` and fix any failures
- [x] 15.10 Kill any vitest worker processes

## 16. Tier 2: maven Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with Phases 13–15, 17.

- [x] 16.1 Write tests for maven detector per spec `cli-detect-maven`: parse `pom.xml` `<dependency>` elements (groupId → namespace, artifactId → name), `build.gradle` / `build.gradle.kts` dependency declarations, `gradle/libs.versions.toml` `[libraries]` section, missing files → empty, malformed → warning + empty
- [x] 16.2 Implement maven detector in `packages/core/src/unstable/packaging/maven.ts`
- [x] 16.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 16.4 Write tests for maven reader per spec `cli-read-maven`: extract `META-INF/axm.json` from local `.jar` in `~/.m2/repository/` or Gradle cache, missing jar → `Option.none`, no `axm.json` in jar → `Option.none`
- [x] 16.5 Implement maven reader in `packages/core/src/unstable/packaging/maven.ts`
- [x] 16.6 Register maven detector and reader in packaging barrel arrays
- [x] 16.7 Run `pnpm typecheck` and fix any issues
- [x] 16.8 Run `pnpm lint` and fix any issues
- [x] 16.9 Run `pnpm test` and fix any failures
- [x] 16.10 Kill any vitest worker processes

## 17. Tier 2: nuget Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with Phases 13–16.

- [x] 17.1 Write tests for nuget detector per spec `cli-detect-nuget`: parse `*.csproj`/`*.fsproj`/`*.vbproj` `<PackageReference>` elements, `Directory.Packages.props`, `packages.config`, case-insensitive names, missing files → empty, malformed → warning + empty
- [x] 17.2 Implement nuget detector in `packages/core/src/unstable/packaging/nuget.ts`
- [x] 17.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 17.4 Write tests for nuget reader per spec `cli-read-nuget`: read `axm.json` from `~/.nuget/packages/{id}/{version}/`, missing file → `Option.none`, malformed → warning + `Option.none`
- [x] 17.5 Implement nuget reader in `packages/core/src/unstable/packaging/nuget.ts`
- [x] 17.6 Register nuget detector and reader in packaging barrel arrays
- [x] 17.7 Run `pnpm typecheck` and fix any issues
- [x] 17.8 Run `pnpm lint` and fix any issues
- [x] 17.9 Run `pnpm test` and fix any failures
- [x] 17.10 Kill any vitest worker processes

## 18. Tier 3: composer Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with Phases 19–24 and all other Tier 3+ phases.

- [x] 18.1 Write tests for composer detector per spec `cli-detect-composer`: parse `composer.json` `require` and `require-dev`, vendor namespace required and lowercased, missing file → empty, malformed → warning + empty
- [x] 18.2 Implement composer detector in `packages/core/src/unstable/packaging/composer.ts`
- [x] 18.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 18.4 Write tests for composer reader per spec `cli-read-composer`: read `extra.axm` from `vendor/<pkg>/composer.json`, validate with `AxmPackageMetaSchema`, missing → `Option.none`
- [x] 18.5 Implement composer reader in `packages/core/src/unstable/packaging/composer.ts`
- [x] 18.6 Register in packaging barrel arrays
- [x] 18.7 Run `pnpm typecheck` and fix any issues
- [x] 18.8 Run `pnpm lint` and fix any issues
- [x] 18.9 Run `pnpm test` and fix any failures
- [x] 18.10 Kill any vitest worker processes

## 19. Tier 3: swift Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 3+ phases.

- [x] 19.1 Write tests for swift detector per spec `cli-detect-swift`: parse `Package.swift` via `swift package dump-package` JSON output, namespace = host + org, missing file → empty, `swift` CLI unavailable → warning + empty
- [x] 19.2 Implement swift detector in `packages/core/src/unstable/packaging/swift.ts`
- [x] 19.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 19.4 Write tests for swift reader per spec `cli-read-swift`: read `axm.json` from `.build/checkouts/<pkg>/`, missing → `Option.none`
- [x] 19.5 Implement swift reader in `packages/core/src/unstable/packaging/swift.ts`
- [x] 19.6 Register in packaging barrel arrays
- [x] 19.7 Run `pnpm typecheck` and fix any issues
- [x] 19.8 Run `pnpm lint` and fix any issues
- [x] 19.9 Run `pnpm test` and fix any failures
- [x] 19.10 Kill any vitest worker processes

## 20. Tier 3: hex Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 3+ phases.

- [x] 20.1 Write tests for hex detector per spec `cli-detect-hex`: parse `mix.exs` (`{:name, "~> version"}` tuples) and `gleam.toml` `[dependencies]`, optional org namespace, missing files → empty, malformed → warning + empty
- [x] 20.2 Implement hex detector in `packages/core/src/unstable/packaging/hex.ts`
- [x] 20.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 20.4 Write tests for hex reader per spec `cli-read-hex`: read `axm.json` from `deps/<pkg>/` or parse `extra` from `hex_metadata.config`, missing → `Option.none`
- [x] 20.5 Implement hex reader in `packages/core/src/unstable/packaging/hex.ts`
- [x] 20.6 Register in packaging barrel arrays
- [x] 20.7 Run `pnpm typecheck` and fix any issues
- [x] 20.8 Run `pnpm lint` and fix any issues
- [x] 20.9 Run `pnpm test` and fix any failures
- [x] 20.10 Kill any vitest worker processes

## 21. Tier 3: pub Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 3+ phases.

- [x] 21.1 Write tests for pub detector per spec `cli-detect-pub`: parse `pubspec.yaml` `dependencies` and `dev_dependencies`, name lowercase `[a-z0-9_]` only, missing file → empty, malformed → warning + empty
- [x] 21.2 Implement pub detector in `packages/core/src/unstable/packaging/pub.ts`
- [x] 21.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 21.4 Write tests for pub reader per spec `cli-read-pub`: read `axm` field from `pubspec.yaml` via `.dart_tool/package_config.json` → package root, missing → `Option.none`
- [x] 21.5 Implement pub reader in `packages/core/src/unstable/packaging/pub.ts`
- [x] 21.6 Register in packaging barrel arrays
- [x] 21.7 Run `pnpm typecheck` and fix any issues
- [x] 21.8 Run `pnpm lint` and fix any issues
- [x] 21.9 Run `pnpm test` and fix any failures
- [x] 21.10 Kill any vitest worker processes

## 22. Tier 3: docker Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 3+ phases.

- [x] 22.1 Write tests for docker detector per spec `cli-detect-docker`: parse `Dockerfile` `FROM` lines, `docker-compose.yml`/`docker-compose.yaml` `image:` fields, optional image-registry/org namespace, skip `FROM ${VARIABLE}` without default, missing files → empty, malformed → warning + empty
- [x] 22.2 Implement docker detector in `packages/core/src/unstable/packaging/docker.ts`
- [x] 22.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 22.4 Write tests for docker reader per spec `cli-read-docker`: read OCI annotations from pulled image manifests, missing/unavailable → `Option.none`
- [x] 22.5 Implement docker reader in `packages/core/src/unstable/packaging/docker.ts`
- [x] 22.6 Register in packaging barrel arrays
- [x] 22.7 Run `pnpm typecheck` and fix any issues
- [x] 22.8 Run `pnpm lint` and fix any issues
- [x] 22.9 Run `pnpm test` and fix any failures
- [x] 22.10 Kill any vitest worker processes

## 23. Tier 3: cocoapods Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 3+ phases.

- [x] 23.1 Write tests for cocoapods detector per spec `cli-detect-cocoapods`: parse `Podfile` (`pod 'Name'` lines) and `*.podspec` (`dependency` directives), subspecs via subpath, missing files → empty, malformed → warning + empty
- [x] 23.2 Implement cocoapods detector in `packages/core/src/unstable/packaging/cocoapods.ts`
- [x] 23.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 23.4 Write tests for cocoapods reader per spec `cli-read-cocoapods`: read `axm.json` from `Pods/<pkg>/`, missing → `Option.none`
- [x] 23.5 Implement cocoapods reader in `packages/core/src/unstable/packaging/cocoapods.ts`
- [x] 23.6 Register in packaging barrel arrays
- [x] 23.7 Run `pnpm typecheck` and fix any issues
- [x] 23.8 Run `pnpm lint` and fix any issues
- [x] 23.9 Run `pnpm test` and fix any failures
- [x] 23.10 Kill any vitest worker processes

## 24. Tier 3: conda Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 3+ phases.

- [x] 24.1 Write tests for conda detector per spec `cli-detect-conda`: parse `environment.yml` `dependencies` list and `meta.yaml`, map `pip:` sub-list items to `pkg:pypi`, `channel`/`subdir` qualifiers, missing files → empty, malformed → warning + empty
- [x] 24.2 Implement conda detector in `packages/core/src/unstable/packaging/conda.ts`
- [x] 24.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 24.4 Write tests for conda reader per spec `cli-read-conda`: read `axm.json` from `$CONDA_PREFIX/share/axm/` or `info/about.json` in package, missing → `Option.none`
- [x] 24.5 Implement conda reader in `packages/core/src/unstable/packaging/conda.ts`
- [x] 24.6 Register in packaging barrel arrays
- [x] 24.7 Run `pnpm typecheck` and fix any issues
- [x] 24.8 Run `pnpm lint` and fix any issues
- [x] 24.9 Run `pnpm test` and fix any failures
- [x] 24.10 Kill any vitest worker processes

## 25. Tier 4: conan Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 25.1 Write tests for conan detector per spec `cli-detect-conan`: parse `conanfile.txt` `[requires]` section and `conanfile.py` `requires` attribute, missing files → empty, malformed → warning + empty
- [x] 25.2 Implement conan detector in `packages/core/src/unstable/packaging/conan.ts`
- [x] 25.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 25.4 Write tests for conan reader per spec `cli-read-conan`: read from `conandata.yml` or `extension_properties` in Conan cache, missing → `Option.none`
- [x] 25.5 Implement conan reader in `packages/core/src/unstable/packaging/conan.ts`
- [x] 25.6 Register in packaging barrel arrays
- [x] 25.7 Run `pnpm typecheck` and fix any issues
- [x] 25.8 Run `pnpm lint` and fix any issues
- [x] 25.9 Run `pnpm test` and fix any failures
- [x] 25.10 Kill any vitest worker processes

## 26. Tier 4: cran Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 26.1 Write tests for cran detector per spec `cli-detect-cran`: parse `DESCRIPTION` file `Depends`, `Imports`, `Suggests` fields, missing → empty, malformed → warning + empty
- [x] 26.2 Implement cran detector in `packages/core/src/unstable/packaging/cran.ts`
- [x] 26.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 26.4 Write tests for cran reader per spec `cli-read-cran`: read `Config/axm` prefixed fields from `<lib-path>/<pkg>/DESCRIPTION`, missing → `Option.none`
- [x] 26.5 Implement cran reader in `packages/core/src/unstable/packaging/cran.ts`
- [x] 26.6 Register in packaging barrel arrays
- [x] 26.7 Run `pnpm typecheck` and fix any issues
- [x] 26.8 Run `pnpm lint` and fix any issues
- [x] 26.9 Run `pnpm test` and fix any failures
- [x] 26.10 Kill any vitest worker processes

## 27. Tier 4: huggingface Reader (no detector)

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 27.1 Write tests for huggingface reader per spec `cli-read-huggingface`: read YAML frontmatter from model cards in `~/.cache/huggingface/hub/models--<id>/`, extract axm metadata, missing cache → `Option.none`, malformed frontmatter → warning + `Option.none`
- [x] 27.2 Implement huggingface reader in `packages/core/src/unstable/packaging/huggingface.ts`
- [x] 27.3 Register huggingface reader (no detector) in packaging barrel arrays
- [x] 27.4 Run `pnpm typecheck` and fix any issues
- [x] 27.5 Run `pnpm lint` and fix any issues
- [x] 27.6 Run `pnpm test` and fix any failures
- [x] 27.7 Kill any vitest worker processes

## 28. Tier 4: cpan Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 28.1 Write tests for cpan detector per spec `cli-detect-cpan`: parse `cpanfile` (`requires 'Name'` lines) and `Makefile.PL` (`PREREQ_PM`), PAUSE author ID as namespace, distribution names, missing files → empty, malformed → warning + empty
- [x] 28.2 Implement cpan detector in `packages/core/src/unstable/packaging/cpan.ts`
- [x] 28.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 28.4 Write tests for cpan reader per spec `cli-read-cpan`: read `x_axm` from `<lib-path>/.meta/<dist>/MYMETA.json`, validate with `AxmPackageMetaSchema`, missing → `Option.none`
- [x] 28.5 Implement cpan reader in `packages/core/src/unstable/packaging/cpan.ts`
- [x] 28.6 Register in packaging barrel arrays
- [x] 28.7 Run `pnpm typecheck` and fix any issues
- [x] 28.8 Run `pnpm lint` and fix any issues
- [x] 28.9 Run `pnpm test` and fix any failures
- [x] 28.10 Kill any vitest worker processes

## 29. Tier 4: hackage Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 29.1 Write tests for hackage detector per spec `cli-detect-hackage`: parse `*.cabal` `build-depends` fields and `stack.yaml` `extra-deps`, missing files → empty, malformed → warning + empty
- [x] 29.2 Implement hackage detector in `packages/core/src/unstable/packaging/hackage.ts`
- [x] 29.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 29.4 Write tests for hackage reader per spec `cli-read-hackage`: read `x-axm` prefixed fields from `.cabal` in `~/.cabal/store/` or `dist-newstyle/`, missing → `Option.none`
- [x] 29.5 Implement hackage reader in `packages/core/src/unstable/packaging/hackage.ts`
- [x] 29.6 Register in packaging barrel arrays
- [x] 29.7 Run `pnpm typecheck` and fix any issues
- [x] 29.8 Run `pnpm lint` and fix any issues
- [x] 29.9 Run `pnpm test` and fix any failures
- [x] 29.10 Kill any vitest worker processes

## 30. Tier 4: julia Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 30.1 Write tests for julia detector per spec `cli-detect-julia`: parse `Project.toml` `[deps]` section (UUID-keyed), missing file → empty, malformed → warning + empty
- [x] 30.2 Implement julia detector in `packages/core/src/unstable/packaging/julia.ts`
- [x] 30.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 30.4 Write tests for julia reader per spec `cli-read-julia`: read `[axm]` section from `~/.julia/packages/<pkg>/<hash>/Project.toml`, missing → `Option.none`
- [x] 30.5 Implement julia reader in `packages/core/src/unstable/packaging/julia.ts`
- [x] 30.6 Register in packaging barrel arrays
- [x] 30.7 Run `pnpm typecheck` and fix any issues
- [x] 30.8 Run `pnpm lint` and fix any issues
- [x] 30.9 Run `pnpm test` and fix any failures
- [x] 30.10 Kill any vitest worker processes

## 31. Tier 4: luarocks Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 31.1 Write tests for luarocks detector per spec `cli-detect-luarocks`: parse `*.rockspec` `dependencies` table, missing files → empty, malformed → warning + empty
- [x] 31.2 Implement luarocks detector in `packages/core/src/unstable/packaging/luarocks.ts`
- [x] 31.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 31.4 Write tests for luarocks reader per spec `cli-read-luarocks`: read `axm.json` sidecar from LuaRocks tree, missing → `Option.none`
- [x] 31.5 Implement luarocks reader in `packages/core/src/unstable/packaging/luarocks.ts`
- [x] 31.6 Register in packaging barrel arrays
- [x] 31.7 Run `pnpm typecheck` and fix any issues
- [x] 31.8 Run `pnpm lint` and fix any issues
- [x] 31.9 Run `pnpm test` and fix any failures
- [x] 31.10 Kill any vitest worker processes

## 32. Tier 4: opam Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 32.1 Write tests for opam detector per spec `cli-detect-opam`: parse `*.opam` `depends` field and `dune-project` `(depends ...)` s-expression, missing files → empty, malformed → warning + empty
- [x] 32.2 Implement opam detector in `packages/core/src/unstable/packaging/opam.ts`
- [x] 32.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 32.4 Write tests for opam reader per spec `cli-read-opam`: read `x-axm` fields from `.opam` file in opam switch, missing → `Option.none`
- [x] 32.5 Implement opam reader in `packages/core/src/unstable/packaging/opam.ts`
- [x] 32.6 Register in packaging barrel arrays
- [x] 32.7 Run `pnpm typecheck` and fix any issues
- [x] 32.8 Run `pnpm lint` and fix any issues
- [x] 32.9 Run `pnpm test` and fix any failures
- [x] 32.10 Kill any vitest worker processes

## 33. Tier 4: bazel Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 4+ phases.

- [x] 33.1 Write tests for bazel detector per spec `cli-detect-bazel`: parse `MODULE.bazel` `bazel_dep()` calls and `WORKSPACE` `*_repository` rules, missing files → empty, malformed → warning + empty
- [x] 33.2 Implement bazel detector in `packages/core/src/unstable/packaging/bazel.ts`
- [x] 33.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 33.4 Write tests for bazel reader per spec `cli-read-bazel`: read `axm.json` from module cache or `external/<repo>/` in output base, missing → `Option.none`
- [x] 33.5 Implement bazel reader in `packages/core/src/unstable/packaging/bazel.ts`
- [x] 33.6 Register in packaging barrel arrays
- [x] 33.7 Run `pnpm typecheck` and fix any issues
- [x] 33.8 Run `pnpm lint` and fix any issues
- [x] 33.9 Run `pnpm test` and fix any failures
- [x] 33.10 Kill any vitest worker processes

## 34. Tier 5: zig Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 5 phases.

- [x] 34.1 Write tests for zig detector per spec `cli-detect-zig`: parse `build.zig.zon` URL-based dependencies with integrity hashes → `pkg:generic/zig` purls, missing file → empty, malformed → warning + empty
- [x] 34.2 Implement zig detector in `packages/core/src/unstable/packaging/zig.ts`
- [x] 34.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 34.4 Write tests for zig reader per spec `cli-read-zig`: read `axm.json` from `~/.cache/zig/` package cache, missing → `Option.none`
- [x] 34.5 Implement zig reader in `packages/core/src/unstable/packaging/zig.ts`
- [x] 34.6 Register in packaging barrel arrays
- [x] 34.7 Run `pnpm typecheck` and fix any issues
- [x] 34.8 Run `pnpm lint` and fix any issues
- [x] 34.9 Run `pnpm test` and fix any failures
- [x] 34.10 Kill any vitest worker processes

## 35. Tier 5: jsr Detector + deno Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 5 phases.

- [x] 35.1 Write tests for jsr detector per spec `cli-detect-jsr`: parse `deno.json`/`deno.jsonc` `imports` for `jsr:@scope/name` entries → `pkg:generic/jsr` purls, npm imports handled by npm detector, missing files → empty, malformed → warning + empty
- [x] 35.2 Implement jsr detector in `packages/core/src/unstable/packaging/jsr.ts`
- [x] 35.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 35.4 Write tests for deno reader per spec `cli-read-deno`: read `axm` field from `deno.json` in `$DENO_DIR/` cache, missing → `Option.none`
- [x] 35.5 Implement deno reader in `packages/core/src/unstable/packaging/jsr.ts` (co-located with jsr detector)
- [x] 35.6 Register jsr detector and deno reader in packaging barrel arrays
- [x] 35.7 Run `pnpm typecheck` and fix any issues
- [x] 35.8 Run `pnpm lint` and fix any issues
- [x] 35.9 Run `pnpm test` and fix any failures
- [x] 35.10 Kill any vitest worker processes

## 36. Tier 5: mojo Detector + Reader

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** Phase 5 must be complete. Parallel with all other Tier 5 phases.

- [x] 36.1 Write tests for mojo detector per spec `cli-detect-mojo`: parse `pixi.toml` and `mojoproject.toml` dependencies → `pkg:generic/mojo` or `pkg:conda` purls, missing files → empty, malformed → warning + empty
- [x] 36.2 Implement mojo detector in `packages/core/src/unstable/packaging/mojo.ts`
- [x] 36.3 Run `pnpm typecheck` for core package and fix any issues
- [x] 36.4 Write tests for mojo reader per spec `cli-read-mojo`: read `axm.json` from `.pixi/envs/` cache, missing → `Option.none`
- [x] 36.5 Implement mojo reader in `packages/core/src/unstable/packaging/mojo.ts`
- [x] 36.6 Register in packaging barrel arrays
- [x] 36.7 Run `pnpm typecheck` and fix any issues
- [x] 36.8 Run `pnpm lint` and fix any issues
- [x] 36.9 Run `pnpm test` and fix any failures
- [x] 36.10 Kill any vitest worker processes

## 37. Full Integration Verification

> **Subagent:** Run this entire phase in a single subagent.
> **Dependencies:** All previous phases must be complete.

- [x] 37.1 Run `pnpm typecheck` across all packages and fix any issues
- [x] 37.2 Run `pnpm lint` across all packages and fix any issues
- [x] 37.3 Run `pnpm test` across all packages and fix any failures
- [x] 37.4 Run `pnpm test:e2e` and fix any failures
- [x] 37.5 Kill any vitest worker processes
- [x] 37.6 Verify all new files are exported from their barrel files
- [x] 37.7 Verify `pnpm build` completes successfully
