---
type: Explainer
description: How Open Knowledge Format represents portable, human- and agent-readable knowledge as Markdown concepts with provenance.
tags: [okf, open-knowledge-format, knowledge]
status: stable
generated:
  by: openai/codex
  at: 2026-08-14T00:43:46Z
sources:
  - id: specification
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format 0.2 specification
---

# Open Knowledge Format

Open Knowledge Format (OKF) is an open format for representing the context and
curated insight surrounding data and systems.[^specification] It is designed to
be readable by people, parseable by agents, diffable in version control, and
portable across tools and organizations.

An OKF **knowledge bundle** is a directory tree of Markdown documents. Each
ordinary document is a **concept** with YAML frontmatter and a Markdown body.
Its path identifies it within the bundle. Optional index files provide
progressive discovery, while ordinary Markdown links express relationships
between concepts.

## What the format provides

OKF standardizes a small structural foundation rather than a universal
knowledge taxonomy. Version 0.2 makes provenance, generation, verification,
lifecycle, and optional attested computations representable in frontmatter.
Producers can add their own concept types and fields, and consumers must
tolerate extensions they do not understand.

OKF does not prescribe storage, search, retrieval, instruction injection, or a
runtime. It does not replace domain schemas such as OpenAPI or Protobuf, and it
does not define how executable material is packaged or authorized.

## Relationship to neighboring standards

An OKF bundle provides reference knowledge. It is not an
[Agent Skill](agent-skills.md), which teaches an agent a reusable capability,
and it is not [AGENTS.md](agents-md.md), which supplies instructions scoped to a
repository. Keeping these roles distinct prevents background knowledge from
silently becoming agent instruction.

## Relationship to AgentXM

OKF is the governing content format for an AgentXM Knowledge extension.
AgentXM applies a focused profile for validation and discovery, then adds
registry identity, versioned distribution, and workspace management. Knowledge
content remains available on demand and is not injected into agent
instructions.

[^specification]: Open Knowledge Format 0.2 specification.
