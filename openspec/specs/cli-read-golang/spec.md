## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Go modules

The Go reader SHALL inspect the Go module cache for an `axm.json` sidecar file alongside each detected Go module. For each detected golang package, the reader SHALL locate `$GOPATH/pkg/mod/<module>@<version>/axm.json` and extract the `recommendedExtensions` array when present and valid.

#### Scenario: Module with valid axm.json sidecar

- **WHEN** `$GOPATH/pkg/mod/github.com/gorilla/mux@v1.8.1/axm.json` contains `{ "recommendedExtensions": ["@gorilla/skills/mux@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@gorilla/skills/mux@^1.0.0"]`

#### Scenario: Module without axm.json sidecar

- **WHEN** `$GOPATH/pkg/mod/github.com/gin-gonic/gin@v1.9.1/axm.json` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Module with empty recommendedExtensions

- **WHEN** `$GOPATH/pkg/mod/github.com/some/lib@v0.5.0/axm.json` contains `{ "recommendedExtensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Reconstruct module path from PackageUrlParts

The reader SHALL reconstruct the Go module filesystem path from the `PackageUrlParts` namespace and name fields. The purl namespace provides the module path prefix and the name provides the final path segment.

#### Scenario: Module with namespace

- **WHEN** the detected package has `namespace: "github.com/gorilla"`, `name: "mux"`, `version: "v1.8.1"`
- **THEN** the reader SHALL look for `$GOPATH/pkg/mod/github.com/gorilla/mux@v1.8.1/axm.json`

#### Scenario: Module without namespace

- **WHEN** the detected package has `namespace: undefined`, `name: "golang.org/x/net"`, `version: "v0.17.0"`
- **THEN** the reader SHALL look for `$GOPATH/pkg/mod/golang.org/x/net@v0.17.0/axm.json`

### Requirement: Handle GOPATH environment variable

The reader SHALL use the `$GOPATH` environment variable to locate the module cache. When `$GOPATH` is not set, the reader SHALL default to `~/go`.

#### Scenario: GOPATH is set

- **WHEN** `$GOPATH` is set to `/custom/gopath`
- **THEN** the reader SHALL look for modules under `/custom/gopath/pkg/mod/`

#### Scenario: GOPATH is not set

- **WHEN** `$GOPATH` is not set
- **THEN** the reader SHALL look for modules under `~/go/pkg/mod/`

### Requirement: Missing module cache handled gracefully

When the module cache directory or the specific module version directory does not exist, the reader SHALL return no recommendations without raising an error. This is the normal case for modules not yet downloaded.

#### Scenario: Module cache does not exist

- **WHEN** the `$GOPATH/pkg/mod/` directory does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Module version directory does not exist

- **WHEN** the module cache exists but the specific module version directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Validate axm.json against AxmPackageMeta schema

The reader SHALL validate `axm.json` contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `$GOPATH/pkg/mod/github.com/some/lib@v1.0.0/axm.json` contains `{ "recommendedExtensions": 42 }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `axm.json` contains `{ "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: No Go toolchain dependency

The reader SHALL read `axm.json` directly via filesystem operations. The reader SHALL NOT require the Go toolchain to be installed or available on PATH.

#### Scenario: Reader operates without Go toolchain

- **WHEN** the `go` binary is not installed or not on PATH
- **THEN** the reader SHALL still be able to inspect the module cache and read axm.json files
