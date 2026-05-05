# Exit codes

axm uses stable process exit codes so scripts can distinguish success, usage
errors, runtime errors, and signal termination.

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| 0    | Success, including help output and cancelled prompts.   |
| 1    | Runtime or domain error reported as an AppError.        |
| 2    | CLI usage or validation error, such as an unknown flag. |
| 130  | Signal termination, such as SIGINT or SIGTERM.          |

In JSON output mode, AppError failures use a stable error code shaped like
`AREA_REASON`, plus a human-readable message and the same process exit code.
