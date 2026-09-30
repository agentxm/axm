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
repair did not establish complete macOS verification. A later pull-request run
passed on Intel and ARM, but the following merge-queue Intel run again failed
with exit 16 after all eleven normal checks and the targeted APFS check passed.
Its mount-scoped open-file inspection returned status 1 without identifying a
holder.

## Outcome

Only the native fixture now receives an explicit APFS parent. Its removal is
strict and checked; runtime temporary files keep their normal location.
Mount-scoped open-file and device diagnostics run before detach. After the
queue recurrence, cleanup now checks that the mounted APFS container has one
physical store belonging to the disposable image, removes that container, then
detaches its backing image. Shell regressions cover ownership mismatch refusal
and preservation of test and cleanup failures. Hosted confirmation of this
container-teardown change and the underlying busy-device cause remain pending.
