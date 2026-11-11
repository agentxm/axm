---
type: Domain Concept
description:
  The AXM vs. AgentXM naming convention — when to write the all-caps product
  name, when to use the lowercase code identifier, how the CLI relates to the
  platform, what the registry and marketplace are called, and where the AXM mark
  stands for AgentXM.
tags:
  [naming, axm, agentxm, branding, conventions, favicon, registry, marketplace]
status: stable
generated:
  by: codex/gpt-6
  at: 2026-10-31T00:19:51Z
sources:
  - id: axm-agents-md
    resource: https://github.com/agentxm/axm/blob/main/AGENTS.md
    title: AXM repository AGENTS.md (naming section)
  - id: agentxm-favicon
    resource: https://agentxm.ai/favicon.svg
    title: AgentXM favicon
  - id: agentxm-registry-page
    resource: https://agentxm.ai/registry
    title: Agent Extension Registry product page
  - id: agentxm-marketplace-page
    resource: https://agentxm.ai/marketplace
    title: Agent Extension Marketplace product page
---

# AXM and AgentXM naming

The
[Agent Extension Glossary](https://github.com/agentxm/axm/blob/main/knowledge/agent-extension-engineering/src/glossary.md)
defines AXM, AgentXM, the registry, and the marketplace. This concept owns their
spelling and naming conventions.[^axm-agents-md]

- Use **AXM** in prose and headings.
- Use lowercase `axm` only where an identifier must match reality: CLI command
  references (`axm install`), package names (`@agentxm/*`, `axm.sh` on npm),
  filesystem paths, repository names, and hostnames (`axm.sh`).
- Use **AgentXM** for the platform and **AXM** for the CLI, following the
  glossary. "AXM" is never a textual synonym for the whole platform. The one
  exception is the [AXM mark](#the-axm-mark), and it is an image, not a word.

The split keeps human-facing text consistent while preserving exact lowercase
identifiers everywhere an identifier is load-bearing, and it prevents the CLI
name from absorbing the registry and other product surfaces.

## The registry and marketplace names

AgentXM's registry is the **Agent Extension Registry** and its marketplace is
the **Agent Extension Marketplace**, named the way AXM is the Agent Extension
Manager.[^agentxm-registry-page][^agentxm-marketplace-page]

- Use the Title Case names where a page title, heading, link, or share card
  names the product.
- Prose that describes them writes "agent extension registry" and "agent
  extension marketplace" in lowercase, then "registry" and "marketplace" once
  the reader knows which one is meant.
- Never write "AgentXM Registry" or "AgentXM Marketplace". An agent registry
  lists agents and an agent marketplace sells them; both names say extension
  because AgentXM holds what agents use, not the agents themselves.

## The AXM mark

AgentXM's favicon is the AXM mark, a light A with a bold XM drawn from the
wordmark.[^agentxm-favicon] It appears only in slots of 24 px and less, beside a
page or app title that names AgentXM. In text, AXM still names only the CLI.

[^axm-agents-md]: AXM repository AGENTS.md (naming section).

[^agentxm-favicon]: AgentXM favicon.

[^agentxm-registry-page]: Agent Extension Registry product page.

[^agentxm-marketplace-page]: Agent Extension Marketplace product page.
