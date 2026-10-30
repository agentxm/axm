---
type: Guide
title: "Authoring extension knowledge"
description: "Use when creating or restructuring a knowledge bundle; give substantive guidance one home and make it discoverable."
tags: ["knowledge", "okf", "indexes", "metadata", "discovery", "documentation"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-10-30T20:56:27Z" }
---

# Authoring extension knowledge

Define the audience, scope, exclusions, and reader jobs before choosing
folders. Organize by distinctions readers use to select guidance. A routing
skill selects knowledge; it should not become a second copy of that knowledge.

## Build progressive discovery

- Package description: identify the domain and distinctive scope.
- Root index: explain where to start and link the major reader routes.
- Section index: distinguish its immediate concepts and narrower sections.
- Concept metadata: make title, description, and tags useful without folder
  context. A guide description names both its use case and supported outcome.
- Concept body: deliver the promised explanation, reference, or procedure.

Keep every concept reachable through indexes, and also check likely search
terms. Use the exact concept title and description in index entries. Add a
section only when it creates a meaningful choice. Link to neighboring authority
instead of restating its claims.

## OKF representation

For OKF v0.2, every non-reserved Markdown concept has parseable YAML frontmatter
with a non-empty `type`. Reuse a small consistent type vocabulary. `index.md`
and `log.md` are reserved at every level; they are not concepts. Only the root
index may have frontmatter, carrying `okf_version: "0.2"`. Log date headings use
`YYYY-MM-DD`, newest first.

Record provenance truthfully. Conversion is generation, not human verification.
Use sources and claim attribution for external factual claims, preserve licenses,
and avoid invented review or approval. An application profile adds its own rules;
profile conformance and base OKF conformance are distinct claims.

## Maintain and verify

For a move, inventory inbound references, establish the new home, update indexes
and callers, and remove duplication or record the supported migration. Keep
retired published identities available according to the lifecycle decision.
Run the applicable format and profile validators, check internal links, and
walk both browse and search paths. Resolve errors and explain material warnings.

Use the declared format specification and host tooling for current mechanics;
this guide does not replace a bundle's application profile.
