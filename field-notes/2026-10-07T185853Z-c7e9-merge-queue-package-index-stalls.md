---
observed_at: "2026-10-07T18:58:53.199174Z"
session: "c7e9"
area: "GitHub Ubuntu runner toolchain setup"
---

# Package index setup stalled several queue jobs

## Context

Integration revision `eaf8240c16be5983d01908eea42ae9894335acbb` had passed its source verification partitions.

## Friction

Commit history and secret scanning timed out during toolchain setup at their existing five- and ten-minute job budgets. Their logs ended after Ubuntu package-index requests; neither reached its intended check. The first CLI E2E shard remained in setup for over 26 minutes, without starting tests.

## Outcome

Canceled the owned CI attempt, then reran unsuccessful jobs through GitHub Actions on the same integration revision. Recovery remains in progress. Existing job budgets and required checks were unchanged.

## Evidence

- https://github.com/agentxm/axm/actions/runs/37666729968
- Commit history job: 112948500778.
- Secret scanning job: 112947753703.
- First CLI E2E shard: 112948501089.
- Logs showed repeated ignored `azure.archive.ubuntu.com` requests and successful `archive.ubuntu.com` index responses before setup stopped progressing.
