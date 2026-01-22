# Change: Add CLI Capability Specification

## Why

The CLI package (`@agentxm/cli`) needs a formal specification to define its expected behavior. The startup message exists but lacks a formal spec and proper test coverage.

## What Changes

- Add new `cli` capability specification
- Define startup message requirement: "AgentXM CLI ready" displayed when CLI runs

## Impact

- Affected specs: New `cli` capability
- Affected code: `packages/cli`
