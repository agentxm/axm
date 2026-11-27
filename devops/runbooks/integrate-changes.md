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
3. With a clean checkout of the candidate, run `git push origin HEAD:main`.
   The pre-push hook inspects the destination, establishes the advertised remote
   base and candidate, and runs `pnpm run verify:integration`. It checks the
   complete commit range and invokes `verify:integration:source`, whose current
   check inventory lives in `package.json`, then runs the published
   `test:e2e:affected` workflow for affected, host-compatible E2E checks. A
   failure in either stage blocks the push; E2E runs only after source verification
   succeeds. Platform-specific assurance remains in CI. After both stages, the
   gate rechecks HEAD and checkout cleanliness. It refuses dirty state, an unchecked
   source ref, history rewrites, and generated changes left by verification.
   Dependency installation activates Husky; do not disable hooks for integration.
4. If another writer advances main, the normal push fails. Fetch, rebase, and
   retry verification. Never force-push main or reuse a result after rebasing.
   For a missing base object, fetch first. For generated-file drift, inspect and
   commit the correction before retrying. A failed check leaves main unchanged.
5. Record the integrated SHA and observe its main-push CI. CI selects changes since its last successful main run so failed or
   superseded pushes remain covered. Integration does not wait for hosted CI, but failed assurance requires prompt repair or a revert
   through this same local procedure. Release/deployment qualification remains
   blocked until the selected revision has the required successful evidence.
   Delete the worktree/branch only after confirming its valuable work is preserved.

For an explicit reproduction, set `NX_BASE` to the fetched full main SHA and
`NX_HEAD` to the clean checked-out candidate SHA, then invoke
`pnpm run verify:integration`. The hook repeats the Git checks at push time and
Nx reuses only input-bound cacheable results. Do not add a separate pass-stamp cache.
A local hook is trusted-team feedback, not a server-side security boundary.

## GitHub controls

The server policy for `main` is:

- Linear history, force-push and deletion prohibitions, administrator
  enforcement, and conversation resolution apply.
- No merge queue, required PR review, or required status check gates main
  integration. The disabled queue ruleset `23123200` is retained for recovery.
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

Retain candidate/base SHAs, verification results, the PR when used, main-push CI,
and GitHub setting readback. Hook fixtures exercise ordinary branch handoffs,
main-ref dispatch, ordered source/E2E verification, stale/dirty candidates,
post-E2E HEAD and output changes, and a real push whose failed E2E check leaves
an isolated remote's main unchanged. Review this runbook when hooks, verification, access, or
release qualification changes.
