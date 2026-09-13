---
type: Runbook
title: "Operate the merge queue"
description: "Enqueue accepted AXM changes, inspect synthesized verification, recover rejected entries, and verify or roll back the live GitHub integration gate."
status: stable
applies-to:
  - ../repositories/axm.md
  - ../providers/github.md
---

# Operate the merge queue

Use this runbook after a pull request is accepted, when a queued change fails or
conflicts, or when the live queue configuration must be verified or recovered.
GitHub repository settings are the enforcement authority; this procedure does
not authorize a merge, settings mutation, release, or deployment by itself.
The public queue is active under a dedicated repository ruleset; classic strict
branch protection remains the rollback baseline.

## Preconditions and outcome

Confirm the signed-in GitHub identity, repository administration authority, a
clean source branch, resolved conversations, and a successful pull-request
`Required CI`. The workflow on `main` must declare `merge_group` with
`checks_requested` before the queue is enabled, or required checks cannot report
on synthesized revisions.

Success means the accepted change entered the native queue, `Required CI`
succeeded on the exact merge-group SHA, GitHub squash-merged the resulting entry
without bypass, and the corresponding `main` CI completed. Release publication
and deployment workflows remain eligible only for their explicit trusted-main
events; a `merge_group` run never publishes or deploys.

## Verify the live configuration

Read the `main` rules and repository merge settings before changing them. Retain
the returned JSON as rollback evidence. The intended queue profile is:

| Setting                | Value                                     | Reason                                                                  |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| Merge method           | Squash                                    | Preserve linear history and one reviewed integration commit             |
| Build concurrency      | 2 entries                                 | Exercise useful overlap without multiplying the current hosted workload |
| Merge concurrency      | 1 entry                                   | Make the admitted order and resulting base unambiguous                  |
| Grouping               | All entries green                         | Do not merge one entry from a failing tested group                      |
| Minimum entries / wait | 1 / 0 minutes                             | Start accepted work without an artificial batching delay                |
| Check response timeout | 60 minutes                                | Exceed the current full proposed-change verification budget             |
| Required check         | `Required CI`, GitHub Actions app `15368` | Preserve the existing aggregate gate                                    |
| Bypass                 | None                                      | Apply the integration gate to administrators too                        |

Also retain pull-request, conversation-resolution, force-push, deletion, and
linear-history protections. Read the settings back after mutation; a successful
API response alone is not configuration evidence.

## Enqueue and inspect

After the acceptance decision, enable auto-merge with squash integration:

```bash
gh pr merge <number> --repo agentxm/axm --auto --squash
```

For release pull requests, retain the generated release title and bind the
accepted source commit as described in the [release runbook](release-cli.md).
Do not update the source branch merely because
`main` advances. GitHub creates or replaces a `gh-readonly-queue/main/...`
revision and emits `merge_group.checks_requested`; inspect the CI run and record
that exact head SHA, the pull requests represented by it, and the aggregate
result. Cancellation is isolated by event and merge-group head ref, so a newer
pull-request run, another queue group, or trusted-main run must not cancel it.

After merge, verify the pull request's squash commit is reachable from `main`
and that trusted-main CI ran for that new SHA. The merge-group SHA is temporary
and need not equal the squash commit.

## Recover a rejected entry

- If a required check fails, preserve the failing merge-group run and exact
  revision. Fix the source branch, wait until the pull request reports the new
  head, run its normal `Required CI`, and re-enable auto-merge if GitHub removed
  the entry. Inspect the replacement merge-group tree or relevant workflow
  content before treating it as the repaired candidate. If an entry synthesized
  during a branch update still contains the rejected tree, preserve that second
  failure, let GitHub dequeue it, force a fresh pull-request synchronization,
  verify the new head, and enqueue again. Do not bypass the check or rerun
  unrelated work to hide the failure.
- If the pull request conflicts with the current base, resolve the conflict on
  its source branch once, run the normal pull-request gate, and enqueue it again.
- If an entry was rebuilt because an earlier merge changed its base, treat the
  replacement merge-group SHA as the authoritative integration candidate. No
  author-managed refresh is required unless GitHub reports an actual conflict.

## Controlled verification and rollback

After initial activation or a material workflow/settings change, enqueue two
concurrent eligible pull requests that touch independent files. Confirm both are
tested by the queue and merge in admitted order without author refresh. In a
separate controlled exercise, make one queued candidate fail a deterministic
check or conflict, confirm GitHub prevents its merge and removes or blocks it,
then repair and requeue it. Preserve run URLs, exact SHAs, timestamps, queue
position, and final outcomes for delivery measurement.

### Public activation record: 2026-09-13

The initial public exercise produced this bounded evidence:

- Two independent entries entered together and merged in admitted order without
  author refresh. [Run 34734274728](https://github.com/agentxm/axm/actions/runs/34734274728)
  verified candidate `99eb801bf0fc89cadcff457af56ee31d06ff1008`
  from 02:56:53 through 03:04:40 UTC; pull request 315 merged at 03:04:54.
  [Run 34734309380](https://github.com/agentxm/axm/actions/runs/34734309380)
  verified the following candidate
  `fb15367373cf08c4361e831eb792defdeb33ab2f` from 02:57:49 through
  03:05:56; pull request 314 merged at 03:06:12.
- The controlled rejection candidate
  `132abeace477a703a8d093a0f730a12b6835537a` passed its substantive jobs,
  then failed the intentionally failing aggregate step in
  [run 34735122853](https://github.com/agentxm/axm/actions/runs/34735122853)
  at 03:25:22. GitHub kept the pull request open, prevented the merge, and
  removed the entry.
- An immediate repair/requeue exposed the stale-candidate case described above:
  candidate `4b4c8e002566d3592fccd7abb54772d22553b63c` still contained the
  rejection step. [Run 34736204912](https://github.com/agentxm/axm/actions/runs/34736204912)
  again prevented the merge. The operator inspected the candidate tree, forced
  a fresh pull-request synchronization, and reran the ordinary pull-request
  gate as [run 34736664013](https://github.com/agentxm/axm/actions/runs/34736664013)
  on head `12218a8379470fbdeeaf164cfc9f986c6db9c9f6`.
- The next synthesized tree no longer contained the rejection step.
  [Run 34736959335](https://github.com/agentxm/axm/actions/runs/34736959335)
  verified candidate `334f1e90081c6927e4c548e6708d711666f282a3`
  from 04:02:56 through 04:10:27; GitHub merged it at 04:10:47, 8 minutes
  8 seconds after enqueue. The resulting trusted-main
  [run 34737281577](https://github.com/agentxm/axm/actions/runs/34737281577)
  completed successfully.

This is one two-entry sequence and one controlled recovery on the current
hosted-runner profile. It establishes admission order, failing-check rejection,
and bounded recovery for those revisions. It does not establish a general
throughput or reliability improvement; retain broader reporting evidence and
operator-intervention counts outside this runbook.

If queue behavior can no longer protect `main`, stop enqueueing changes. Restore
the captured pre-change rules by disabling or deleting only the dedicated merge
queue ruleset; leave the strict classic `main` protection, `Required CI`, linear
history, conversation resolution, and force-push/deletion prohibitions intact.
Read back the live rules, then use ordinary strict pull requests until the queue
workflow or entitlement is repaired.
