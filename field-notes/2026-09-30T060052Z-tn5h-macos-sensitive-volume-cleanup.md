---
observed_at: "2026-09-30T06:00:52.334670+00:00"
session: "tn5h"
area: "CLI release verification"
---

# APFS fixture cleanup failed after its lifecycle test passed

## Context

Canonical CLI 0.37.2 CI ran the macOS ARM binary lifecycle test on an owned case-sensitive APFS sparse image.

## Friction

The focused native case test passed, then the EXIT trap failed to detach the test image with `Resource busy` and exit 16.

## Outcome

The macOS ARM binary artifact job failed despite the successful lifecycle assertion, preventing canonical publication eligibility.

## Evidence

Run 36673882244, job 109754660083, `Verify native lifecycle on case-sensitive APFS`.
