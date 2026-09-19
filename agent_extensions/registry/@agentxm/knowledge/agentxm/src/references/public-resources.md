---
type: Reference
description: The canonical public AgentXM and AXM resources — sites, install entry points, schemas, CLI help topics, source repositories, governing standards, official accounts, and contact.
tags: [links, resources, schemas, docs, accounts, reference]
status: stable
stale_after: 2027-02-06
generated:
  by: claude/fable-5
  at: 2026-08-06T13:04:04Z
---

# Public resources

## Sites and entry points

- [agentxm.ai](https://agentxm.ai) — registry web app.
- [axm.sh](https://axm.sh) — CLI site; installers at `install.sh`,
  `install.ps1`, `install.cmd`, and the agent-readable
  [install.md](https://axm.sh/install.md).
- Package distributions: [`axm.sh` on npm](https://www.npmjs.com/package/axm.sh),
  Homebrew tap `agentxm/tap/axm`.

## Contracts and schemas

- Extension manifest and workspace JSON Schemas under
  [axm.sh/schemas](https://axm.sh/schemas/): `settings`, `axm-lock`,
  `axm-package-meta`, `skill`, `mcp`, `subagent`, `rule`, `hook`, `knowledge`,
  and `pack` (`*.schema.json`).
- The registry REST API is self-describing via OpenAPI at
  registry.agentxm.ai.

## CLI help

`axm help` topics are the system of record for CLI behavior — including
`getting-started`, `basic-usage`, `authoring`, `workspace-state`,
`machine-output`, `exit-codes`, per-type topics (`skills`, `mcps`, `subagents`,
`rules`, `hooks`, `knowledge`, `packs`), and
`package-extensions`.

## Source and standards

- CLI source: [github.com/agentxm/axm](https://github.com/agentxm/axm),
  licensed under the [Functional Source License](https://fsl.software)
  (see also [fair.io](https://fair.io)).
- Ecosystem standards and formats: [Agent Skills](https://agentskills.io),
  [AGENTS.md](https://agents.md),
  [Model Context Protocol](https://modelcontextprotocol.io),
  [Agent Plugins](https://agent-plugins.org/),
  [Open Knowledge Format 0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md),
  [Package URL](https://www.packageurl.org/docs/purl/introduction), and
  [VERS](https://www.packageurl.org/docs/vers/introduction).

## Official accounts and contact

- GitHub: [github.com/agentxm](https://github.com/agentxm)
- LinkedIn: [linkedin.com/company/agentxm](https://www.linkedin.com/company/agentxm)
- X: [x.com/agentxm_ai](https://x.com/agentxm_ai)
- Email: hello@agentxm.ai
