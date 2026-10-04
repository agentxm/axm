---
observed_at: "2026-10-04T01:10:03Z"
session: "q8m2"
area: "GitHub pull-request delivery"
---

# Pull-request description editing requested a deprecated Projects field

## Context

A source-verification change was pushed successfully. The next operation used `gh pr edit --body-file` to publish its measured validation evidence.

## Friction

The command failed with a GraphQL error naming `repository.pullRequest.projectCards` and the retirement of GitHub Projects classic. The source push succeeded independently.

## Cost / impact

The description required a separate REST API operation. The CLI failure added one unsuccessful delivery command.

## Outcome

The description update was moved to the pull-request REST endpoint using the same prepared body file.
