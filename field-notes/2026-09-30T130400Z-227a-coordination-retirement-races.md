---
observed_at: "2026-09-30T13:04:00Z"
session: "227a"
area: "workspace settlement concurrency"
---

# Admission directory retirement raced the next waiter

## Context

Broader CLI verification exercised multiple workspace authorities sharing physical-boundary coordination.

## Friction

CLI setup reported container-absent and runtime-parent-changed errors beneath coordination lease paths. A deterministic retirement witness then exposed container-absent at admission/tmp: an earlier holder removed shared runtime directories after unlocking while the next waiter inspected them. Claim-record removal and token-lease release also happened in separate admission lifetimes.

## Outcome

Token record and lease retirement now run under one admission hold. Shared admission ancestors remain stable beneath the account namespace. The deterministic retirement and frozen-clock controls passed; a containment control and broader verification are pending.
