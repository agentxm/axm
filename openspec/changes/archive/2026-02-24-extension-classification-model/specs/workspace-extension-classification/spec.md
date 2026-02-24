## ADDED Requirements

### Requirement: Canonical workspace extension lifecycle taxonomy

The workspace layer SHALL classify extensions per `ExtensionType` (`"skill"`, `"command"`, `"mcp-server"`, `"pack"`) using lifecycle sets `Configured`, `Implicit`, and `Unmanaged` such that `Installed = Configured ∪ Implicit` and `Extensions = Configured ⊎ Implicit ⊎ Unmanaged`.

#### Scenario: Lifecycle partition is disjoint

- **WHEN** classification runs for a workspace snapshot
- **THEN** no extension name SHALL appear in both `Configured` and `Implicit`
- **AND** no extension name SHALL appear in both `Unmanaged` and `Installed`
- **AND** every unignored detected extension name SHALL appear in exactly one lifecycle set

#### Scenario: Skills unmanaged set derived from detection

- **WHEN** a skill name is detected on disk and is neither configured nor implicit
- **THEN** the classifier SHALL include it in `Unmanaged`
- **AND** the classifier SHALL expose it in the full extensions view

#### Scenario: Non-skill unmanaged sets are empty in phase 1

- **WHEN** classification runs for `command`, `mcp-server`, or `pack`
- **THEN** the classifier SHALL return an empty `Unmanaged` set in this change
- **AND** `Installed` SHALL still include configured and implicit entries

### Requirement: Ignored patterns are an orthogonal exclusion set

The settings model SHALL support ignored name patterns per extension type, and classification SHALL exclude ignored names from lifecycle sets and installed views.

#### Scenario: Ignored names are excluded from lifecycle sets

- **WHEN** `ignored.skills` contains `"openspec-*"`
- **AND** detected skill names include `openspec-core` and `commit`
- **THEN** `openspec-core` SHALL be excluded from `Configured`, `Implicit`, `Unmanaged`, and `Installed`
- **AND** `commit` SHALL remain eligible for normal lifecycle classification

#### Scenario: Ignored matching reuses shared glob semantics

- **WHEN** ignored-pattern matching is evaluated
- **THEN** the matcher SHALL reuse shared glob behavior from `skills/glob.ts`
- **AND** only `*` SHALL be treated as wildcard
- **AND** matching SHALL remain case-sensitive and anchored to full names

### Requirement: Source classification metadata is orthogonal to lifecycle

Each classified extension SHALL include `packagingKind` (`native` or `non-native`) and `isBuiltIn`, and these fields SHALL be independent from lifecycle membership.

#### Scenario: Built-in implies native

- **WHEN** a classified extension has `isBuiltIn = true`
- **THEN** its `packagingKind` SHALL be `native`

#### Scenario: External extensions are derived

- **WHEN** classified rows are computed
- **THEN** external extensions SHALL be derived as rows with `packagingKind = non-native`
- **AND** this derived set SHALL be available for configured and unmanaged views

#### Scenario: Packs are native-only

- **WHEN** classification runs for `type = "pack"`
- **THEN** all rows SHALL have `packagingKind = native`
- **AND** no pack row SHALL appear in external-extension views

### Requirement: Classifier rejects invalid lockfile-only non-native rows

Lockfile-only entries that classify as non-native SHALL fail classification with a typed workspace classifier error.

#### Scenario: Lockfile-only non-native skill fails classification

- **WHEN** a skill name exists in lockfile but not settings
- **AND** source metadata resolves its `packagingKind` to `non-native`
- **THEN** classification SHALL fail with `WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY`
- **AND** the error SHALL include actionable remediation guidance
