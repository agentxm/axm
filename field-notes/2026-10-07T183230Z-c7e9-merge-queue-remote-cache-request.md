---
observed_at: "2026-10-07T18:32:30.189516Z"
session: "c7e9"
area: "Nx remote cache in GitHub merge queue"
---

# Merge queue browser partition stopped on a cache request

## Context

Publication capacity PR #535 passed proposed-change CI. Its integration revision was running protected merge-group verification.

## Friction

The second CLI E2E shard exited before browser tests produced results. Nx reported a failed request to `https://cache.agentxm.ai/v1/cache/5234907127964724588`, then exited with code 1.

## Outcome

The job failed; other merge-group jobs were still running when observed. No test assertion failure was reported in this job.

## Evidence

- https://github.com/agentxm/axm/actions/runs/37666729968/job/112948501035
- Integration revision: `eaf8240c16be5983d01908eea42ae9894335acbb`.
- Failed command duration: 58,850 ms.
- JUnit reporter: no test results found.
