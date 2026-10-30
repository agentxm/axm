---
okf_version: "0.2"
---

# Agent extension engineering

Guidance for designing, authoring, reviewing, and maintaining extensions to
existing agents. Start with the use case below. Agent runtimes, planning loops,
and MCP server implementation are outside this bundle.

## Choose and compose

- [Choosing extension boundaries](choosing-extensions.md) — Use when deciding how to extend an agent; choose the smallest extension types that own the required behavior.
- [Composing extension packs](composing-packs.md) — Use when extensions must work together; declare a complete dependency graph and verify installation and independent versioning.

## Author the selected surface

- [Authoring and revising skills](authoring-skills.md) — Use when creating or changing a skill; define its routing and workflow contracts and check representative requests.
- [Authoring scoped instructions](authoring-instructions.md) — Use when creating or improving AGENTS.md, CLAUDE.md, or rules; establish effective scope and preserve useful discovery.
- [Authoring extension knowledge](authoring-knowledge.md) — Use when creating or restructuring a knowledge bundle; give substantive guidance one home and make it discoverable.
- [Authoring agent definitions](authoring-agent-definitions.md) — Use when configuring a delegated agent role; bind its responsibilities, tools, inputs, and handoff to the supported host.
- [Configuring hooks and MCP connections](configuring-hooks-and-mcp.md) — Use when extending a host through lifecycle hooks or an existing MCP service; bound execution and verify the selected host configuration.

## Review, verify, and maintain

- [Reviewing and remediating extensions](reviewing-extensions.md) — Use when reviewing, auditing, or fixing an extension; bind findings to exact evidence and keep assessment separate from mutation.
- [Verifying extension behavior](verification.md) — Use when checking an extension or an improvement claim; separate structural, routing, runtime, and comparative evidence.
- [Bounding extension trust and authority](trust-and-authority.md) — Use when an extension reads data, executes code, or changes external state; identify provenance and keep actions within authorized boundaries.
- [Publishing and retiring extensions](lifecycle.md) — Use when publishing, replacing, deprecating, or retiring extensions; preserve exact identities and provide a verifiable consumer migration.
