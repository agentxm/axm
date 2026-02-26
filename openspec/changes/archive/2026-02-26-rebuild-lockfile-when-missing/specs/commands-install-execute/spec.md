## ADDED Requirements

### Requirement: Command install operations declare lockfile materialization policy

`install-command` operations SHALL declare lockfile policy metadata as `materialize_if_missing` so missing/invalid lockfile reconciliation is triggered consistently during plan augmentation.

#### Scenario: Command install policy is materialize

- **WHEN** a plan includes `install-command`
- **THEN** operation metadata SHALL expose `lockfilePolicy: "materialize_if_missing"`

### Requirement: Command install execution is gated by reconciliation failures

When reconciliation operations are injected before `install-command` under `materialize_if_missing`, failures in injected reconciliation steps MUST prevent execution of requested command install steps.

#### Scenario: Reconciliation failure blocks command install

- **WHEN** a plan includes `install-command`
- **AND** an injected reconciliation step returns `error`
- **THEN** `install-command` SHALL NOT execute
