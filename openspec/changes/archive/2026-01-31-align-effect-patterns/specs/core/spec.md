## MODIFIED Requirements

### Requirement: Effect Integration

The core package SHALL use Effect for domain logic and expose Effect-based APIs.
Error types SHALL extend `Data.TaggedError` with a `retryable` field to enable
retry policy composition.

#### Scenario: Effect dependency

- **WHEN** the core package is built
- **THEN** Effect is available as a dependency for defining services and effects

#### Scenario: Error type structure

- **WHEN** an error type is defined
- **THEN** it SHALL extend `Data.TaggedError`
- **AND** it SHALL include a `retryable: boolean` field

#### Scenario: Network operation resilience

- **WHEN** a function performs network I/O
- **THEN** it SHALL use `Effect.retry()` with exponential backoff for transient errors
- **AND** the retry policy SHALL check `error.retryable === true`

#### Scenario: Concurrent operations

- **WHEN** multiple independent operations can run in parallel
- **THEN** they SHALL use `Effect.all()` with `{ concurrency: "unbounded" }`
