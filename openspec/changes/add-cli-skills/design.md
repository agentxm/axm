## Context

This feature enables axm to manage "skills"—reusable markdown instruction files (SKILL.md) that extend AI coding agents. The design uses axm's architecture (yargs + Effect) with a `.axm/` directory structure for state management.

### Stakeholders

- End users installing skills for their AI coding agents
- Teams sharing project-level skills
- Skill authors publishing to GitHub/GitLab

### Constraints

- Must use yargs for CLI parsing (project convention)
- Must use Effect for business logic (project convention)
- Must support common source formats (GitHub, GitLab, local paths) for broad compatibility
- Must be testable with unit tests at all layers

## Goals / Non-Goals

### Goals

- Install skills from: GitHub shorthand, GitHub URLs, GitLab URLs, local paths, direct URLs
- Support project-level (`.axm/`) and global (`~/.axm/`) installation scopes
- Detect installed agents automatically (Claude Code, Cursor, Codex, etc.)
- Provide interactive multi-select UI using @clack/prompts
- Track installed skills and metadata in `.axm/settings.json`
- Track skill versions/hashes in `.axm/axm.lock` (YAML format)

### Non-Goals

- Custom skill registry/search API (future)
- Skill authoring/init command (future)
- Update/remove commands (future scope)
- Telemetry (not needed for axm)

## Decisions

### Decision: Directory Structure

Use `.axm/` as the canonical directory instead of `.agents/`:

```
.axm/
  settings.json    # Target agents, preferences
  axm.lock         # Installed skill versions (YAML)
  skills/          # Canonical skill storage
    <skill-name>/
      SKILL.md
```

Agent-specific symlinks are created in each agent's skills directory (e.g., `.claude/skills/<name>` -> `../.axm/skills/<name>`).

**Rationale**: Consolidates all axm state under a single directory, avoiding collision with other tools.

### Decision: Settings vs Lockfile Separation

- `settings.json`: User preferences (target agents, last selections) - mutable, user-editable
- `axm.lock`: Installed skill metadata (source, hash, timestamps) - generated, not user-edited

**Rationale**: Separates concerns; settings are configuration, lockfile is derived state.

### Decision: YAML Lockfile Format

Use YAML instead of JSON for the lockfile:

```yaml
version: 1
skills:
  pr-review:
    source: example-org/agent-skills
    sourceType: github
    sourceUrl: https://github.com/example-org/agent-skills.git
    skillPath: skills/pr-review
    hash: abc123...
    installedAt: 2026-01-28T10:00:00Z
    updatedAt: 2026-01-28T10:00:00Z
```

**Rationale**: YAML is more readable in diffs and easier to edit if needed.

### Decision: Effect Integration

Structure the add command as:

1. **CLI layer** (yargs): Parse arguments, call handler
2. **Handler** (Effect): Orchestrates the flow using Effect services
3. **Services** (Effect): SourceParser, SkillDiscovery, AgentDetection, Installer, etc.

```typescript
// Handler returns Effect that can be tested with mock services
export const addSkillsHandler = (args: AddArgs): Effect.Effect<void, AddError, AddServices> => ...
```

### Decision: @clack/prompts for Interactive UI

Use @clack/prompts for the interactive CLI experience:

- `p.intro()` / `p.outro()` for session start/end
- `p.select()` for single choice
- `p.multiselect()` for multiple choices
- `p.spinner()` for async operations
- `p.confirm()` for yes/no prompts

**Rationale**: Well-tested library with polished terminal UI components.

## Architecture

```
packages/cli/src/commands/
  skills.ts                    # Parent command
  skills/
    add.ts                     # Add subcommand (yargs)
    add.handler.ts             # Add handler (Effect)

packages/core/src/
  experimental/
    skills/
      index.ts                 # Public exports for @agentxm/core/experimental/skills
      source-parser.ts         # Parse source strings
      skill-discovery.ts       # Find SKILL.md files
      agent-detection.ts       # Detect installed agents
      installer.ts             # Install skills to agents
      settings.ts              # Read/write settings.json
      lockfile.ts              # Read/write axm.lock
      types.ts                 # Shared types
```

### Export Pattern

Skills functionality is exported via subpath:

```typescript
// CLI imports skills from dedicated subpath
import {
  parseSource,
  detectAgents,
  installSkill,
} from "@agentxm/core/experimental/skills";
```

This requires adding the subpath export to `packages/core/package.json`:

```json
"exports": {
  ".": { ... },
  "./experimental": { ... },
  "./experimental/skills": {
    "types": "./dist/experimental/skills/index.d.ts",
    "import": "./dist/experimental/skills/index.js"
  }
}
```

## Risks / Trade-offs

### Risk: Breaking changes in @clack/prompts

Mitigation: Pin version, monitor for updates.

### Risk: Agent detection may miss edge cases

Mitigation: Support manual `--agent` flag to override detection.

### Trade-off: Symlinks vs Copies

Symlinks are preferred (single source of truth) but may fail on some systems (Windows without Developer Mode). Fallback to copy mode when symlinks fail.

## Open Questions

None at this time.
