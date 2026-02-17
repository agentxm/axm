## MODIFIED Requirements

### Requirement: Checksum computation

The system SHALL compute a SHA-512 integrity value of the archive bytes in SRI format.

#### Scenario: Integrity format

- **WHEN** an integrity value is computed for an archive
- **THEN** it is formatted as `sha512-<base64>` (SRI format)

### Requirement: Publish idempotency

The system SHALL handle republishing the same version gracefully.

#### Scenario: Same version and integrity

- **WHEN** publishing version `1.0.0` and `1.0.0.zip` already exists with the same integrity
- **THEN** the operation is a no-op (no error)

#### Scenario: Same version, different integrity

- **WHEN** publishing version `1.0.0` and `1.0.0.zip` already exists with a different integrity
- **THEN** the operation fails with an error (no overwrites without `--force`)

## RENAMED Requirements

### Requirement: Checksum computation

FROM: Checksum computation
TO: Integrity computation
