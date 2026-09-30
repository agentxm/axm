---
observed_at: "2026-09-30T13:21:46Z"
session: "tn5h"
area: "native path verification"
---

# Repeated ancestor enumeration exceeded a lifecycle test deadline

## Context

A focused Subagent install/update regression used the default temporary directory while validating native physical-address safety.

## Friction

The test exceeded its normal 20-second deadline. A command-only 60-second diagnostic completed with the original assertions in 33.195 seconds: installation took 15.487 seconds and update took 17.514 seconds. It recorded 16,494 directory reads totaling 26.854 seconds, including 3,849 enumerations of a temporary directory containing about 5,900 entries.

## Outcome

The same test passed under its normal deadline in a fresh task-owned temporary directory in about 3.7 seconds. Installation took 1.528 seconds and update took 1.841 seconds; directory reads totaled 868 milliseconds. Temporary instrumentation was removed. No checked-in timeout or production optimization was introduced.

## Evidence

The diagnostic logs are `/tmp/native-contract-p9-subagent-profile.log` and `/tmp/native-contract-p9-subagent-var-tmp.log` in the agent environment. Broader verification remains pending.
