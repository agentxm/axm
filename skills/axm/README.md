# AXM Agent Skill

The official AXM Agent Skill helps coding agents manage every AXM extension
type while keeping lifecycle work separate from semantic authoring and
underlying software implementation. It resolves canonical packages, workspace
state, agent projections, composition, installation, distribution, and
lifecycle operations for skills, subagents, MCP connections, rules, hooks,
Knowledge bundles, and packs.

Use it when you want an agent to create, find, configure, install, update,
publish, disable, remove, or otherwise manage an extension. Do not use it merely
to perform an installed extension's normal task or to implement and debug MCP
server software. AXM can configure how agents connect to that server; ordinary
software engineering owns the server itself.

## Install

```sh
axm install @agentxm/skills/axm
```

The skill is also bundled with the AXM CLI so a compatible copy is available
for workspace setup and recovery.

## Example

> Create a skill that audits API documentation, keep its source canonical under
> AXM, and prepare the package for publication.

AXM resolves package and lifecycle state, then routes basic authoring through
CLI help. The optional `@agentxm/packs/agent-extension-engineering` collection
adds deeper design and review guidance; ordinary use does not require it.

## License

FSL-1.1-MIT. See the package [license](LICENSE) or the
[canonical repository terms](https://github.com/agentxm/axm/blob/main/LICENSE).

## Behavioral evidence

[The 2026-10-30 baseline and candidate exercises](evals/2026-10-30/README.md)
retain synthetic authoring artifacts, planning responses, consulted-source
hashes, and limits. Evaluation records are repository-only and excluded from
publication.
