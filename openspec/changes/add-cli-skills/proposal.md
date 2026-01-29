# Change: Add CLI Skills Command

## Why

Users need a way to manage "skills" (reusable markdown instruction files) that extend AI coding agents. The `skills` command provides installation, discovery, and lifecycle management of skills compatible with 30+ agents including Claude Code, Cursor, Codex, and others.

## What Changes

- Add `axm init` command for initializing axm in a project or globally
- Add `axm skills` parent command with help and sub-command routing
- Add `axm skills add <source>` sub-command for installing skills from various sources
- Introduce `.axm/settings.json` for storing target agents and installed skills metadata
- Introduce `.axm/axm.lock` (YAML) for lockfile purposes
- Implicit initialization: `add` command triggers init flow if project is uninitialized

## Impact

- Affected specs: cli-init (new), cli-skills (new), cli-skills-add (new)
- Affected code: `packages/cli/`, `packages/core/`
- New dependencies: `@clack/prompts` (interactive UI), `picocolors` (terminal colors), `simple-git` (git operations), `yaml` (lockfile)
