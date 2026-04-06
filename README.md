# axm - the Open Agent extension manager

Manage agent skills, commands, sub-agents, MCP servers, and rules for your Claude Code, Codex, Gemini CLI, GitHub Copilot, OpenCode, and more.

> **Early preview** — APIs and commands may change between releases. Feedback and contributions welcome!

## Installation

```bash
npm install -g @axm.sh/cli
```

## Getting Started

Initialize axm in your project. axm detects your installed agents (50+ supported) and creates an `.axm/` workspace to manage extensions across all of them. Any existing skills in your project keep working — axm doesn't touch what's already there.

```bash
axm init
```

## Skills

Skills are reusable extensions that give AI coding agents new capabilities — code review workflows, commit conventions, domain knowledge, and more. They follow the [agentskills.io](https://agentskills.io) spec.

### Create a new skill

```bash
axm skills new my-skill
```

This creates a skill in your `.axm/skills/` directory, wired into every agent in your project.

### Import existing skill

If your project already has skills (or you want to customize an installed one), fork them into your workspace:

```bash
axm skills fork my-skill             # Fork a single skill
axm skills fork "effect-*"           # Fork all skills matching a pattern
axm skills fork ./path --skill "ci-*" # Fork matching skills from a source
```

### Publish a skill

Publish a skill to the registry to easily install on other projects and share with your team:

```bash
axm skills publish my-skill
```

### Install skills

Install a skill and axm wires it into every agent in your project:

```bash
axm skills install @acme/skills/code-review
```

### Enable and disable skills

Turn skills off without uninstalling them, and re-enable when needed:

```bash
axm skills disable my-skill      # Turn off without uninstalling
axm skills enable my-skill       # Re-enable a disabled skill
```

### Ignore skills

> **Coming soon** — not yet implemented.

If some skills in your project are managed outside axm (e.g., checked in manually or owned by another tool), you can tell axm to leave them alone:

```bash
axm skills ignore my-skill           # Ignore a single skill
axm skills ignore "legacy-*"         # Ignore skills matching a pattern
```

Ignored skills won't be modified, updated, or removed by axm.

### More skill commands

```bash
axm skills list                  # List installed skills
axm skills update                # Pull latest versions
axm skills update --skill "ci-*" # Update skills matching a pattern
axm skills uninstall my-skill    # Remove completely
```

## Extension Packs

Extension packs bundle multiple skills into a single installable unit — a curated set of extensions your team can share and keep in sync.

### Create an extension pack

```bash
axm packs new my-pack
```

### Add skills to an extension pack

```bash
axm packs add my-pack @acme/code-review      # Add a single skill
axm packs add my-pack "effect-*"             # Add skills matching a pattern
```

### Install an extension pack

```bash
axm packs install @acme/frontend-tools
```

### Publish an extension pack

```bash
axm packs publish my-pack
```

## Development

This is an Nx monorepo. All commands delegate to Nx for caching and dependency-aware orchestration.

```bash
pnpm install    # Install dependencies
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm lint       # Lint
```

Use `pnpm build:affected`, `pnpm test:affected`, or `pnpm lint:affected` to only operate on packages changed since `main`.

## License

MIT
