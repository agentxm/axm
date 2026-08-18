# Exit codes

| Code | Meaning                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success. Also used for help output and cancelled prompts.                                                                                                                               |
| 1    | Command ran successfully but reported problems requiring attention (e.g., `axm lint` findings, doctor-style checks). Not lint-only — any "ran but found problems" outcome belongs here. |
| 2    | Invalid invocation, confirmable approval required in non-interactive mode, or a named policy override is required. Fix the invocation or use the reported recovery action.              |
| 3    | Resource doesn't exist or isn't visible.                                                                                                                                                |
| 4    | Credentials are missing, expired, or invalid. Sign in again.                                                                                                                            |
| 5    | Signed in, but not authorized for this action.                                                                                                                                          |
| 6    | Conflicts with current state, including a stale execution candidate (already exists, version mismatch, concurrent update). Reconcile and retry.                                         |
| 7    | Rate limited. Retry after a backoff.                                                                                                                                                    |
| 8    | Couldn't reach the remote service (DNS, TCP, TLS, timeout). Usually retryable.                                                                                                          |
| 9    | Input parsed but failed validation. Correct it and retry.                                                                                                                               |
| 10   | Unexpected internal error. Likely a bug — please report it.                                                                                                                             |
| 11   | Service is responsive but temporarily unable to serve.                                                                                                                                  |
| 12   | Quota, storage, or plan limit exhausted.                                                                                                                                                |
| 13   | Progress is waiting on a person to complete an action.                                                                                                                                  |
| 14   | A pending authentication flow expired.                                                                                                                                                  |
| 15   | A person denied or cancelled a pending authentication flow.                                                                                                                             |
| 16   | A bounded operation did not complete before its caller-selected deadline.                                                                                                               |
| 130  | Interrupted by SIGINT. Local candidate-wide transactions roll back before AXM exits.                                                                                                    |

`axm sync --preview --fail-on-change` uses code 1 only when planning succeeds
and finds reconciliation work. Planning blockers and failures keep their normal
exit meanings.

Plan JSON can include `reason` with `approval-required`, `override-required`,
`stale-candidate`, `hard-blocked`, `interrupted`, or `execution-failed`.
`candidateId` identifies the displayed candidate whose material inputs were
revalidated immediately before execution.
