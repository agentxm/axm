## ADDED Requirements

### Requirement: axm discover command orchestrates discovery

`axm discover` SHALL orchestrate a four-stage pipeline: detect packages from local manifests, read locally installed package metadata for recommendations, query the axm registry discover endpoint, and merge results with signal assignment. The command SHALL scan the current working directory by default.

#### Scenario: Full discovery pipeline

- **WHEN** user runs `axm discover` in a project with `package.json` containing `react` and `next` dependencies
- **AND** `node_modules/next/package.json` contains `"axm": { "recommendedExtensions": ["@vercel/skills/nextjs@^1.0.0"] }`
- **AND** the registry has `@acme/skills/react-testing` with `compatiblePackages: ["pkg:npm/react"]`
- **THEN** the output SHALL show `react` with `@acme/skills/react-testing` as `compatible`
- **AND** `next` with `@vercel/skills/nextjs` as `recommended`

#### Scenario: Empty project

- **WHEN** user runs `axm discover` in a directory with no recognized manifest files
- **THEN** the command SHALL report that no packages were detected
- **AND** no error SHALL be raised

### Requirement: Detection stage scans manifest files for purls

The detect stage SHALL run all registered package type detectors in parallel. Each detector scans for its manifest files and produces purls. Results from all detectors SHALL be flattened and deduplicated by structural purl equality (type, namespace, name, version).

#### Scenario: Multiple detectors run in parallel

- **WHEN** the project directory contains `package.json` and `requirements.txt`
- **THEN** the npm detector and pypi detector SHALL both run
- **AND** results SHALL be combined

#### Scenario: Duplicate purls deduplicated

- **WHEN** the same package appears in both `dependencies` and `peerDependencies` in `package.json`
- **THEN** the detected purl SHALL appear only once in the combined results

### Requirement: Read-local stage inspects installed package metadata

The read-local stage SHALL check locally installed packages for author-provided recommendation metadata. For each detected package, the appropriate reader SHALL look for axm metadata (e.g., `"axm"` field in npm `package.json`, `axm.json` sidecar). Results SHALL be collected into a mapping from purl to extension refs.

#### Scenario: Package with recommendation metadata

- **WHEN** `node_modules/next/package.json` contains `"axm": { "recommendedExtensions": ["@vercel/skills/nextjs@^1.0.0"] }`
- **THEN** the read stage SHALL collect `@vercel/skills/nextjs@^1.0.0` as a recommendation for `pkg:npm/next`

#### Scenario: Package without recommendation metadata

- **WHEN** `node_modules/react/package.json` does not contain an `"axm"` field
- **THEN** the read stage SHALL return no recommendations for `pkg:npm/react`

#### Scenario: Uninstalled package

- **WHEN** a package is listed in `package.json` but not present in `node_modules`
- **THEN** the read stage SHALL return no recommendations for that package
- **AND** no error SHALL be raised

### Requirement: Registry query sends packages and recommendations

The query stage SHALL send all detected purls as `packages` and all collected recommendation refs as `workspaceRecommendedExtensions` in a single `discoverExtensions` call to the registry.

#### Scenario: Single registry round trip

- **WHEN** 12 packages are detected and 3 recommendation refs are collected
- **THEN** the CLI SHALL send one discover request containing all 12 purls and 3 refs

### Requirement: Signal assignment during merge

The merge stage SHALL assign `compatible` or `recommended` signals based on provenance:

- Extensions from registry `results` SHALL be `compatible`
- Extensions from `resolvedRecommendations` or that also appear in local recommendations for the same purl SHALL be `recommended`
- When an extension is both compatible and recommended for the same package, `recommended` SHALL take precedence

#### Scenario: Compatible signal from registry match

- **WHEN** the registry returns `@acme/skills/react-testing` in `results` for `pkg:npm/react`
- **AND** no local recommendation exists for react
- **THEN** the extension SHALL display as `compatible`

#### Scenario: Recommended signal from local metadata

- **WHEN** local recommendation metadata recommends `@vercel/skills/nextjs`
- **AND** the registry resolves the ref in `resolvedRecommendations`
- **THEN** the extension SHALL display as `recommended`

#### Scenario: Recommended overrides compatible

- **WHEN** an extension appears in both registry `results` (compatible) and local recommendations (recommended) for the same package
- **THEN** the extension SHALL display as `recommended`

### Requirement: Graceful degradation when registry is unreachable

When the registry query fails, the command SHALL still present locally-derived `recommended` results from the read-local stage. A warning SHALL indicate that `compatible` results are unavailable. The command SHALL exit with a non-zero code to signal incomplete results.

#### Scenario: Registry unreachable

- **WHEN** the registry is unreachable during a discover query
- **AND** local recommendation metadata exists for some packages
- **THEN** the output SHALL show `recommended` extensions from local metadata
- **AND** a warning SHALL indicate registry-based compatible results are unavailable
- **AND** the exit code SHALL be non-zero

#### Scenario: Registry unreachable with no local recommendations

- **WHEN** the registry is unreachable
- **AND** no local recommendation metadata exists
- **THEN** the output SHALL show no results
- **AND** a warning SHALL indicate the registry is unreachable

### Requirement: Output format with per-package attribution

The output SHALL group results by package name. Under each package heading, matched extensions SHALL appear with their signal badge (`compatible` or `recommended`). A summary line SHALL report total compatible extensions found and how many detected packages had matches.

#### Scenario: Standard output format

- **WHEN** discover finds 6 compatible extensions across 3 of 12 detected packages
- **THEN** the output SHALL show each package heading with its extensions and signal badges
- **AND** a summary line such as "Found 6 compatible extensions for 3 of 12 detected packages."

#### Scenario: No matches found

- **WHEN** packages are detected but no extensions match
- **THEN** the output SHALL report that no compatible extensions were found

### Requirement: --path flag for alternative directory

`axm discover` SHALL accept an optional `--path <dir>` flag to scan a different directory instead of the current working directory. The flag SHALL NOT cause recursive scanning or directory-tree walking.

#### Scenario: Custom path specified

- **WHEN** user runs `axm discover --path ./packages/frontend`
- **THEN** the command SHALL scan `./packages/frontend` for manifest files instead of the cwd

### Requirement: Machine-readable JSON output

`axm discover` SHALL support `--json` via the CLI renderer infrastructure. When `--json` is active, the raw `DiscoverExtensionsResponse` SHALL be output as JSON.

#### Scenario: JSON output

- **WHEN** user runs `axm discover --json`
- **THEN** the output SHALL be a JSON object with `results` and `resolvedRecommendations` arrays
