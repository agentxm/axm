## ADDED Requirements

### Requirement: Parse deno.json for JSR dependencies

The JSR detector SHALL parse `deno.json` and `deno.jsonc` (JSON with comments) in the project directory and extract `jsr:@scope/name` imports from the `imports` map. Each JSR dependency SHALL be converted to a native `pkg:jsr` purl. npm-prefixed imports (`npm:`) SHALL be skipped as they are covered by `cli-detect-npm`.

#### Scenario: JSR imports extracted from deno.json

- **WHEN** `deno.json` contains `"imports": { "@std/fs": "jsr:@std/fs@^1.0.0", "@std/path": "jsr:@std/path@1.0.0" }`
- **THEN** the detector SHALL produce purls for `@std/fs` and `@std/path`

#### Scenario: npm imports skipped

- **WHEN** `deno.json` contains `"imports": { "lodash": "npm:lodash@^4.17.0", "@std/fs": "jsr:@std/fs@^1.0.0" }`
- **THEN** the detector SHALL produce a purl only for `@std/fs`
- **AND** `lodash` SHALL be skipped (covered by cli-detect-npm)

#### Scenario: Missing deno.json and deno.jsonc

- **WHEN** the project directory contains neither `deno.json` nor `deno.jsonc`
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed deno.json

- **WHEN** `deno.json` contains invalid JSON
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No imports map

- **WHEN** `deno.json` exists but contains no `imports` field
- **THEN** the detector SHALL return an empty array

#### Scenario: deno.jsonc with comments

- **WHEN** `deno.jsonc` contains JSON with comments and valid JSR imports
- **THEN** the detector SHALL parse the file and extract JSR imports

### Requirement: Exact versions produce versioned purls

When a JSR import specifies an exact version, the detector SHALL include the version in the purl. When a JSR import specifies a semver range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `imports` contains `"@std/path": "jsr:@std/path@1.0.0"`
- **THEN** the detector SHALL produce `pkg:jsr/%40std/path@1.0.0`

#### Scenario: Semver range

- **WHEN** `imports` contains `"@std/fs": "jsr:@std/fs@^1.0.0"`
- **THEN** the detector SHALL produce `pkg:jsr/%40std/fs` (versionless)

### Requirement: Scoped JSR packages use percent-encoded namespace

JSR packages use `@scope/name` format. The detector SHALL represent the scope with the `@` percent-encoded as `%40` in the purl namespace, following the purl spec.

#### Scenario: Scoped JSR package

- **WHEN** `imports` contains `"@std/fs": "jsr:@std/fs@^1.0.0"`
- **THEN** the detector SHALL produce a purl with `type: "jsr"`, `namespace: "%40std"`, `name: "fs"`
