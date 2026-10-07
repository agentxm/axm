---
observed_at: "2026-10-07T15:40:14Z"
session: "rci-r7c9"
area: "GitHub pull-request description update"
---

# PR description update required the REST API

`gh pr edit 534 --body-file ...` failed while updating verification evidence,
with a GraphQL error referring to deprecated Projects classic and
`repository.pullRequest.projectCards`. A subsequent REST PATCH of the pull
request's `body` succeeded and returned the expected PR and source revision.
The workaround required serializing the existing Markdown into a JSON request
file and making one additional update request.
