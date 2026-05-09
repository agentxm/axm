# Exit codes

| Code | Meaning                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 0    | Success. Also used for help output and cancelled prompts.                                                |
| 1    | Command ran, but reported issues that need attention (e.g. `axm lint` findings).                         |
| 2    | Invalid command, flags, or arguments. Fix the invocation.                                                |
| 3    | Resource doesn't exist or isn't visible.                                                                 |
| 4    | Credentials are missing, expired, or invalid. Sign in again.                                             |
| 5    | Signed in, but not authorized for this action.                                                           |
| 6    | Conflicts with current state (already exists, version mismatch, concurrent update). Reconcile and retry. |
| 7    | Rate or quota exceeded. Retry after a backoff.                                                           |
| 8    | Couldn't reach the remote service (DNS, TCP, TLS, timeout). Usually retryable.                           |
| 9    | Input parsed but failed validation. Correct it and retry.                                                |
| 10   | Unexpected internal error. Likely a bug — please report it.                                              |
