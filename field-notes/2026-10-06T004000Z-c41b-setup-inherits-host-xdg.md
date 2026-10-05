---
observed_at: "2026-10-06T00:40:00Z"
session: "c41b7d2e"
area: "CLI setup test isolation"
---

# Inherited XDG configuration can escape the setup fixture

## Context

The CLI source partition for public PR #520 failed twice in the user-scope setup test, while all 59 setup tests and the full 3,607-test CLI suite passed locally.

## Friction

Both hosted failures reported an empty-detail conflict with the recovery text `Preserve the conflicting artifact and inspect workspace ownership`. The fixture replaced HOME but copied the rest of the process environment into its ConfigProvider. A local run with XDG_CONFIG_HOME inside another workspace reproduced the same conflict; an external XDG directory without the other workspace marker passed.

## Outcome

The fixture now defaults XDG_CONFIG_HOME inside its temporary home. All 59 setup tests passed with the conflicting external XDG path still present in the parent environment. Production ownership guards were unchanged. Hosted verification of the correction remains pending.

## Evidence

CI run 37389414775, failed jobs 112031414759 and 112040508275; `apps/cli/src/root/setup.test.ts`, case `creates settings in the user workspace without touching the project workspace`.
