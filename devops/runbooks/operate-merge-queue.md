---
type: Runbook
title: "Operate the merge queue"
description: "Enqueue accepted AXM changes, inspect synthesized verification, recover rejected entries, and verify or roll back the live GitHub integration gate."
status: draft
applies-to:
  - ../repositories/axm.md
  - ../providers/github.md
---

# Operate the merge queue

Use this runbook after a pull request is accepted, when a queued change fails or
conflicts, or when the live queue configuration must be verified or recovered.
GitHub repository settings are the enforcement authority; this procedure does
not authorize a merge, settings mutation, release, or deployment by itself.

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

For release pull requests, also supply the exact subject required by the
[release runbook](release-cli.md). Do not update the source branch merely because
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
  revision. Fix the source branch, verify it, and re-enable auto-merge if GitHub
  removed the entry. Do not bypass the check or rerun unrelated work to hide the
  failure.
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

If queue behavior can no longer protect `main`, stop enqueueing changes. Restore
the captured pre-change rules by disabling or deleting only the dedicated merge
queue ruleset; leave the strict classic `main` protection, `Required CI`, linear
history, conversation resolution, and force-push/deletion prohibitions intact.
Read back the live rules, then use ordinary strict pull requests until the queue
workflow or entitlement is repaired.
