# Directory Update Log

## 2026-08-12

* **Creation**: Established the Effect v4 knowledge bundle with twenty guides
  grouped by data modeling, failure, application structure, lifetimes and
  concurrency, platform integration, and verification.
* **Conversion**: Migrated the bodies of twenty retired predecessor skill
  packages into this bundle. Each guide's `sources` entry records the exact
  retired package it came from as a permalink, for attribution only; nothing in
  this bundle reads or requires those packages, and they are no longer
  published. Each guide opens with the routing conditions that were previously
  carried by the predecessor's skill description.
* **Convention**: Adopted `type: Guide` for normative decision guidance
  consulted while making a judgment, reserving `Playbook` for step-wise
  procedures that produce ordered actions. This bundle currently contains no
  `Playbook` concepts.
* **Convention**: Pinned the target version (`Effect 4.0.0-beta.107`) once in
  the root index instead of repeating it in every concept. Version-specific API
  claims are marked inline in the guides that make them, currently
  [Error modeling](/error-modeling.md) and [HTTP API](/http-api.md).
