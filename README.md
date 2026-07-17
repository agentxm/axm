```
  ▄▀█ ▀▄▀ █▀▄▀█
  █▀█ █ █ █ ▀ █
  Agent Extension Manager by AgentXM

  https://axm.sh | https://agentxm.ai
```

![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)
[![npm version](https://img.shields.io/npm/v/axm.sh.svg)](https://www.npmjs.com/package/axm.sh)
[![CI](https://img.shields.io/github/actions/workflow/status/agentxm/axm/ci.yml?branch=main&label=CI)](https://github.com/agentxm/axm/actions/workflows/ci.yml)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue.svg)](./LICENSE)

# Extension manager for coding agents and AI assistants

- Manage agent skills, subagents, commands, MCP servers and more. Use the right tool(s) for the job.
- Bundle extensions with packs to share workflows across projects, teams, and others.
- Switch effortlessly between coding agents, bringing your workflow with you. Avoid lock-in.

> [!WARNING]
> AXM is in **early alpha** testing. Capabilities and APIs may change. To be
> included in the test user group, reach out to
> [hello@agentxm.ai](mailto:hello@agentxm.ai).

- **Multi-tool** — a unified context-engineering toolkit for managing
  skills, commands, subagents, and MCP servers
- **Multi-agent** — share workflows across Claude Code, Codex, Cursor,
  Gemini CLI, GitHub Copilot, OpenCode, and
  [nearly 40 others](#supported-agents)
- **Cross-platform** — discover and distribute agent skills and extensions
  across package ecosystems including JavaScript, Python, Java, .NET, Go,
  Rust, Ruby, and more

## Installation

**Ask your agent to install AXM:**

```
Follow these install instructions to set up AXM: https://axm.sh/install.md
```

**macOS / Linux:**

```bash
curl -fsSL https://axm.sh/install.sh | sh
```

**Windows (PowerShell):**

```powershell
irm https://axm.sh/install.ps1 | iex
```

**Windows (CMD):**

```cmd
curl -fsSL -o install.cmd https://axm.sh/install.cmd && install.cmd
```

**Homebrew:**

```bash
brew install agentxm/tap/axm
```

**npm:**

```bash
npm install -g axm.sh
```

## Getting started

Initialize AXM in your project. AXM detects your installed agents and creates
an `.axm/` workspace to manage extensions across all of them.

```bash
axm setup
```

See what's recommended for your project:

```bash
axm discover
```

Install an extension and AXM wires it into every agent in your workspace:

```bash
axm install @acme/skills/code-review
```

## Extension types

| Type            | What it is                                                                                 | Example                                                                          |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Skills**      | Context-triggered agent capabilities per the [agentskills.io](https://agentskills.io) spec | `@acme/skills/code-review` — apply team review standards on every diff           |
| **Commands**    | User-invokable prompts (slash commands, saved prompts)                                     | `@acme/commands/release-notes` — draft release notes from recent commits         |
| **Subagents**   | Task-specialized agents the main agent delegates to                                        | `@acme/subagents/researcher` — delegate doc-reading to a cheaper model           |
| **MCP servers** | Model Context Protocol servers exposing tools, data, and integrations                      | `@acme/mcps/linear` — tools for reading and updating Linear issues               |
| **Knowledge**   | Open Knowledge Format reference bundles for progressive agent discovery                    | `@acme/knowledge/platform` — trusted-team reference material for platform work   |
| **Packs**       | Curated bundles teams install and keep in sync                                             | `@acme/packs/frontend-tools` — the frontend guild's standard skills and commands |

Every type has its own subcommand namespace (`axm skills`, `axm commands`,
`axm subagents`, `axm mcps`, `axm knowledge`, `axm packs`) sharing a common shape:
`install`, `uninstall`, `list`, `update`, `new`, `publish`, plus
`enable`/`disable` where it applies.

## Subcommands

Examples below use `skills`; the same shape applies to every type.

```bash
axm skills new my-skill                       # Scaffold a new skill
axm skills install @acme/skills/code-review
axm skills list
axm skills disable my-skill                   # Turn off without uninstalling
axm skills enable my-skill
axm skills copy ./external-skill @acme/skills/my-skill
axm skills publish                            # Publish authored skills
```

Installed and enabled skills are always materialized in `.agents/skills/` for
the agentskills.io format, plus any declared agent-native skill directories.

Enabled Knowledge bundles remain canonical under `.axm/extensions/` and expose
only their `src/` content through `.agents/knowledge/@owner/name` by default.
AXM maintains the aggregate `.agents/knowledge/index.md` and an instruction-file
bridge; `.agents/knowledge` is an AXM convention rather than native agent
discovery. Configure another relative projection root with
`knowledgeConfig.directory`.

`axm packs` adds bundling commands:

```bash
axm packs add my-pack @acme/skills/code-review
axm packs add my-pack "effect-*"              # Add all matching extensions
```

Run `axm --help` for the top-level command list, or `axm <command> --help`
for options on any subcommand.

## Workspace

Top-level commands work across every extension type and infer the target from
your input:

```bash
axm install                          # Sync extensions from .axm/settings.json
axm install @acme/skills/code-review # Install a single extension
axm update                           # Pull latest versions
axm outdated                         # Show extensions with available updates
axm uninstall @acme/skills/code-review
axm adopt @acme/skills/retained-package       # Make a canonical package authoritative
axm demote @acme/skills/review ./upstream     # Explicitly return to external source management
axm prune                            # Remove extensions axm isn't managing
axm upgrade                          # Update axm itself
```

## Publishing

Extensions publish to the registry in four steps.

```bash
axm skills new my-skill              # 1. Scaffold
# 2. Author content in the scaffolded directory
axm lint                             # 3. Check the publish gate locally
axm publish --on-existing verify     # 4. Publish every authored extension idempotently
```

Authorship is derived from the intrinsic
`workspace:@owner/<plural-type>/<name>` settings source. Explicit selectors can
publish configured non-workspace packages without changing their source.

`axm lint` checks the same rules the registry enforces — see
[Lint](#lint) for details.

## Lint

`axm lint` evaluates workspace and per-extension invariants against a shared
rule catalog — the same one that drives the registry publish gate.

```bash
axm lint                    # Report findings against the current project
axm lint --fix              # Apply every autofixable finding non-interactively
axm lint --scope user       # Lint the user-scope workspace
axm lint --strict           # Exit non-zero on warnings as well as errors
axm lint --json             # Machine-readable findings envelope
```

Project scope is the default. Local `lint.rules` overrides in
`.axm/settings.json` affect `axm lint` only — the registry publish gate
remains authoritative.

## Authentication

Sign in to a registry to publish, install private extensions, or attribute
usage to your account:

```bash
axm login                   # Sign in to the default registry
axm whoami                  # Show the current identity
axm logout
axm token                   # Print the current token (for scripting)
```

`axm login` opens the browser for the default loopback PKCE flow. Use
`axm login --device-code` or `axm login --no-browser` for SSH/headless
environments.

## Supported agents

AXM supports nearly 40 agents — Claude Code, Codex, Cursor,
Gemini CLI, GitHub Copilot, OpenCode, Windsurf, Cline, Continue, Roo, Goose,
and more. If your agent isn't there,
[open an issue](https://github.com/agentxm/axm/issues) and we'll add it.

## Development

This is an Nx monorepo.

```bash
pnpm install    # Install dependencies
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm lint       # Lint
```

Use `pnpm build:affected`, `pnpm test:affected`, or `pnpm lint:affected` to
only operate on packages changed since `main`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development workflow.

---

**Open Agents, Open Standards, Open Source.**

## License

AXM is licensed under the [Functional Source License](https://fsl.software/) (FSL), a [Fair Source](https://fair.io) license that converts to a MIT license after two years.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc. — see [LICENSE](./LICENSE).
