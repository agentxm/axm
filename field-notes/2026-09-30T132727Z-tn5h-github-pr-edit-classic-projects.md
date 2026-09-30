---
observed_at: "2026-09-30T13:27:27Z"
session: "tn5h"
area: "GitHub CLI"
---

# Pull request body update failed on a retired GraphQL field

## Context

The repository-pinned GitHub CLI was updating PR #496 after a successful branch push.

## Friction

`gh pr edit --body-file` exited with a GraphQL error about Projects (classic), naming `repository.pullRequest.projectCards`. The push itself had succeeded.

## Outcome

The body was updated through `gh api --method PATCH repos/agentxm/axm/pulls/496 --input` using a JSON file. A subsequent pull-request read returned the updated body and expected head. No repository settings were changed.
