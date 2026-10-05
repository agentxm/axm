---
observed_at: "2026-10-05T11:40:34Z"
session: "axm039-upgrade"
area: "axm-cli-interactions"
---

# Bundled recovery verification slows in a dense temporary directory

## Context

Running the AXM bundled recovery specifications on a workstation whose `/tmp` contained 10,755 entries.

## Friction

The recovery idempotence case exceeded its normal five-second test timeout. A representative recovery timeout also reproduced in an untouched main checkout. Native address inspection reads parent directory entries to establish physical ownership.

## Cost / impact

The investigation required baseline reproduction, a diagnostic timeout override, and two temporary-directory placements. The unchanged idempotence case took 42.151 seconds with the diagnostic override and 2.934 seconds with an isolated temporary directory at the normal timeout.

## Outcome

Moving temporary files under the repository avoided the timeout but changed Git ancestry and failed four unrelated expectations. A sparse temporary directory outside Git avoided that ancestry change. A later broad run still hit local-profile timeouts; the repository's existing CI profile was selected for the next verification attempt.
