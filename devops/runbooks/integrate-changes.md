---
type: Runbook
title: Integrate changes
description: Share unfinished work across machines and integrate an accepted, locally verified change into main.
status: stable
---

# Integrate changes

Use this procedure to hand work to another human or agent, or to integrate an
accepted change. It applies to trusted maintainers using the pinned local
workstation toolchain. External contributors submit a PR for maintainer
acceptance. Release publication and production deployment require separate
authorization and use their existing runbooks.

## Share work

Work in an isolated branch/worktree. Commits and pushes to branches other than
`main` run no repository verification hooks. WIP commits are welcome on those
branches. Keep secrets out of every commit; public repositories also exclude
private coordination context, including branch names and commit messages.

Commit and push the branch, then hand off its remote name, full commit SHA,
intent, remaining work, and checks already run or still needed. The receiving
agent fetches that exact revision into its own worktree. Do not rewrite a shared
handoff branch without coordinating with its other writers.

A branch push alone starts no CI. Opening a PR explicitly requests hosted
verification and review; later PR updates refresh that verification. For checks
without a PR, dispatch `ci.yml` at the branch. A passing branch run is evidence
for that revision, not permission to publish or deploy it.

## Integrate locally

1. Confirm acceptance and delivery authorization. Fetch `origin main`, then
   rebase the working branch onto `origin/main`. Fold WIP and fixup commits into
   coherent changes. Resolve conflicts before verification. Coordinate agents
   sharing one workstation so they do not integrate competing candidates at once.
2. Run the narrow relevant target while developing. Run real database, Worker,
   browser, or platform checks when the changed behavior needs that evidence;
   source checks cannot establish those properties. Format with `pnpm run format`,
   then commit all intended changes. Each retained commit must be coherent.
3. Push the clean candidate with `git push origin HEAD:main`. The main-only
   hook runs `verify:integration` for the advertised range. If main advances,
   fetch, rebase and retry. Resolve failed checks before retrying.
4. A land-only request ends when Git accepts the push. Report the full SHA and
   its hosted status (awaiting checkpoint, running, green or failed). For an
   explicit monitoring or release request, follow the named revision through
   the requested confirmation.

## Hosted verification

Every 90 minutes, unverified changes on `main` are batched from the most
recent ancestor with successful qualifying CI. Failed or cancelled runs leave
those changes in the next batch. An unchanged head starts no runner. PR checks
and full scheduled verification keep their own triggers.

For immediate verification, give a maintainer the full commit SHA from
`main`. Check the run and its revision in [GitHub Actions](https://github.com/agentxm/axm/actions/workflows/ci.yml).
An existing qualifying run can satisfy the request. A landed repair gets
immediate verification of its own commit. A prepared release receives
immediate CI that produces its publication artifacts through the
[release procedure](release-cli.md).

## GitHub controls

The server policy for `main` is:

- Linear history, force-push and deletion prohibitions, administrator
  enforcement, and conversation resolution apply.
- No merge queue, required PR review, or required status check gates main
  integration.
- Automatic PR merging is disabled; rebase is the only PR merge method, and
  merged branches are deleted automatically. Maintainers integrate through the
  local gate; prepared release candidates retain their release-runbook procedure.
- Repository write access is limited to trusted maintainers. External
  contributors use forks and require maintainer acceptance. Do not grant broad
  write access to make a handoff possible.
- Release environments, publication credentials, and deployment gates remain.
  A successful local integration does not replace their authorization.

When changing these settings, review the complete protection payload and
preserve any additional restrictions. Read back
`/repos/agentxm/axm/rules/branches/main`,
`/repos/agentxm/axm/branches/main/protection`, and repository merge settings
before and after the change. Do not delete the whole protection object or
broaden credentials or permissions.

If direct integration needs to be suspended, restore required PR/status checks;
restore the queue only together with a workflow that handles `merge_group`
again. Never leave a required check with no event that can produce it.

## Evidence and maintenance

Retain candidate/base SHAs, verification results, the PR when used, hosted CI,
and GitHub setting readback. Hook fixtures exercise ordinary branch handoffs,
main-ref dispatch, ordered source/E2E verification, stale/dirty candidates,
post-E2E HEAD and output changes, and a real push whose failed E2E check leaves
an isolated remote's main unchanged. Review this runbook when hooks, verification, access, or
release qualification changes.
