## ADDED Requirements

### Requirement: Parse go.mod for Go module dependencies

The Go detector SHALL parse `go.mod` in the project directory and extract direct dependencies from `require` directives as `pkg:golang` purls. Dependencies marked with `// indirect` comments SHALL be filtered out; only direct dependencies are included.

#### Scenario: Direct dependencies extracted

- **WHEN** `go.mod` contains `require ( github.com/gin-gonic/gin v1.9.1 golang.org/x/sync v0.3.0 )`
- **THEN** the detector SHALL produce purls for `github.com/gin-gonic/gin` and `golang.org/x/sync`

#### Scenario: Indirect dependencies filtered

- **WHEN** `go.mod` contains `require ( github.com/gin-gonic/gin v1.9.1 golang.org/x/text v0.14.0 // indirect )`
- **THEN** the detector SHALL produce a purl only for `github.com/gin-gonic/gin`
- **AND** `golang.org/x/text` SHALL be excluded

#### Scenario: Single-line require directive

- **WHEN** `go.mod` contains `require github.com/stretchr/testify v1.8.4`
- **THEN** the detector SHALL produce a purl for `github.com/stretchr/testify`

#### Scenario: Missing go.mod

- **WHEN** the project directory does not contain a `go.mod` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed go.mod

- **WHEN** `go.mod` contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

### Requirement: Go module path to purl namespace and name mapping

The detector SHALL split Go module paths into purl `namespace` and `name` components. The namespace is the path prefix up to the last segment, and the name is the final segment. The namespace SHALL be lowercased. Major version path suffixes (`/v2`, `/v3`, etc.) SHALL be excluded from the namespace and name.

#### Scenario: Standard module path

- **WHEN** the module path is `github.com/gin-gonic/gin`
- **THEN** the detector SHALL produce a purl with `type: "golang"`, `namespace: "github.com/gin-gonic"`, `name: "gin"`

#### Scenario: v2+ major version suffix removed

- **WHEN** the module path is `github.com/foo/bar/v2`
- **THEN** the detector SHALL produce a purl with `type: "golang"`, `namespace: "github.com/foo"`, `name: "bar"`

#### Scenario: v3+ major version suffix removed

- **WHEN** the module path is `github.com/example/lib/v3`
- **THEN** the detector SHALL produce a purl with `type: "golang"`, `namespace: "github.com/example"`, `name: "lib"`

#### Scenario: Standard library style path

- **WHEN** the module path is `golang.org/x/sync`
- **THEN** the detector SHALL produce a purl with `type: "golang"`, `namespace: "golang.org/x"`, `name: "sync"`

#### Scenario: Namespace lowercased

- **WHEN** the module path is `GitHub.com/Foo/Bar`
- **THEN** the detector SHALL produce a purl with `namespace: "github.com/foo"`, `name: "bar"`

### Requirement: Exact versions from require directives

The detector SHALL use the exact version string from `require` directives (e.g., `v1.28.0`) as the purl version.

#### Scenario: Exact version included

- **WHEN** `go.mod` contains `require github.com/gin-gonic/gin v1.9.1`
- **THEN** the detector SHALL produce `pkg:golang/github.com/gin-gonic/gin@v1.9.1`

#### Scenario: Pseudo-version included

- **WHEN** `go.mod` contains `require golang.org/x/exp v0.0.0-20231006140011-7918f672742d`
- **THEN** the detector SHALL produce `pkg:golang/golang.org/x/exp@v0.0.0-20231006140011-7918f672742d`
