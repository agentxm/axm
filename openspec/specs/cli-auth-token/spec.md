# cli-auth-token Specification

## Purpose

Output current resolved token to stdout for piping and scripting.

## Requirements

### Requirement: Token output

The `axm token` command SHALL output the current resolved token to stdout with no additional formatting.

#### Scenario: Token available

- **WHEN** the user runs `axm token` and a token is resolvable
- **THEN** the CLI SHALL write the raw token string to stdout
- **AND** no other output SHALL be written to stdout (no newline decoration, no prefix)
- **AND** a trailing newline SHALL be appended for shell compatibility

#### Scenario: Token from env var

- **WHEN** the user runs `axm token` and `AXM_TOKEN` is set
- **THEN** the CLI SHALL output the `AXM_TOKEN` value
- **AND** print "Authenticating via AXM_TOKEN environment variable" to stderr

#### Scenario: Token from credential store

- **WHEN** the user runs `axm token` and credentials exist in the store
- **THEN** the CLI SHALL output the stored access token
- **AND** if the token is expired, the CLI SHALL attempt refresh before outputting

#### Scenario: No token available

- **WHEN** the user runs `axm token` and no token is resolvable from any source
- **THEN** the CLI SHALL fail with `CliError` code `AUTH_LOGIN_REQUIRED`
- **AND** `howToFix` SHALL read "Run `axm login` to sign in, or set the AXM_TOKEN environment variable."

### Requirement: Token command is non-interactive

The `axm token` command SHALL never prompt for input.

#### Scenario: No interactive login fallback

- **WHEN** `axm token` is run and no token exists
- **THEN** the CLI SHALL NOT prompt for login
- **AND** SHALL fail with `AUTH_LOGIN_REQUIRED`
