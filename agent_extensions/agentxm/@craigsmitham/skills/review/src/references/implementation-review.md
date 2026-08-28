# Implementation review

Assess the realized candidate independently from Requirement satisfaction and
Architecture realization. Inspect proportionately:

- correctness, edge cases, validation, and error handling;
- failure propagation, containment, resources, cleanup, and recovery;
- security, privacy, safety, and authorization boundaries;
- ordering, concurrency, consistency, retries, and idempotency;
- compatibility, data or schema migration, and reversible transitions;
- maintainability, comprehensibility, cohesion, and unnecessary complexity;
- observability, operational behavior, rollout, rollback, and recovery;
- change isolation, generated artifacts, and unrelated regressions;
- conformance with the accepted Change Design or explained divergence; and
- repository-local Implementation-conformance Protocols and other checks.

Do not promote style preference into correctness. Treat local checks as
evidence for the exact units and contracts they exercise. If a durable or
release-critical expectation is discovered only here, report a candidate
Requirement, Architecture, or semantic Protocol gap instead of letting a local
test become the authority.
