---
type: Guide
title: "Publishing and retiring extensions"
description: "Use when publishing, replacing, deprecating, or retiring extensions; preserve exact identities and provide a verifiable consumer migration."
tags: ["publish", "deprecate", "migrate", "retire", "version", "rollback"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-10-30T20:56:27Z" }
---

# Publishing and retiring extensions

Resolve the publisher, canonical source, exact candidate version, intended
registry, selected packages, and explicit release authority. Use the extension
manager's current help for operational commands and the repository's established
release workflow. Extension publication is separate from a CLI binary release.

## Prepare and publish

1. Record the prior version, contract changes, compatibility implications,
   authority changes, dependency cohort, checks, migration, and rollback.
2. Validate complete candidates, inspect effective archive selection and
   integrity, and verify required resources and licenses survive filtering.
3. Integrate the source through the repository's required checks. Publish only
   the selected exact candidates; dependencies must be available before consumers.
4. Read back every exact published version and its relevant metadata/integrity.
   Unversioned lookup is insufficient. A failed or partial command is not success;
   inspect state and the supported recovery before retrying a registry mutation.
5. Exercise a clean consumer and confirm installed identities, dependency
   closure, required concept routes, and intended projections.

## Deprecate deliberately

Deprecation records warning and migration guidance. It does not necessarily block
new resolution, deactivate installed content, or remove retained history. Keep
those decisions distinct from yanking, disabling, uninstalling, or archiving.

Publish the replacement before naming it in deprecation guidance. Map each old
identity to its successor and disclose scope changes. A narrower replacement
must not promise continued support for omitted domains. Consolidating two skills
into one also requires removing stale direct selections and pack origins.

Use the manager's supported migration, preview it, inspect the member closure,
and verify desired settings, accepted resolution, retained canonical packages,
and projections afterward. Preserve old published versions for reproducibility
unless removal has separate authorization. Do not maintain two active canonical
copies of the same guidance.

Rollback identifies the prior exact package versions and workspace settings.
State that a rollback restores the old contract and may restore its old
limitations. Lifecycle readback establishes registry state; it does not establish
consumer adoption or runtime behavior.
