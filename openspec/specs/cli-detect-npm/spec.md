## ADDED Requirements

### Requirement: Parse package.json for npm dependencies

The npm detector SHALL parse `package.json` in the project directory and extract direct dependencies from the `dependencies`, `devDependencies`, and `peerDependencies` objects. Each dependency SHALL be converted to a `pkg:npm` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from all sections

- **WHEN** `package.json` contains `dependencies: { "react": "^18.2.0" }`, `devDependencies: { "vitest": "^1.0.0" }`, `peerDependencies: { "react-dom": "^18.0.0" }`
- **THEN** the detector SHALL produce purls for `react`, `vitest`, and `react-dom`

#### Scenario: Missing package.json

- **WHEN** the project directory does not contain a `package.json` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed package.json

- **WHEN** `package.json` contains invalid JSON
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependency sections

- **WHEN** `package.json` exists but contains no `dependencies`, `devDependencies`, or `peerDependencies`
- **THEN** the detector SHALL return an empty array

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version (no range operators), the detector SHALL include the version in the purl. When a dependency specifies a semver range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `dependencies` contains `"react": "18.2.0"`
- **THEN** the detector SHALL produce `pkg:npm/react@18.2.0`

#### Scenario: Semver range

- **WHEN** `dependencies` contains `"react": "^18.2.0"`
- **THEN** the detector SHALL produce `pkg:npm/react` (versionless)

#### Scenario: Tilde range

- **WHEN** `dependencies` contains `"lodash": "~4.17.0"`
- **THEN** the detector SHALL produce `pkg:npm/lodash` (versionless)

#### Scenario: Star range

- **WHEN** `dependencies` contains `"lodash": "*"`
- **THEN** the detector SHALL produce `pkg:npm/lodash` (versionless)

### Requirement: Scoped npm packages use percent-encoded namespace

Scoped npm packages (e.g., `@angular/core`) SHALL be represented with the `@` percent-encoded as `%40` in the purl namespace, following the purl spec.

#### Scenario: Scoped package

- **WHEN** `dependencies` contains `"@angular/core": "^17.0.0"`
- **THEN** the detector SHALL produce a purl with `type: "npm"`, `namespace: "%40angular"`, `name: "core"`

#### Scenario: Deeply scoped package

- **WHEN** `dependencies` contains `"@babel/plugin-transform-runtime": "^7.0.0"`
- **THEN** the detector SHALL produce a purl with `type: "npm"`, `namespace: "%40babel"`, `name: "plugin-transform-runtime"`

### Requirement: npm aliases resolve to real package name

When a dependency uses the `npm:<real-package>@<version>` alias syntax, the detector SHALL produce a purl for the real package name, not the alias.

#### Scenario: Aliased dependency

- **WHEN** `dependencies` contains `"lodash-es": "npm:lodash@^4.17.0"`
- **THEN** the detector SHALL produce `pkg:npm/lodash` (the real package, not `lodash-es`)

### Requirement: Non-registry specifiers skipped

Dependencies using `file:`, `link:`, `workspace:`, `git+`, or URL-based specifiers SHALL be skipped. These represent local or non-registry sources that are not meaningful for package compatibility discovery.

#### Scenario: file: specifier skipped

- **WHEN** `dependencies` contains `"my-lib": "file:../my-lib"`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: workspace: specifier skipped

- **WHEN** `dependencies` contains `"my-lib": "workspace:*"`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: git specifier skipped

- **WHEN** `dependencies` contains `"my-lib": "git+https://github.com/org/my-lib.git"`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: URL specifier skipped

- **WHEN** `dependencies` contains `"my-lib": "https://example.com/my-lib-1.0.0.tgz"`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: link: specifier skipped

- **WHEN** `dependencies` contains `"my-lib": "link:../my-lib"`
- **THEN** the detector SHALL not produce a purl for `my-lib`

### Requirement: peerDependencies included

The detector SHALL include packages from `peerDependencies` because they express framework relationships relevant for discovering framework-specific extensions.

#### Scenario: Peer dependency detected

- **WHEN** `peerDependencies` contains `"react": ">=17.0.0"`
- **THEN** the detector SHALL produce `pkg:npm/react` (versionless, since it's a range)
