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
2. For ordinary retirement, mark the skill deprecated, block new adoption,
   name the reason, successor or generic alternative, migration deadline, and
   removal condition.
3. For material safety or trust loss, revoke immediately, disable activation
   and distribution, identify affected identities, and begin incident handling.
4. Notify owners and consumers through the channels named in the governance
   record. Preserve rollback only when rollback is safe.
5. Verify migrations, active-set removal, dependency updates, version skew,
   and absence from implicit selection.
6. Remove installable artifacts according to registry retention policy while
   preserving provenance, decisions, changelog, incidents, and tombstone data
   needed to prevent rediscovery.
7. Mark the record retired only after every named exit condition has objective
   evidence.
