# Change: Add extensions init subcommand

## Why

Users need a way to initialize their workspace for extension management before
installing or configuring extensions. This is the foundational command that
enables all other extension management capabilities.

## What Changes

- Add `axm extensions init [path]` subcommand to initialize workspace
- Create `.axm/settings.json` with `publisher` and `targets` configuration
- Support `--publisher` option to set default publisher
- Support `-y, --yes` flag to skip interactive prompts
- Provide idempotent initialization (safe to run multiple times)

## Impact

- Affected specs: `cli`
- Affected code: `packages/cli/src/commands/extensions/`
