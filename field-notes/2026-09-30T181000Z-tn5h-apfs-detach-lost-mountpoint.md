---
observed_at: "2026-09-30T18:10:00Z"
session: "tn5h"
area: "macOS case-sensitive verification cleanup"
---

# APFS cleanup lost its retry address after unmount

## Context

The macOS Intel binary job in CI run 36753600817 verified native lifecycle behavior on the default volume and a temporary case-sensitive APFS image.

## Friction

Both lifecycle executions passed. The exit trap then reported a busy device while detaching by mountpoint, followed by a missing mountpoint on the forced retry. Cleanup failed the job and skipped its subsequent physical-boundary specification.

## Outcome

The workflow now retains the device identifier from the attachment's structured plist for both detach attempts. Its new hosted execution remains required.

## Evidence

Job 110018326939: the APFS lifecycle passed in 46.986 seconds. Cleanup reported `couldn't eject "disk2" - Resource busy`, then `detach failed - No such file or directory`.
