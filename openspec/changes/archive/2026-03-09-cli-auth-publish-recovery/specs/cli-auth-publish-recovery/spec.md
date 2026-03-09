# cli-auth-publish-recovery Specification

## Purpose

Publish-time auth guard that detects unauthenticated state, triggers login flow, and retries the publish operation.

## ADDED Requirements

### Requirement: Pre-publish auth check

Before attempting a publish operation, the CLI SHALL verify that the user is authenticated.

#### Scenario: Authenticated user publishes normally

- **WHEN** the user runs a publish command and a valid token is resolvable
- **THEN** the publish operation SHALL proceed without interruption

#### Scenario: Unauthenticated user with TTY

- **WHEN** the user runs a publish command and no token is resolvable
- **AND** the terminal is interactive (TTY available)
- **THEN** the CLI SHALL prompt: "You need to sign in to publish. Sign in now?"

#### Scenario: Unauthenticated user accepts login

- **WHEN** the user accepts the login prompt
- **THEN** the CLI SHALL run the device code login flow inline
- **AND** on login success, retry the publish operation once

#### Scenario: Unauthenticated user declines login

- **WHEN** the user declines the login prompt
- **THEN** the CLI SHALL fail with `CliError` code `AUTH_LOGIN_REQUIRED`
- **AND** `howToFix` SHALL read "Run `axm login` to sign in."

#### Scenario: Unauthenticated user non-interactive

- **WHEN** the user runs a publish command in non-interactive mode and no token is resolvable
- **THEN** the CLI SHALL fail with `CliError` code `AUTH_LOGIN_REQUIRED`
- **AND** `howToFix` SHALL read "Set the AXM_TOKEN environment variable or run `axm login` in an interactive terminal."

### Requirement: Post-publish auth error recovery

When a publish attempt fails with a 401 or 403, the CLI SHALL provide actionable recovery guidance.

#### Scenario: 401 after refresh exhaustion

- **WHEN** a publish request returns 401 and the auth middleware's refresh cycle has been exhausted
- **THEN** the CLI SHALL fail with `CliError` code `AUTH_UNAUTHENTICATED`
- **AND** `howToFix` SHALL read "Session expired. Run `axm login` to re-authenticate."

#### Scenario: 403 insufficient permissions

- **WHEN** a publish request returns 403
- **THEN** the CLI SHALL fail with `CliError` code `AUTH_UNAUTHORIZED`
- **AND** `details` SHALL include the server's `required_scope` and `required_role` if provided
- **AND** `howToFix` SHALL describe the missing permission

### Requirement: --yes flag auto-accepts login prompt

The `--yes` flag SHALL auto-accept the publish-time login prompt.

#### Scenario: Publish with --yes triggers auto-login

- **WHEN** the user runs a publish command with `--yes` and no token is resolvable
- **AND** TTY is available
- **THEN** the CLI SHALL proceed directly to the login flow without prompting

#### Scenario: Publish with --non-interactive skips login

- **WHEN** the user runs a publish command with `--non-interactive` and no token is resolvable
- **THEN** the CLI SHALL NOT attempt interactive login
- **AND** SHALL fail with `AUTH_LOGIN_REQUIRED`

### Requirement: Reusable auth guard combinator

The publish-time auth check SHALL be implemented as a reusable `withAuthGuard` combinator applicable to any Effect requiring authentication.

#### Scenario: Guard wraps publish effect

- **WHEN** `withAuthGuard(publishEffect)` is applied
- **THEN** the guard SHALL check auth state before executing the inner effect
- **AND** handle login-and-retry if unauthenticated

#### Scenario: Guard passes through on success

- **WHEN** the inner effect succeeds on the first attempt (user already authenticated)
- **THEN** the guard SHALL return the result without any additional prompts or retries
