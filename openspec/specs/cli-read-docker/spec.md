## ADDED Requirements

### Requirement: Read axm recommendation metadata from OCI image annotations

The Docker reader SHALL inspect local Docker image metadata for `axm`-prefixed OCI annotations containing recommendation metadata. The reader SHALL look for the `sh.axm.recommended-extensions` annotation on pulled images. This provides partial coverage: annotations are available on pulled images, while `axm.json` in build context is only available during build. When present and valid, the reader SHALL extract the extension refs. Ecosystem precedent includes Sigstore and SLSA annotations on OCI images.

#### Scenario: Image with valid axm annotation

- **WHEN** the local Docker image `nginx:latest` has annotation `sh.axm.recommended-extensions` containing `[{ "ref": "@nginx/skills/nginx", "versionRange": "^1.0.0" }]`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@nginx/skills/nginx", "versionRange": "^1.0.0" }]`

#### Scenario: Image without axm annotations

- **WHEN** the local Docker image `postgres:16` has no `sh.axm.recommended-extensions` annotation
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Image with empty recommended-extensions annotation

- **WHEN** the local Docker image has annotation `sh.axm.recommended-extensions` containing `[]`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the extracted annotation contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed annotation warned and skipped

- **WHEN** the annotation `sh.axm.recommended-extensions` contains `"not-valid-json"`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra annotation fields tolerated

- **WHEN** the image has annotation `sh.axm.recommended-extensions` with valid refs and additional `sh.axm.future-field` annotation
- **THEN** the reader SHALL extract recommended extensions and ignore unknown annotations

### Requirement: Docker CLI availability handled gracefully

When the Docker or container CLI is not available on the system, the reader SHALL return no recommendations with a warning. The reader MUST NOT require Docker to be installed as a hard dependency.

#### Scenario: Docker CLI not available

- **WHEN** no Docker-compatible CLI (docker, podman) is found on the system PATH
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** the reader SHALL log a warning indicating Docker CLI is not available

#### Scenario: Docker daemon not running

- **WHEN** the Docker CLI is available but the daemon is not running
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no fatal error SHALL be raised

### Requirement: Missing image handled gracefully

When the specified image is not available locally, the reader SHALL return no recommendations without raising an error. The reader SHALL NOT pull images.

#### Scenario: Image not present locally

- **WHEN** the specified image has not been pulled locally
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised
