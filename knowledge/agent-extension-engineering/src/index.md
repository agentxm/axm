---
okf_version: "0.2"
---

# Agent extension engineering

Choose a guide for the extension decision you face. For AXM package mechanics
and basic authoring, start with `axm help authoring`.

## Shared vocabulary

- [Agent Extension Glossary](glossary.md) — Shared definitions for agent extensions, their types, distribution, and the AXM and AgentXM product surfaces.

## Choose and compose

- [Choosing extension boundaries](choosing-extensions.md) — Choose an extension type based on when and where the behavior should apply.
- [Composing extension packs](composing-packs.md) — Choose pack members and compatible versions from the job a clean installation must support.

## Author the selected surface

- [Writing an extension README](authoring-readme.md) — Choose an example and the details a reader needs to decide whether to install an extension and try it.
- [Authoring and revising skills](authoring-skills.md) — Resolve overlapping skill triggers and decide how much procedure belongs in the skill.
- [Authoring scoped instructions](authoring-instructions.md) — Place an instruction at the scope where it applies and check what neighboring tasks inherit.
- [Authoring extension knowledge](authoring-knowledge.md) — Design concepts that readers can select from an index or find directly through search.
- [Authoring agent definitions](authoring-agent-definitions.md) — Decide when to delegate and what the caller must supply for the role to work independently.
- [Configuring hooks and MCP connections](configuring-hooks-and-mcp.md) — Decide how a hook should handle failure or what access an MCP connection needs.

## Review, verify, and maintain

- [Reviewing and remediating extensions](reviewing-extensions.md) — Turn a suspected extension defect into a finding and verify an authorized fix against the original case.
- [Verifying extension behavior](verification.md) — Choose evidence for a claim about packaging, routing, runtime behavior, portability, or improvement.
- [Bounding extension trust and authority](trust-and-authority.md) — Review how a change affects what an extension can read, execute, or send.
- [Publishing and retiring extensions](lifecycle.md) — Plan an extension replacement or retirement around what existing consumers gain, lose, or must change.
