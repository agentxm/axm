# cli Specification

## Purpose

The CLI provides the primary user interface for the axm tool.

## MODIFIED Requirements

### Requirement: Command group naming

The AUTHENTICATION command group SHALL be renamed to AUTH AND CONFIG.

#### Scenario: Auth and config group in help

- **WHEN** the user runs `axm --help`
- **THEN** the output SHALL show auth commands and `upgrade` under an "AUTH AND CONFIG" group heading
- **AND** there SHALL NOT be an "AUTHENTICATION" group heading
