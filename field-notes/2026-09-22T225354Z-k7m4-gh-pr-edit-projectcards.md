---
observed_at: "2026-09-22T22:53:54Z"
session: "k7m4"
area: "GitHub CLI pull-request editing"
---

# gh pr edit failed while updating a verification checkbox

## Context

The AXM extension update pull request had passed local `pnpm run verify:pr`. The agent attempted to update the PR description to mark that check complete.

## Friction

`gh pr edit 426 --repo agentxm/axm --body-file /tmp/axm-extension-pr-body.md` exited 1 with a GraphQL error about the deprecated `repository.pullRequest.projectCards` field. The PR description was not updated by that command.

## Cost / impact

The attempted edit failed and required an alternate API call. Delay was not measured.

## Outcome

The PR remained open; recovery had not yet been performed when this note was written.

## Evidence

`GraphQL: Projects (classic) is being deprecated in favor of the new Projects experience (repository.pullRequest.projectCards)`.
