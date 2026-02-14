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

### Add skills to your project

Install a skill and axm wires it into every agent in your project:

```bash
axm skills install @acme/code-review
```

Skills can also be installed from GitHub, GitLab, Bitbucket, Azure Repos, local paths, and git URLs:

```bash
axm skills install owner/repo
axm skills install ./path/to/skills
```

### Share skills you've built

Already have skills in your project? Publish them to a registry so others can install them:

```bash
axm skills publish @acme/code-review
```

### Manage installed skills

```bash
axm skills update                # Pull latest versions
axm skills fork my-skill         # Fork for customization
axm skills list                  # See what's installed
axm skills disable my-skill      # Turn off without uninstalling
axm skills uninstall my-skill    # Remove completely
```

## Extension Packs

Packs bundle multiple skills into a single installable unit — a curated set of extensions your team can share and keep in sync.

### Install a pack

```bash
axm packs install @acme/frontend-tools
```

### Create and share your own

```bash
axm packs new my-pack
axm packs add my-pack @acme/code-review
axm packs publish my-pack
```

## Development

```bash
pnpm install    # Install dependencies
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm lint       # Lint
```

## License

MIT
