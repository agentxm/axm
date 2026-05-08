# Exit codes

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | Success, including help output and cancelled prompts.      |
| 1    | Internal or uncategorized error.                           |
| 2    | Usage error, such as an unknown flag or CLI parse failure. |
| 3    | Not found.                                                 |
| 4    | Authentication required or invalid.                        |
| 5    | Forbidden — authenticated but lacking permission.          |
| 6    | Conflict, such as a publish version that already exists.   |
| 7    | Rate limited.                                              |
| 8    | Network error.                                             |
| 9    | Validation error.                                          |
| 130  | Signal termination, such as SIGINT or SIGTERM.             |
