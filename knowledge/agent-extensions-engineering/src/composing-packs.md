---
type: Guide
title: "Composing extension packs"
description: "Use when extensions must work together; declare a complete dependency graph and verify installation and independent versioning."
tags: ["packs", "composition", "dependencies", "versions", "distribution"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-10-30T20:56:27Z" }
---

# Composing extension packs

A pack is a distribution and composition contract. Include extensions because
they are required for the collection's job, not because they coexist in a
workspace. Keep pack contents understandable from its stated purpose.

For a routing skill and knowledge bundle, put both directly in the pack. The
skill names the knowledge identity and exact concept routes, declares itself
non-standalone when the bundle is required, and recommends the pack. Knowledge
may remain independently useful. Do not reference sibling filesystem paths.

Check that selected version ranges contain the required concept and behavior
contracts. A broad range is a compatibility claim; use exact versions when only
that combination has been checked. Update the pack when required routes change.
Avoid cycles, hidden dependencies, and accidental inclusion of unrelated skills.

Use the manager's current composition and lifecycle semantics. For AXM, inspect
pack membership and the previewed member closure. Recommended-pack metadata is
discovery, not proof of installation. Distinguish direct workspace selections
from pack membership when migrating or uninstalling.

Validate the complete selected archive set and install it into an isolated
consumer when practical. Resolve the skill's knowledge routes from that
consumer, then inspect intended projections. A source-workspace success does
not prove the published archive is complete.

Keep extension versions separate from the CLI or application release cohort
unless the repository explicitly owns a coupled release contract. Follow
[lifecycle](lifecycle.md) for publication and migration.
