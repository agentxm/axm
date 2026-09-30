---
observed_at: "2026-09-30T17:23:00Z"
session: "tn5h"
area: "Lifecycle fixture isolation and verification"
---

# Independent fixtures shared the account-wide coordinator

## Context

Full source verification exposed lifecycle timeouts that focused runs had passed.

## Friction

The feature and CLI disk fixtures isolated their workspace and user-home paths but still selected the production operating-system account's physical-boundary coordinator. Unrelated fixtures contended on its admission lock.

## Cost / impact

A controlled four-case workload recorded 23 contended acquisitions, including individual waits exceeding one second. Filesystem counters and admission timing were needed to distinguish this coupling from product read costs.

## Outcome

Fixture owners now allocate and clean separate real coordination directories, with explicit borrowing for related workspaces. The same selected workload passed with two contended acquisitions. Production process witnesses remain unchanged. Temporary measurement code was removed; complete verification remains pending.

## Evidence

The fixture owners are `workspace-features/src/testing/workspace-world.ts` and the CLI's disk fixture helpers. Both measured runs used the existing three-project Nx capacity and two Vitest workers, without changing deadlines or selected cases.
