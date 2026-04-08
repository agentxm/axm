## ADDED Requirements

### Requirement: Discover endpoint accepts packages and recommendations

The axm registry SHALL expose a discover endpoint that accepts two inputs: an array of detected package purls and an optional array of workspace-recommended extension refs. The registry SHALL perform two independent lookups: matching packages against published extensions' `compatiblePackages` declarations, and resolving recommended extension refs to full metadata.

#### Scenario: Discover with packages only

- **WHEN** the CLI sends `packages: ["pkg:npm/react", "pkg:npm/next"]` with no `workspaceRecommendedExtensions`
- **THEN** the registry SHALL return extensions whose `compatiblePackages` match the provided purls

#### Scenario: Discover with packages and recommendations

- **WHEN** the CLI sends `packages: ["pkg:npm/next"]` and `workspaceRecommendedExtensions: ["@vercel/skills/nextjs@^1.0.0"]`
- **THEN** the registry SHALL return both compatible extensions for `pkg:npm/next` in `results` and resolved metadata for `@vercel/skills/nextjs` in `resolvedRecommendations`

#### Scenario: Discover with empty packages

- **WHEN** the CLI sends `packages: []` with `workspaceRecommendedExtensions: ["@vercel/skills/nextjs@^1.0.0"]`
- **THEN** `results` SHALL be empty
- **AND** `resolvedRecommendations` SHALL contain resolved metadata for the requested ref

### Requirement: Response grouped by detected package

The discover response `results` SHALL be an array of entries, each containing a `detectedPackage` (the purl that was matched) and an `extensions` array of matching extension metadata. An extension matching multiple detected packages SHALL appear in multiple groups.

#### Scenario: Extension matches multiple packages

- **WHEN** extension `@acme/skills/fullstack` declares `compatiblePackages: ["pkg:npm/react", "pkg:npm/next"]`
- **AND** the request contains both `pkg:npm/react` and `pkg:npm/next`
- **THEN** the extension SHALL appear in both the `react` group and the `next` group in `results`

#### Scenario: Package with no matches omitted

- **WHEN** the request contains `pkg:npm/obscure-lib` and no extensions declare compatibility with it
- **THEN** no entry for `pkg:npm/obscure-lib` SHALL appear in `results`

### Requirement: Extension entry metadata

Each extension entry in the discover response SHALL include: `type` (extension type), `name` (extension name), `owner` (handle), `description`, and `latestVersion` (exact semver). The response SHALL NOT include a signal field — the CLI assigns `compatible` or `recommended` signals based on provenance.

#### Scenario: Extension entry contains required fields

- **WHEN** an extension matches a detected package
- **THEN** the entry SHALL include `type`, `name`, `owner`, `description`, and `latestVersion`

#### Scenario: No signal field in response

- **WHEN** the registry returns discover results
- **THEN** no entry SHALL contain a `signal`, `compatible`, or `recommended` field

### Requirement: Resolved recommendations as flat list

The `resolvedRecommendations` field SHALL be a flat array of extension metadata for the requested `workspaceRecommendedExtensions` refs that exist in the registry. Unknown refs SHALL be silently omitted.

#### Scenario: Known ref resolved

- **WHEN** `workspaceRecommendedExtensions` contains `"@vercel/skills/nextjs@^1.0.0"` and the extension exists
- **THEN** `resolvedRecommendations` SHALL contain an entry with full metadata for `@vercel/skills/nextjs`

#### Scenario: Unknown ref omitted

- **WHEN** `workspaceRecommendedExtensions` contains `"@unknown/skills/nonexistent@^1.0.0"` and the extension does not exist
- **THEN** `resolvedRecommendations` SHALL NOT contain an entry for it
- **AND** no error SHALL be raised

### Requirement: Package matching rules

The registry SHALL match detected purls against declared `compatiblePackages` using identity matching (type, namespace, name) plus version logic:

- Versionless declaration matches any detected version (or versionless)
- Versionless detection matches any declaration (versionless or versioned)
- Both exact versions: match only if equal
- VERS constraint matching is deferred from initial scope

#### Scenario: Versionless declaration matches versioned detection

- **WHEN** an extension declares `pkg:npm/react` (versionless)
- **AND** the request contains `pkg:npm/react@18.2.0`
- **THEN** the extension SHALL match

#### Scenario: Versionless detection matches versioned declaration

- **WHEN** an extension declares `pkg:npm/react@18.0.0`
- **AND** the request contains `pkg:npm/react` (versionless)
- **THEN** the extension SHALL match

#### Scenario: Versionless both sides match

- **WHEN** an extension declares `pkg:npm/react` (versionless)
- **AND** the request contains `pkg:npm/react` (versionless)
- **THEN** the extension SHALL match

#### Scenario: Exact version match

- **WHEN** an extension declares `pkg:npm/react@18.2.0`
- **AND** the request contains `pkg:npm/react@18.2.0`
- **THEN** the extension SHALL match

#### Scenario: Exact version mismatch

- **WHEN** an extension declares `pkg:npm/react@17.0.0`
- **AND** the request contains `pkg:npm/react@18.2.0`
- **THEN** the extension SHALL NOT match

#### Scenario: Different package types do not match

- **WHEN** an extension declares `pkg:npm/react`
- **AND** the request contains `pkg:pypi/react`
- **THEN** the extension SHALL NOT match

### Requirement: Local registry implements discover via scan

The local registry SHALL implement the discover endpoint by scanning all published extensions at query time. It SHALL read each extension's `index.json` to access `compatiblePackages` from the latest version's `VersionEntry`, then apply matching rules against the request's purls.

#### Scenario: Local registry scans extensions at query time

- **WHEN** a discover request is sent to the local registry
- **THEN** the registry SHALL enumerate all published extensions, read their latest version metadata, and match against the request

#### Scenario: No published extensions returns empty results

- **WHEN** the local registry has no published extensions
- **AND** a discover request is sent
- **THEN** `results` SHALL be an empty array
- **AND** `resolvedRecommendations` SHALL be an empty array
