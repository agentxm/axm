---
observed_at: "2026-10-04T14:44:42Z"
session: "wah1"
area: "Local process specification verification"
---

# Default temporary ancestry exceeded local process-specification deadlines

## Context

The bundled-runtime account-home adapter was checked with its regression and the physical-boundary authority specification using the existing local five-second deadline.

## Friction

The adapter regression passed, but 16 physical-boundary cases exceeded five seconds. The complete invocation failed after 2 minutes 1 second. Both production-namespace cases still passed.

## Outcome

The same selected files were run using a unique directory beneath `/var/tmp`, preserving the five-second deadline. All 22 selected checks passed with three existing filesystem-dependent skips; the invocation took 41.3 seconds. The passing result establishes this host's temporary-root sensitivity, not a timing guarantee for other hosts.
