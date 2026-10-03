---
observed_at: "2026-10-03T01:36:20.410456+00:00"
session: "f4c2"
area: "GitHub CLI"
---

# Pull request edit failed on deprecated Projects query

## Context

Updating the draft native Hook PR description with verification results using `gh pr edit --body-file`.

## Friction

The command exited 1 with a GraphQL Projects classic deprecation error at `repository.pullRequest.projectCards`.

## Outcome

The GitHub REST pull-request PATCH endpoint accepted the same description through a JSON input file. The update required one retry.
