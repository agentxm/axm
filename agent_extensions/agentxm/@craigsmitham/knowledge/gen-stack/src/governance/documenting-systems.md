---
type: Guide
title: Documenting systems
description: Use when establishing a Gen Stack corpus for one system or clarifying its root subject; create the required System concept that anchors the boundary and system-wide Requirements.
tags: [architecture-documentation, system, boundary, requirements]
status: draft
sources:
  - resource: /profile/gen-stack-application-profile.md#system
    title: Gen Stack application profile — System
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:18:00Z
---

# Documenting systems

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Create `/system.md` at the corpus root (`<repository-root>/gen-stack/system.md`)
before assigning system-wide
requirements.

## Representation

Use the OKF envelope and the profile's exact `System` type and root path. Keep
title, description, document status, provenance, and controlled relationships
in their native frontmatter homes. Present residual body meaning in this
preferred order: purpose, boundary, material exclusions, environmental
relationships, narrower-view navigation, and evidence. Omit inapplicable
detail and do not repeat frontmatter or linked Requirement statements in the
body. This body order is guidance, not an additional profile rule.

1. Name the single documented system and the purpose that distinguishes it.
2. State the boundary in terms a reader can apply when deciding what is inside
   or outside the corpus.
3. Name material exclusions and important environmental relationships.
4. Use the exact `System` type and common profile fields.
5. Link narrower Offering, Surface, domain, or C4 views when maintained; do not
   restate their inventories.
6. Create `system/requirements/` only when the first accepted system-wide
   Requirement exists. Link that collection as the normative authority rather
   than repeating its binding statements in `system.md`.

The System concept is a semantic anchor, not a synonym for a C4 Software
System. It may correspond closely to one, but the two concepts answer different
documentation questions. Purpose, boundary, relationships, exclusions, and
responsibility belong here. An independently accepted statement of what the
System must do, preserve, prevent, constrain, or achieve belongs in a
subject-colocated Requirement.
