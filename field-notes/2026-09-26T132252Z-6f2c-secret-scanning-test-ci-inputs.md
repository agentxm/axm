---
observed_at: "2026-09-26T13:22:52Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "CI secret-scanning contract"
---

# Secret-scanning contract retained retired CI inputs

## Context

The release and CI branch's draft pull request ran hosted CI after the required-job list moved into the classifier.

## Friction

The secret-scanning contract executed the Required CI shell step with event and documentation flags but omitted its new `REQUIRED_JOBS` input. Its successful-secret case exited 1, so the Secret scanning job failed before the scanner target finished.

## Cost / impact

The hosted Secret scanning job was red. The contract needed its fixture inputs updated and a focused rerun.

## Outcome

The contract now supplies the classifier's required-job list and tests the five secret-result states without repeating them for each event. The focused target passed both tests.

## Evidence

Hosted CI reported `pull_request required rollup with success secret evidence: 1 !== 0`; `pnpm exec nx run axm:test:secret-scanning` passed 2/2 after the edit.
