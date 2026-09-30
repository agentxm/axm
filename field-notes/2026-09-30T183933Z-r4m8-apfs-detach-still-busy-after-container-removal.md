---
observed_at: "2026-09-30T18:39:33Z"
session: "01a0ef90-c285-7fc1-840d-d0152eefc1cb"
area: "macOS CI fixture cleanup"
---

# Image detach remained busy after APFS container removal

## Context

The merge queue verified native lifecycle behavior on a case-sensitive disk image.

## Friction

The ARM macOS assertions passed and the owned APFS container was deleted. Normal
and forced image detach then both returned status 16, resource busy. The job
failed cleanup. Open-file inspection had returned no matches; this does not
establish which resource kept the image busy.

## Cost / impact

The required queue gate could not accept the candidate despite passing native
assertions. The preceding PR run had passed both macOS hosts with this cleanup.

## Outcome

Added a bounded retry for status 16 from forced detach, with at most four
two-second delays. Other errors stop immediately and exhaustion remains a
failure. The original test failure takes precedence when present. Local shell
fixtures and hosted verification were pending at capture.

## Evidence

- [Queue macOS job](https://github.com/agentxm/axm/actions/runs/36759836058/job/110039469109)
- Container deletion completed at 18:39:31Z; both detach attempts failed at
  18:39:33Z.
