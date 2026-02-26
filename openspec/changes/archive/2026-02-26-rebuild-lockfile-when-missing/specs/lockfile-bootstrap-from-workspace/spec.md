## ADDED Requirements

### Requirement: Reconcile lockfile from active-scope managed declarations

When lockfile state is `missing` or `invalid`, the system SHALL reconcile lockfile state from the active scope settings (`project` or `user`, never both) across all managed extension types (`skills`, `commands`, `packs`, `mcpServers`).

Reconciliation SHALL be settings-authoritative and disk-assisted:

- declaration intent SHALL come from active-scope settings
- compatible on-disk materialization MAY be used to reconstruct entries without remote fetch
- missing, invalid, or declaration-mismatched entries SHALL be marked unresolved and resolved in the same run when policy requires materialization

#### Scenario: Missing lockfile triggers full cross-extension reconciliation

- **WHEN** lockfile state is `missing`
- **THEN** reconciliation SHALL evaluate all managed declarations in active-scope settings across `skills`, `commands`, `packs`, and `mcpServers`

#### Scenario: Invalid lockfile triggers reconciliation with diagnostics

- **WHEN** lockfile state is `invalid`
- **THEN** reconciliation SHALL proceed using settings + disk state
- **AND** diagnostics SHALL include parse/validation warning details

#### Scenario: Active scope is isolated

- **WHEN** command runs in project scope
- **THEN** reconciliation SHALL NOT read user-scope declarations

### Requirement: Policy-driven plan augmentation is read-only

The system SHALL evaluate lockfile policy during a read-only `augmentPlan` stage in `resolvePlan`.

`augmentPlan` SHALL:

- run before preview/confirmation and before apply
- be pure (no filesystem/network mutations)
- be idempotent for the same input/context
- inject reconciliation operations only from registered operation types

#### Scenario: Preview remains dry-run

- **WHEN** `--preview` is enabled
- **THEN** augmented reconciliation operations SHALL be displayed
- **AND** no changes SHALL be applied

#### Scenario: Recursion is prevented

- **WHEN** `augmentPlan` injects operations marked with `origin: "augmentPlan"`
- **THEN** those operations SHALL NOT be re-augmented in the same resolve pass

### Requirement: Policy and state determine augmentation behavior

The system SHALL derive one effective lockfile policy per plan from operation metadata using precedence:

1. `materialize_if_missing`
2. `read_recover_if_missing`
3. `ignore_if_missing`

The system SHALL use explicit lockfile state probing (`ok` / `missing` / `invalid`) for policy decisions.

#### Scenario: Materialize policy with missing lockfile

- **WHEN** effective policy is `materialize_if_missing`
- **AND** lockfile state is `missing`
- **THEN** plan augmentation SHALL inject reconciliation + materialize operations

#### Scenario: Read-recover policy with invalid lockfile

- **WHEN** effective policy is `read_recover_if_missing`
- **AND** lockfile state is `invalid`
- **THEN** plan augmentation SHALL inject read-recovery operations
- **AND** SHALL NOT inject lockfile materialization

#### Scenario: Ignore policy with invalid lockfile

- **WHEN** effective policy is `ignore_if_missing`
- **AND** lockfile state is `invalid`
- **THEN** plan augmentation SHALL NOT inject reconciliation operations
- **AND** SHALL emit `LOCKFILE_INVALID_IGNORED` warning diagnostics

### Requirement: Materialization failure gates requested operations

Under `materialize_if_missing`, injected reconciliation operations SHALL execute before user-requested operations.

If an injected reconciliation step fails, user-requested operations MUST NOT execute.

#### Scenario: Remote source unavailable during reconciliation

- **WHEN** reconciliation under `materialize_if_missing` requires remote resolution
- **AND** a required source is unreachable
- **THEN** the command SHALL fail without applying user-requested operations
- **AND** diagnostics SHALL include reconstructed counts gathered before failure
