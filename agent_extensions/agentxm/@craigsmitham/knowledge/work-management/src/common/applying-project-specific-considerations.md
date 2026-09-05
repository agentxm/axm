---
type: Guide
title: Applying repository-specific work-item considerations
description: Use when repository instructions add security, compatibility, data, accessibility, operational, or other content obligations to a portable work item.
tags: [work-item, repository-instructions, local-policy, security, compatibility, accessibility, migration, operations]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Applying repository-specific work-item considerations

Portable templates define stable semantic slots. Repository instructions may
add content obligations that apply to particular components, change classes,
risks, or delivery contexts without maintaining a competing general template.

## Apply the overlay

1. Read applicable repository and directory-scoped instructions.
2. Identify each condition that activates a local consideration.
3. Place the required content in the closest matching portable slot.
4. Add a local section only when no existing slot carries the meaning clearly.
5. Preserve the local source or instruction that requires the consideration.

For example, an instruction that public API Changes address compatibility,
migration, and deprecation normally contributes to constraints, risks,
completion conditions, and verification. A data-handling instruction may add
privacy, retention, migration, and rollback content. Neither requires a new
portable work-item role.

## Preserve semantic boundaries

Local instructions may add required evidence, reviewers, fields, sections,
quality gates, or lifecycle mappings. They should not silently turn labels into
proof, combine independently managed roles, or make a work item the normative
owner of a peer specification or decision. When a local policy intentionally
changes a portable semantic assumption, state the conflict and follow the
higher-precedence instruction rather than pretending both meanings apply.

Do not invent local considerations from generic good practice. Apply only
requirements found in the repository, host, user request, or other recognized
authority, and omit inapplicable content.
