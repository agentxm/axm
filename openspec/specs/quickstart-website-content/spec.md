# quickstart-website-content Specification

## Purpose

Define the quickstart markdown content consumed by the website for installation, authentication, verification, and troubleshooting guidance.

## ADDED Requirements

### Requirement: Quickstart markdown covers all installation pathways

The quickstart markdown document SHALL present four installation pathways: Agent, Native Install (bash/PowerShell/CMD), Homebrew, and npx. Each pathway SHALL include complete instructions from zero to a verified installation. This is content only - a separate website repo consumes it for rendering on axm.sh.

#### Scenario: All pathways present in document

- **WHEN** the quickstart markdown is read
- **THEN** it SHALL contain sections for all four installation pathways with clear labels and platform indicators

#### Scenario: Each pathway includes verification steps

- **WHEN** a user follows any installation pathway to completion
- **THEN** the instructions SHALL end with verification commands: `axm --version` and `axm auth login`

### Requirement: Agent pathway links to install.md

The quickstart markdown SHALL include an "Agent" pathway that directs AI agents to `axm.sh/install.md` - a machine-readable markdown document with step-by-step install and auth instructions.

#### Scenario: Agent pathway content

- **WHEN** the Agent pathway section is read
- **THEN** it SHALL show the URL `axm.sh/install.md` and describe it as the recommended method for AI coding agents to install axm autonomously

### Requirement: Native Install pathway shows platform-specific one-liners

The quickstart markdown SHALL display native install commands for bash, PowerShell, and Windows CMD. These install standalone binaries with no Node.js dependency.

#### Scenario: Bash one-liner documented

- **WHEN** the Native Install section is read
- **THEN** it SHALL include `curl -fsSL https://axm.sh/install.sh | sh`

#### Scenario: PowerShell one-liner documented

- **WHEN** the Native Install section is read
- **THEN** it SHALL include `irm https://axm.sh/install.ps1 | iex`

#### Scenario: Windows CMD instructions documented

- **WHEN** the Native Install section is read
- **THEN** it SHALL include instructions to download and run `axm.sh/install.cmd`

### Requirement: Homebrew pathway shows tap and install command

The quickstart markdown SHALL document Homebrew installation using the `agentxm/homebrew-tap` tap. No Node.js dependency.

#### Scenario: Homebrew command documented

- **WHEN** the Homebrew section is read
- **THEN** it SHALL include `brew install axm-sh/tap/axm`

### Requirement: npx pathway for Node.js users

The quickstart markdown SHALL include an npx pathway for users who already have Node.js and want to use axm without installing it globally.

#### Scenario: npx command documented

- **WHEN** the npx section is read
- **THEN** it SHALL include `npx axm.sh` and note that it requires Node.js

### Requirement: Authentication section covers interactive and non-interactive methods

The quickstart markdown SHALL include a post-install authentication section that covers both interactive and non-interactive methods.

#### Scenario: Interactive auth instructions

- **WHEN** the authentication section is read
- **THEN** it SHALL include `axm auth login` with a description of the OAuth browser flow

#### Scenario: Non-interactive auth instructions

- **WHEN** the authentication section is read
- **THEN** it SHALL include `export AXM_TOKEN=<your-token>` and describe how to obtain a token

### Requirement: Troubleshooting section covers common failures

The quickstart markdown SHALL include a troubleshooting section covering common installation failures.

#### Scenario: PATH not found troubleshooting

- **WHEN** the troubleshooting section is read
- **THEN** it SHALL include guidance for resolving `axm: command not found` errors on each platform

#### Scenario: Auth troubleshooting

- **WHEN** the troubleshooting section is read
- **THEN** it SHALL include guidance for resolving authentication errors
