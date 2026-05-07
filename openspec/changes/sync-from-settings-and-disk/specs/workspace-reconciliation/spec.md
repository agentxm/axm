## ADDED Requirements

### Requirement: Sync materialization set derived from settings and on-disk extensions

`axm sync` SHALL derive the set of extensions to materialize from `settings.json` plus the on-disk extension layout under `.axm/extensions/<owner>/<kind>/<name>/`. The lockfile (`.axm/axm-lock.yaml`) SHALL NOT be read by sync.

For each kind (skills, commands, mcp-servers, subagents, packs), sync SHALL enumerate the entries from settings, expand pack entries by reading the on-disk pack manifest, and read canonical content (manifest plus source files) from `.axm/extensions/<owner>/<kind>/<name>/` for each resolved extension.

#### Scenario: Sync materializes extensions listed in settings

- **WHEN** `settings.json` lists subagent `joke-teller` with `enabled: true`
- **AND** `.axm/extensions/@craigsmitham/subagents/joke-teller/` contains a valid manifest and source file
- **AND** `axm sync` runs
- **THEN** sync SHALL render `joke-teller` for each agent in `settings.agents`
- **AND** sync SHALL NOT read `.axm/axm-lock.yaml` to determine the materialization set

#### Scenario: Sync ignores stale lockfile source references

- **WHEN** `.axm/axm-lock.yaml` contains an entry with a `sourceName` that is not configured in settings
- **AND** `axm sync` runs
- **THEN** sync SHALL succeed without raising `LOCK_ENTRY_SOURCE_NOT_CONFIGURED` or any other source-resolution error
- **AND** sync SHALL render the corresponding extension when it is enabled in settings and present on disk

#### Scenario: Pack-implied extensions expanded from on-disk pack manifest

- **WHEN** `settings.json` lists a pack `@agentxm/packs/starter`
- **AND** `.axm/extensions/@agentxm/packs/starter/pack.json` declares constituent skills, commands, subagents, and mcp-servers
- **AND** the constituent extensions are present under `.axm/extensions/`
- **AND** `axm sync` runs
- **THEN** sync SHALL materialize each constituent extension as if it were a direct settings entry, subject to the same enabled/disabled and target-agent rules

#### Scenario: Settings entry with no on-disk content is skipped

- **WHEN** `settings.json` lists subagent `code-reviewer` with `enabled: true`
- **AND** `.axm/extensions/<owner>/subagents/code-reviewer/` does not exist
- **AND** `axm sync` runs
- **THEN** sync SHALL skip `code-reviewer` silently (no error, no rendered files)
- **AND** drift SHALL be surfaced separately by the lint rule defined below

### Requirement: Settings-only targeting of rendered agents

The set of agents an extension is rendered to SHALL be `settings.agents` (the workspace-level array of agent IDs). Manifests SHALL NOT carry an `agents` field; the renderer SHALL NOT read any `agents` field that may still be present in older manifests.

#### Scenario: Rendering targets all configured agents in settings

- **WHEN** `settings.agents` is `["claude-code", "cursor"]`
- **AND** subagent `joke-teller` is enabled in settings
- **AND** `axm sync` runs
- **THEN** sync SHALL render `joke-teller` for `claude-code` and `cursor`
- **AND** sync SHALL NOT render for any agent not in `settings.agents`

#### Scenario: Manifest agents field ignored

- **WHEN** `subagent.json` for `joke-teller` contains a residual `agents: ["claude-code"]` field from before the field was removed
- **AND** `settings.agents` is `["claude-code", "cursor"]`
- **THEN** sync SHALL render `joke-teller` for both `claude-code` and `cursor`
- **AND** the manifest's `agents` field SHALL NOT influence the render target set

### Requirement: Lint detects settings entries missing from `.axm/extensions/`

`axm lint` SHALL report a finding when an extension is listed in `settings.json` (directly or via a pack) but the corresponding directory `.axm/extensions/<owner>/<kind>/<name>/` is missing or has no manifest. The advisory SHALL suggest `axm install <name>` (or `axm sync` against a populated registry) as the remediation action.

#### Scenario: Configured subagent missing from disk reported by lint

- **WHEN** `settings.json` lists subagent `code-reviewer`
- **AND** `.axm/extensions/<owner>/subagents/code-reviewer/` does not exist
- **AND** `axm lint` runs
- **THEN** lint SHALL report a finding identifying `code-reviewer` as configured-but-not-installed
- **AND** the advisory message SHALL suggest running `axm install code-reviewer`

#### Scenario: Configured pack missing from disk reported by lint

- **WHEN** `settings.json` lists a pack `@agentxm/packs/starter`
- **AND** `.axm/extensions/@agentxm/packs/starter/` does not exist
- **AND** `axm lint` runs
- **THEN** lint SHALL report a finding for the missing pack
- **AND** the advisory message SHALL suggest installing the pack

## MODIFIED Requirements

### Requirement: Reconciliation engine supports subagent render-on-install

`axm sync` SHALL reconcile subagents across all configured agents using render-on-install. Subagent reconciliation reads the canonical `<name>.md` from the on-disk extension directory and renders agent-native files for each agent in `settings.agents`. Sync SHALL NOT read or write the lockfile during reconciliation.

#### Scenario: Full reconciliation flow

- **WHEN** `axm sync` is run
- **AND** `code-reviewer` is in settings with `enabled: true`
- **AND** `.axm/extensions/<owner>/subagents/code-reviewer/src/code-reviewer.md` exists
- **THEN** the sync engine SHALL read the canonical `<name>.md` from the on-disk extension directory
- **AND** SHALL render agent-native files for each agent in `settings.agents`
- **AND** SHALL NOT update the lockfile

### Requirement: Re-rendering of in-scope extensions

`axm sync` SHALL re-render each in-scope extension's agent-native files on every run. Rendered files with the AXM managed marker are always overwritten — there is no per-file drift detection via content hashing, and there is no entry-level `sourceHash` short-circuit. Manually edited rendered files are overwritten on the next sync; to stop AXM from managing a file, uninstall or disable the extension.

#### Scenario: Sync re-renders managed files unconditionally

- **WHEN** `axm sync` runs
- **AND** subagent `code-reviewer` is enabled in settings and present on disk
- **THEN** sync SHALL render agent-native files for `code-reviewer` for each agent in `settings.agents`
- **AND** SHALL overwrite existing rendered files that contain the managed marker

#### Scenario: Identical re-renders are idempotent

- **WHEN** `axm sync` runs twice in succession with no changes
- **THEN** the second run SHALL produce the same rendered file contents as the first
- **AND** SHALL NOT report rendered files as conflicts

### Requirement: Agent list change reconciliation

When `settings.agents` changes, `axm sync` SHALL adjust rendered files. Cleanup of files for removed agents SHALL be derived from the configured agent directories on disk by inspecting files for the AXM managed marker, not from any lockfile-recorded `renderedFiles` map.

#### Scenario: Agent added

- **WHEN** `gemini-cli` is added to `settings.agents`
- **AND** `axm sync` is run
- **THEN** sync SHALL render all enabled, on-disk extensions for Gemini CLI

#### Scenario: Agent removed

- **WHEN** `cursor` is removed from `settings.agents`
- **AND** `axm sync` is run
- **THEN** sync SHALL walk Cursor's render directories
- **AND** SHALL delete files that contain the AXM managed marker
- **AND** SHALL leave files without the managed marker untouched

### Requirement: Disabled subagents have no rendered files

Disabled subagents SHALL NOT have rendered files after reconciliation. If a subagent's `enabled` field changes to `false`, sync SHALL remove its rendered files by walking the configured agent directories and deleting managed files whose basename matches the disabled extension.

#### Scenario: Disabled subagent files removed on sync

- **WHEN** `code-reviewer` has `enabled: false` in settings
- **AND** rendered files still exist from before it was disabled
- **AND** `axm sync` is run
- **THEN** sync SHALL remove all rendered files for `code-reviewer` from each configured agent's render directory

#### Scenario: Enabled subagent files created on sync

- **WHEN** `code-reviewer` has `enabled: true` in settings
- **AND** the canonical `<name>.md` is present on disk
- **AND** no rendered files exist
- **AND** `axm sync` is run
- **THEN** sync SHALL render files for all agents in `settings.agents`

### Requirement: Orphan subagent cleanup

When a subagent is present on disk under `.axm/extensions/` but absent from settings (and not transitively provided by a pack), sync SHALL remove its rendered files from configured agent directories. The trigger for orphan cleanup is the on-disk-vs-settings disagreement, not the lockfile.

#### Scenario: Orphaned subagent rendered files cleaned up

- **WHEN** `code-reviewer` is present at `.axm/extensions/<owner>/subagents/code-reviewer/` with rendered files in agent directories
- **AND** `code-reviewer` has no entry in settings and is not provided by any pack listed in settings
- **AND** `axm sync` is run
- **THEN** sync SHALL remove all rendered files for `code-reviewer` from each configured agent's render directory
- **AND** SHALL leave the canonical extension directory under `.axm/extensions/` untouched (cleanup is the responsibility of `axm prune` / `axm uninstall`)

## REMOVED Requirements

### Requirement: Frontmatter-to-manifest sync during reconciliation

**Reason**: This behavior was already removed from the codebase (the frontmatter→manifest projection on publish was dropped). The spec is brought into alignment.

**Migration**: None. Authors edit `<name>.md` frontmatter and the manifest independently, with the manifest serving registry/distribution concerns and the frontmatter serving authoring/behavior concerns. There is no automatic reconciliation between them.
