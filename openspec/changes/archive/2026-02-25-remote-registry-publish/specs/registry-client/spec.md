## MODIFIED Requirements

### Requirement: RemoteRegistryClient stub

The system SHALL implement `RemoteRegistryClient` with a real `publishExtension` method that sends HTTPS requests to the remote registry API. All other operations (`getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, `extensionExists`) SHALL fail with a descriptive "remote registry not yet supported" error.

#### Scenario: publishExtension sends HTTPS request

- **WHEN** `publishExtension` is called on a `RemoteRegistryClient`
- **THEN** it sends a multipart PUT request to the remote registry API
- **AND** returns `{ published: true }` on success

#### Scenario: Read operations remain unsupported

- **WHEN** `getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, or `extensionExists` is called on `RemoteRegistryClient`
- **THEN** it fails with `AppError` containing "remote registry not yet supported"

### Requirement: RegistryClient factory

A factory function `createRegistryClient` SHALL create the appropriate registry client based on location scheme. The factory SHALL pass the base URL and an `HttpClient` instance to the remote client constructor.

#### Scenario: Local path creates LocalRegistryClient

- **WHEN** the location is `/path/to/registry` or `file:///path/to/registry`
- **THEN** a `LocalRegistryClient` is created

#### Scenario: HTTPS URL creates RemoteRegistryClient

- **WHEN** the location is `https://registry.example.com`
- **THEN** a `RemoteRegistryClient` is created with the base URL and an `HttpClient` instance
