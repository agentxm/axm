# Exit codes

| Code | JSON code     | Meaning                                                                                                                                                                                                 |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    |               | Success. Also used for help output and cancelled prompts.                                                                                                                                               |
| 1    | issues        | Ran, but reported problems requiring attention: lint findings, a preview whose --fail-on-change found divergence, or a partial outcome. Any "ran but found problems" outcome belongs here.              |
| 2    | usage         | Invalid invocation, approval-required, or override-required. Fix the invocation or use the reported recovery action.                                                                                    |
| 3    | not_found     | Resource doesn't exist or isn't visible.                                                                                                                                                                |
| 4    | auth          | Credentials were rejected, are invalid, or expired. Sign in again.                                                                                                                                      |
| 5    | forbidden     | Signed in, but not authorized for this action.                                                                                                                                                          |
| 6    | conflict      | Conflicts with current state: stale-candidate, resource-conflict, policy-excluded, or dependency-cycle (including existing resources, version mismatches, and concurrent updates). Reconcile and retry. |
| 7    | rate_limit    | Rate limited. Retry after a backoff.                                                                                                                                                                    |
| 8    | network       | Couldn't reach the remote service (DNS, TCP, TLS). Usually retryable.                                                                                                                                   |
| 9    | validation    | Input parsed but failed validation. Correct it and retry.                                                                                                                                               |
| 10   | internal      | Unexpected internal error. Likely a bug — please report it.                                                                                                                                             |
| 11   | unavailable   | Service is responsive but temporarily unable to serve.                                                                                                                                                  |
| 12   | quota         | Quota, storage, or plan limit exhausted.                                                                                                                                                                |
| 13   | auth_required | Authentication or authorization is waiting on a person to complete a required action.                                                                                                                   |
| 14   | auth_expired  | A pending authentication flow expired.                                                                                                                                                                  |
| 15   | auth_denied   | A person denied or cancelled a pending authentication flow.                                                                                                                                             |
| 16   | timeout       | A bounded operation did not complete before its deadline, including a caller-selected wait.                                                                                                             |
| 130  |               | Interrupted by SIGINT. Unsettled local work follows its rollback contract; committed effects remain reported.                                                                                           |
| 141  |               | Output consumer closed the pipe. Output delivery was cancelled.                                                                                                                                         |
| 143  |               | Terminated by SIGTERM. Unsettled local work follows its rollback contract; committed effects remain reported.                                                                                           |

`axm sync --preview --fail-on-change` uses code 1 only when planning succeeds
and finds reconciliation work. Planning blockers and failures keep their normal
exit meanings.

`axm check` is a query. A negative or incomplete assessment completes with
`outcome: "completed"`, `ok: false`, and exit 1. Missing or ambiguous explicit
selections remain in that assessment. Workspace construction and unexpected
execution failures keep their normal error codes; they are not negative
assessment verdicts.

A verification or output-delivery failure after a write does not imply that no
change occurred. Inspect the reported effects and settlement before retrying.

Plan JSON carries `candidateId`, which identifies the displayed candidate whose
material inputs were revalidated immediately before execution.

Pending device sign-in uses exit 13 in both human and JSON modes. Its ordinary
result reports `mode: "apply"`, `outcome: "pending-human"`, and `ok: false`,
with the verification URL, code, expiry, and resume action preserved. Starting
the handoff does not establish a signed-in session.
