---
observed_at: "2026-10-07T12:14:00Z"
session: "r42v"
area: "CLI release notes"
---

# Generated release notes omit retained source packages

## Context

Review the automatically generated `cli-v0.42.0` candidate in pull request #531,
prepared from `45b11c547d59baca6a17109f7ec2576ae8e2232b`.

## Friction

The source commit is titled `Retain complete source packages across selected
extensions`. The generated 0.42.0 changelog describes Library IDs and telemetry
but does not mention source-package retention. The two consumed version plans
also describe Library IDs and telemetry.

## Cost / impact

The generated release notes do not identify this additional behavior shipped in
the candidate. No delay or implementation change was made for this observation.

## Outcome

The candidate review identified the omission for the requested release-process
report. Candidate generation and its generated changelog were left unchanged.

## Evidence

- Candidate: `988fdf5ceb27326eab4a03d0dba067a32afa4bcf`.
- `CHANGELOG.md`: generated 0.42.0 entry.
- Consumed plans: `.nx/version-plans/library-id-contract.md` and
  `.nx/version-plans/version-plan-1791242091121.md`.
