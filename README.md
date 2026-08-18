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

- Manage agent skills, subagents, MCP servers, rules, hooks, knowledge, and packs.
- Bundle extensions with packs to share workflows across projects, teams, and others.
- Switch effortlessly between coding agents, bringing your workflow with you. Avoid lock-in.

> [!WARNING]
> AXM is in **early alpha** testing. Capabilities and APIs may change. To be
> included in the test user group, reach out to
> [hello@agentxm.ai](mailto:hello@agentxm.ai).

- **Multi-tool** — a unified context-engineering toolkit for managing skills,
  subagents, MCP servers, rules, hooks, knowledge, and packs
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

<!-- axm:generated:extension-types-table -->

| Type            | What it is                                                                   | Governing standard                                                                                          |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Skills**      | Package reusable agent skills with SKILL.md metadata and instructions.       | [Agent Skills](https://agentskills.io)                                                                      |
| **MCP Servers** | Configure Model Context Protocol servers for agents.                         | [Model Context Protocol](https://modelcontextprotocol.io)                                                   |
| **Subagents**   | Install specialized agent profiles into an agent's native subagent system.   | —                                                                                                           |
| **Rules**       | Sync instruction files and distribute rule extensions that inject into them. | [AGENTS.md](https://agents.md)                                                                              |
| **Hooks**       | Install lifecycle hook extensions into an agent's native hook system.        | —                                                                                                           |
| **Knowledge**   | Package portable Open Knowledge Format concept bundles.                      | [Open Knowledge Format 0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) |

<!-- /axm:generated -->

**Packs** are the container type: a pack curates any of the above into one
bundle teams install and keep in sync, such as
`@acme/packs/frontend-tools` — the frontend guild's standard skills and
commands.

<!-- axm:generated:extension-type-namespaces -->

Every type has its own subcommand namespace (`axm skills`, `axm mcps`, `axm subagents`, `axm rules`, `axm hooks`, `axm knowledge`, `axm packs`) sharing a common shape: `install`, `uninstall`, `list`, `update`, `new`, `publish`, plus `enable`/`disable` where it applies.

<!-- /axm:generated -->

## Subcommands

Examples below use `skills`; the same shape applies to every type.

```bash
axm skills new my-skill                       # Scaffold a new skill
axm skills install @acme/skills/code-review
axm skills list
axm skills disable my-skill                   # Turn off without uninstalling
axm skills enable my-skill
axm skills import ./external-skill @acme/skills/my-skill
axm fork @acme/skills/code-review @me/skills/code-review-custom
axm skills publish                            # Publish authored skills
```

Installed and enabled skills are always materialized in `.agents/skills/` for
the agentskills.io format, plus any declared agent-native skill directories.

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
axm list                             # Inventory extensions across all types
axm list --outdated                  # Show extensions with available updates
axm list --deprecated                # Show deprecated installed extensions
axm uninstall @acme/skills/code-review
axm adopt @acme/skills/retained-package       # Make a canonical package authoritative
axm demote @acme/skills/review ./upstream     # Explicitly return to external source management
axm lint                             # Report intrinsic workspace facts
axm sync --preview                   # Preview reconciliation without writing
axm sync                             # Reconcile desired, accepted, and observed state
axm upgrade                          # Update axm itself
```

## Publishing

Extensions publish to the registry in four steps.

```bash
axm skills new my-skill              # 1. Scaffold
# 2. Author content in the scaffolded directory
axm lint                             # 3. Check the publish gate locally
axm publish                          # 4. Publish new authored versions; verify existing ones
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
axm login --device-code     # Sign in from SSH or a headless machine
axm whoami                  # Show the current identity
axm logout
axm token                   # Print the current token (for scripting)
```

`axm login` starts a local loopback PKCE flow, prints a manual authorization
URL, and then tries to open your browser. SSH, CI, and Codespaces automatically
use device-code sign-in; pass `--device-code` to select that flow explicitly.
Device-code sign-in shows the stable authorization page and one-time code
separately, and copies only the code. Never enter a code that another person or
website gave you.

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
