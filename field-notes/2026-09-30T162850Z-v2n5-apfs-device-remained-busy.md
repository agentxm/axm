---
observed_at: "2026-09-30T16:28:50Z"
session: "v2n5"
area: "macOS native filesystem verification"
---

# APFS device remained busy after identity repair

## Context

The Intel macOS job retried native case-sensitive filesystem verification after
cleanup was changed to retain the attached disk identity.

## Friction

Both normal and forced device detachment reported `Resource busy` after the
binary checks passed. The retained log does not identify an owning process.
The workflow placed the entire pnpm/Nx/test process tree's temporary files on
the APFS mount, and the fixture helper ignored removal failures.

## Cost / impact

The hosted job still failed after its product checks passed. The first cleanup
repair did not establish complete macOS verification.

## Outcome

Only the native fixture now receives an explicit APFS parent. Its removal is
strict and checked; runtime temporary files keep their normal location.
Mount-scoped open-file and device diagnostics run before detach. The bounded
Linux lifecycle check passed and left its dedicated parent empty. macOS
confirmation and the cause of the busy device remain unverified.
