---
observed_at: "2026-10-03T03:32:35Z"
session: "s8m2"
area: "GitHub CLI pull-request delivery"
---

# PR body editing failed on the classic Projects GraphQL field

## Context

Updating the public feature PR body after Required CI passed.

## Friction

`gh pr edit 504 --repo agentxm/axm --body-file ...` failed with a GraphQL
classic-Projects deprecation error naming `repository.pullRequest.projectCards`.
The chained comment and merge-queue commands did not run.

## Outcome

One failed CLI attempt was replaced by `gh api --method PATCH` against the
pull-request REST resource, with the body supplied through a JSON input file.
That request succeeded and returned PR 504. No repository settings changed.
