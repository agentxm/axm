---
observed_at: "2026-09-25T15:25:00Z"
session: "z4n8"
area: "public pull-request update"
---

# gh pr edit failed while updating the pull-request body

## Context

The public PR body needed current verification and specification disposition details.

## Friction

`gh pr edit 450 --body-file` failed with a GraphQL error about deprecated Projects classic `projectCards`.

## Cost / impact

The PR body remained stale until a separate API update succeeded.

## Outcome

The exact body was written to a temporary JSON request and submitted through `gh api --method PATCH` for the same pull request.

## Evidence

The failed command returned `GraphQL: Projects (classic) is being deprecated ... (repository.pullRequest.projectCards)`. The REST update returned the public PR URL.
