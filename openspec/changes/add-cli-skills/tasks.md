## 1. Core Domain Types and Services

- [ ] 1.1 Create `packages/core/src/experimental/skills/types.ts` with Skill, AgentConfig, ParsedSource, Settings, LockEntry types
- [ ] 1.2 Create `packages/core/src/experimental/skills/source-parser.ts` for parsing source strings (github, gitlab, git, local, direct-url, well-known)
- [ ] 1.3 Create `packages/core/src/experimental/skills/agent-detection.ts` with agent configs and detection logic
- [ ] 1.4 Create `packages/core/src/experimental/skills/skill-discovery.ts` for finding SKILL.md files in directories
- [ ] 1.5 Create `packages/core/src/experimental/skills/installer.ts` for installing skills (symlink/copy)
- [ ] 1.6 Create `packages/core/src/experimental/skills/settings.ts` for reading/writing .axm/settings.json
- [ ] 1.7 Create `packages/core/src/experimental/skills/lockfile.ts` for reading/writing .axm/axm.lock (YAML)
- [ ] 1.8 Create `packages/core/src/experimental/skills/git.ts` for cloning repositories
- [ ] 1.9 Create `packages/core/src/experimental/skills/index.ts` with public exports
- [ ] 1.10 Add `./experimental/skills` subpath export to `packages/core/package.json`

## 2. Unit Tests for Core Services

- [ ] 2.1 Add tests for source-parser (all source types)
- [ ] 2.2 Add tests for agent-detection (mock filesystem)
- [ ] 2.3 Add tests for skill-discovery (mock filesystem)
- [ ] 2.4 Add tests for installer (mock filesystem)
- [ ] 2.5 Add tests for settings (mock filesystem)
- [ ] 2.6 Add tests for lockfile (mock filesystem)

## 3. CLI Skills Parent Command

- [ ] 3.1 Create `packages/cli/src/commands/skills.ts` parent command with yargs
- [ ] 3.2 Add help text and sub-command demandCommand
- [ ] 3.3 Add unit tests for skills command

## 4. CLI Skills Add Subcommand

- [ ] 4.1 Create `packages/cli/src/commands/skills/add.ts` with yargs command definition
- [ ] 4.2 Create `packages/cli/src/commands/skills/add.handler.ts` with Effect-based handler
- [ ] 4.3 Implement source argument handling
- [ ] 4.4 Implement `--global` flag for user-level installation
- [ ] 4.5 Implement `--agent` flag for specifying target agents
- [ ] 4.6 Implement `--skill` flag for specifying skill names
- [ ] 4.7 Implement `--yes` flag for non-interactive mode
- [ ] 4.8 Implement `--list` flag for listing available skills without installing
- [ ] 4.9 Implement `--all` flag for installing all skills to all agents
- [ ] 4.10 Implement interactive prompts with @clack/prompts
- [ ] 4.11 Add unit tests for add command parsing
- [ ] 4.12 Add integration tests for add handler

## 5. Dependencies

- [ ] 5.1 Add @clack/prompts to packages/cli dependencies
- [ ] 5.2 Add picocolors to packages/cli dependencies
- [ ] 5.3 Add simple-git to packages/core dependencies
- [ ] 5.4 Add yaml to packages/core dependencies

## 6. Documentation

- [ ] 6.1 Update CLI help text
- [ ] 6.2 Add examples to command definitions
