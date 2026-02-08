## MODIFIED Requirements

### Requirement: Single job with serialized concurrency

The plan builder SHALL create a single job with `concurrency: 1` to serialize skill installations and prevent lockfile write races.

#### Scenario: Single job with concurrency 1

- **WHEN** building a plan from any set of operations
- **THEN** the plan SHALL contain exactly one job with `concurrency: 1`
