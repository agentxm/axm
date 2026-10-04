---
observed_at: "2026-10-04T13:49:30Z"
session: "wah1"
area: "Windows binary release verification"
---

# Windows account-home lookup stopped the release smoke check

## Context

Release candidate `cli-v0.39.0` passed pull-request CI. Its native merge-queue run `37206770113` then ran the compiled binary smoke suite on Windows.

## Friction

The first install in the native case-alias lifecycle failed because the account-home adapter's PowerShell query was killed with `SIGTERM` at its existing 10-second process limit. The case reported `account-query-failed`; 13 other binary smoke cases passed.

## Cost / impact

The Windows binary job failed, preventing release admission. The install attempt took 11,936 milliseconds. No new CLI version was published.

## Outcome

The failure log was preserved. Investigation continued in a separate worktree from current main without retrying the unchanged release candidate.

## Evidence

[Failed Windows job](https://github.com/agentxm/axm/actions/runs/37206770113/job/111449544391).
