---
type: How-to guide
title: How to retire a skill
description: How to deprecate, revoke, migrate, remove, and preserve the history of a skill selected for retirement.
tags: [agent-skills, deprecation, revocation, retirement, migration]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:57:04Z }
stale_after: 2027-02-14
---

# How to retire a skill

Use this operation after governance has selected a skill for deprecation,
revocation, or retirement. Do not infer that low usage alone makes removal safe.

1. Bind the exact skill versions, active cohorts, dependents, installations,
   owners, and accepted retirement decision.
2. For ordinary retirement, publish deprecation and migration guidance naming
   the reason, successor or generic alternative, deadline, and removal
   condition. Decide separately when fresh adoption must stop.
3. For material safety or trust loss, record revocation immediately, use native
   controls to block fresh resolution and deactivate affected installations,
   identify exact identities, and begin incident handling.
4. Notify owners and consumers through the channels named in the governance
   record. Preserve rollback only when rollback is safe.
5. Verify migrations, active-set removal, dependency updates, version skew,
   and absence from implicit selection.
6. Remove the skill from active workspaces and fresh resolution according to
   policy while preserving published identity, provenance, decisions,
   changelog, incidents, and tombstone data needed to prevent rediscovery. Do
   not equate retirement with deleting immutable registry history.
7. Mark the record retired only after every named exit condition has objective
   evidence.

For AXM, deprecation, yanking, disabling, and uninstalling are distinct
controls. Use the [AXM extension-management profile](platforms/axm.md) and
current CLI help to realize the accepted decision without collapsing them.
