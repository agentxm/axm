# Review

Performs either a focused, read-only checkpoint review during implementation or
an independent integrated review of one exact final candidate. It keeps
Requirement satisfaction, Architecture realization, semantic Evaluation
quality, Implementation quality, and whole-change integrity distinct while
returning a compact decision, owned actions, findings, unknowns, and review
boundary. The result is decision-first, uses stable `A-<n>`, `F-<n>`, and
`U-<n>` references, and keeps comparison tables narrow.

Review is a deliberate Gen Stack stage. Select `$review` explicitly; ordinary
code-review or readiness-review requests do not activate this workflow.

Detailed review lenses guide assessment without being dumped into the result.
The skill never mutates or releases its subject.

Install this non-standalone skill through `@craigsmitham/packs/gen-stack`.

## License

MIT
