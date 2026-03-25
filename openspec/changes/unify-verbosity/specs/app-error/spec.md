## MODIFIED Requirements

### Requirement: Runtime error channel constraint

The runtime `run` function SHALL constrain its error channel to `AppError | PromptCancelled`. The `run` function SHALL NOT accept arbitrary error types. Any effect passed to `run` with unmapped errors SHALL produce a TypeScript compilation error.

#### Scenario: Effect with AppError passes type check

- **WHEN** a handler returns `Effect<void, AppError | PromptCancelled, R>`
- **THEN** the effect SHALL be accepted by `run` without type errors

#### Scenario: Effect with unmapped domain error fails type check

- **WHEN** a handler returns an effect with a domain error type not assignable to `AppError | PromptCancelled`
- **THEN** TypeScript SHALL produce a compilation error

#### Scenario: Error rendering reads verbosity from global flag settings

- **WHEN** an `AppError` is caught by the CLI error handler
- **THEN** the error handler SHALL read `verboseFlag` and `debugFlag` from the Effect CLI global flag settings in the fiber context
- **AND** SHALL pass them to `renderAppError` to control output detail level

## REMOVED Requirements

### Requirement: classifyError uses typed pattern matching

**Reason**: `classifyError` duplicates logic already in `withCliErrorHandling` and is only used in tests. Error classification (pattern matching on `_tag`, rendering with verbosity, returning exit code) is handled directly by `withCliErrorHandling`.

**Migration**: Tests that verified `classifyError` behavior are covered by `withCliErrorHandling` tests. Delete `classifyError` and its tests.
