---
observed_at: "2026-10-04T00:55:12Z"
session: "q8m2"
area: "Source verification experiments"
---

# Populated temporary ancestry delayed a specification probe

## Context

A verification-scratch experiment ran the complete projection-currency specification file on current main using a newly created temporary root beneath `/tmp`. The host's `/tmp` contained approximately 9,900 entries. The command retained the specification's assertions and deadlines.

## Friction

The test process continued consuming one CPU core without completing the file. A child temporary root still retained `/tmp` in its physical-path ancestry.

## Cost / impact

The test target ran for 6 minutes 25 seconds before it was interrupted; the complete Nx invocation took 7 minutes 21 seconds. No successful specification result was obtained from this attempt.

## Outcome

The experiment was interrupted, its remaining worker was stopped, and the comparison was narrowed to one existing instruction-copy case under controlled temporary roots. The original diagnostic log was retained separately.
