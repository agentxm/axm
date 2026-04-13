# install-agent-doc Specification

## Purpose

Define the machine-readable install documentation served to agents at `axm.sh/install.md`.

## ADDED Requirements

### Requirement: Agent install doc documents all non-agent installation pathways

The `INSTALL.md` document (served at `axm.sh/install.md`) SHALL document all installation pathways except the agent pathway itself. It SHALL cover native install scripts (bash, PowerShell, CMD), Homebrew, and npx.

#### Scenario: All pathways documented

- **WHEN** the agent install doc is read
- **THEN** it SHALL contain sections for: native install scripts (bash, PowerShell, CMD), Homebrew, and npx

### Requirement: Agent install doc recommends npx as the default for agents

The document SHALL recommend `npx axm.sh` as the primary installation method, since agents typically run in Node.js environments.

#### Scenario: npx recommended first

- **WHEN** the agent install doc is read
- **THEN** the first installation option presented SHALL be `npx axm.sh` with a note that it requires Node.js

#### Scenario: Alternatives documented

- **WHEN** the agent install doc is read
- **THEN** install script and Homebrew pathways SHALL be documented as alternatives for environments without Node.js

### Requirement: Agent install doc retains TODO-checklist format

The document SHALL use the TODO-checklist format (`- [ ]` items) for agents to parse and execute step-by-step. The checklist SHALL cover install, authenticate, and verify steps.

#### Scenario: Checklist structure

- **WHEN** the agent install doc is read
- **THEN** it SHALL contain a TODO checklist with items for: install axm, authenticate, and verify

#### Scenario: Done-when criteria

- **WHEN** the agent install doc is read
- **THEN** it SHALL include a clear "DONE WHEN" statement (e.g., `axm --version && axm whoami` both succeed)

### Requirement: Agent install doc includes authentication instructions

The document SHALL include both interactive (`axm auth login`) and non-interactive (`AXM_TOKEN` env var) authentication methods.

#### Scenario: Interactive auth

- **WHEN** the authentication section is read
- **THEN** it SHALL include `axm auth login` with a description of the OAuth browser flow

#### Scenario: Non-interactive auth

- **WHEN** the authentication section is read
- **THEN** it SHALL include `export AXM_TOKEN=<your-token>` and describe how to obtain a token via `axm auth token`

### Requirement: Agent install doc includes troubleshooting

The document SHALL include troubleshooting guidance for common failures.

#### Scenario: Troubleshooting section present

- **WHEN** the troubleshooting section is read
- **THEN** it SHALL include guidance for `axm: command not found`, authentication errors, and registry connectivity issues
