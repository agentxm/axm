# install-homebrew Specification

## Purpose

Define the Homebrew installation path for axm using a tap-backed formula that installs prebuilt binaries.

## ADDED Requirements

### Requirement: Homebrew formula installs standalone binary via tap

axm SHALL be installable via Homebrew using the `agentxm/homebrew-tap` repo (tap name `axm-sh/tap`). The formula SHALL download the prebuilt standalone binary for the user's platform from `github.com/agentxm/axm` GitHub Releases. It SHALL NOT depend on Node.js.

#### Scenario: Install via tap shorthand

- **WHEN** a user runs `brew install axm-sh/tap/axm`
- **THEN** Homebrew SHALL download the correct binary for the user's platform/architecture and make `axm` available on PATH

#### Scenario: Install via explicit tap then install

- **WHEN** a user runs `brew tap axm-sh/tap` followed by `brew install axm`
- **THEN** the result SHALL be identical to the shorthand install

#### Scenario: No Node.js required

- **WHEN** a user installs axm via Homebrew on a system without Node.js
- **THEN** the installation SHALL succeed and `axm` SHALL be functional

### Requirement: Homebrew formula includes test block

The formula SHALL include a `test` block that verifies the installation by running `axm --version`.

#### Scenario: brew test passes

- **WHEN** a user runs `brew test axm`
- **THEN** the test SHALL execute `axm --version` and pass if it exits with code 0

### Requirement: Homebrew formula specifies correct metadata

The formula SHALL include accurate metadata: name, description, homepage (`https://axm.sh`), and license.

#### Scenario: Formula metadata is present

- **WHEN** the formula is inspected via `brew info axm`
- **THEN** it SHALL display the package name, description, homepage URL, and license

### Requirement: Homebrew formula supports both Intel and Apple Silicon

The formula SHALL provide the correct binary for both x64 (Intel) and arm64 (Apple Silicon) macOS, as well as x64 and arm64 Linux.

#### Scenario: Apple Silicon Mac install

- **WHEN** a user installs on an arm64 macOS system
- **THEN** the formula SHALL download `axm-darwin-arm64`

#### Scenario: Intel Mac install

- **WHEN** a user installs on an x64 macOS system
- **THEN** the formula SHALL download `axm-darwin-x64`

#### Scenario: Linux install

- **WHEN** a user installs on a Linux system
- **THEN** the formula SHALL download the appropriate `axm-linux-{arch}` binary

### Requirement: Homebrew upgrade works

The formula SHALL support `brew upgrade axm` to update to the latest version.

#### Scenario: Upgrade to new version

- **WHEN** a new version of axm is released and the formula is updated
- **THEN** `brew upgrade axm` SHALL install the new version

### Requirement: Homebrew uninstall cleans up

The formula SHALL support `brew uninstall axm` to remove the axm CLI.

#### Scenario: Uninstall removes axm

- **WHEN** a user runs `brew uninstall axm`
- **THEN** the `axm` command SHALL no longer be available on PATH
