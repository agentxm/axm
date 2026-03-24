## MODIFIED Requirements

### Requirement: RemoteRegistryClient stub

The system SHALL implement `RemoteRegistryClient` with a real `publishExtension` method and concrete read operations against the remote registry API.

Supported operations:

- `publishExtension` SHALL send HTTPS requests to publish extension archives.
- `getExtensionsByScope` SHALL support both name-targeted discovery and namespace list-mode discovery (`names: []`).
- `getExtensionPackage` SHALL fetch extension archives via remote index + archive endpoints.
- `namespaceExists` SHALL perform namespace existence checks via remote namespace listing endpoint semantics.
- `extensionExists` SHALL perform extension existence checks via remote HEAD endpoint.

#### Scenario: publishExtension sends HTTPS request

- **WHEN** `publishExtension` is called on a `RemoteRegistryClient`
- **THEN** it sends a multipart PUT request to the remote registry API
- **AND** returns `{ published: true }` on success

#### Scenario: getExtensionsByScope supports names list mode

- **WHEN** `getExtensionsByScope` is called with an empty `names` list
- **THEN** the client SHALL discover extensions from namespace list endpoints
- **AND** it SHALL return matching `RegistryExtensionManifest` entries instead of failing with a not-implemented error

#### Scenario: getExtensionPackage fetches remote archive

- **WHEN** `getExtensionPackage` is called on a `RemoteRegistryClient`
- **THEN** it SHALL resolve a version from remote index data
- **AND** it SHALL fetch and return archive bytes for the resolved version

#### Scenario: namespaceExists checks remote namespace

- **WHEN** `namespaceExists` is called on a `RemoteRegistryClient`
- **THEN** it SHALL call the remote namespace listing endpoint
- **AND** return `{ exists: boolean }` based on endpoint response semantics

#### Scenario: extensionExists checks remote extension

- **WHEN** `extensionExists` is called on a `RemoteRegistryClient`
- **THEN** it SHALL call the remote extension HEAD endpoint
- **AND** return `{ exists: true }` for `200` and `{ exists: false }` for `404`

#### Scenario: Read operations map remote failures to AppError

- **WHEN** `getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, or `extensionExists` encounters network, schema, or non-success HTTP failure
- **THEN** the operation SHALL fail with a descriptive `AppError` that includes request context in `details`
