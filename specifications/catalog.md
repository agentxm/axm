# AXM specification catalog

Generated from `specifications/` metadata by `scripts/specification-catalog.ts`.
Do not edit by hand: run `pnpm run generate` after a specification change.
This catalog lists every authoritative requirement whether or not its
implementation currently passes; execution evidence lives in test results,
never here. Requirements are organized by their role in the product contract:
product behavior, programmatic interfaces, and supporting system behavior.

## Product behavior

### CLI

#### Activation Follows Desired State

##### Activation commands change realized surfaces without touching content or resolutions

- Requirement: `cli/activation-follows-desired-state`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../packages/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Source: [`specifications/cli/activation-follows-desired-state.spec.ts`](../specifications/cli/activation-follows-desired-state.spec.ts)

#### Agents

##### Agent membership changes update the durable target set and its owned outputs together

- Requirement: `cli/agents/membership-changes-realize-affected-outputs`
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/agent-membership.e2e.test.ts`](../packages/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/agents/membership-changes-realize-affected-outputs.spec.ts`](../specifications/cli/agents/membership-changes-realize-affected-outputs.spec.ts)

#### Changes Do Not Interleave

##### Concurrent changes to one workspace never interleave

- Requirement: `cli/changes-do-not-interleave`
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/changes-do-not-interleave.spec.ts`](../specifications/cli/changes-do-not-interleave.spec.ts)

#### Command Help Is Complete And Alias Free

##### Every supported command presents help and no alias routes exist

- Requirement: `cli/command-help-is-complete-and-alias-free`
- Class: functional
- Role: experience
- Product goals: `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/command-help-is-complete-and-alias-free.spec.ts`](../specifications/cli/command-help-is-complete-and-alias-free.spec.ts)

#### Every Type Completes The Shared Lifecycle

##### Every extension type completes the shared install and removal lifecycle

- Requirement: `cli/every-type-completes-the-shared-lifecycle`
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../packages/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/every-type-completes-the-shared-lifecycle.spec.ts`](../specifications/cli/every-type-completes-the-shared-lifecycle.spec.ts)

#### Force Bypasses Only Named Policies

##### Force flags exist only for explicitly named forceable policies

- Requirement: `cli/force-bypasses-only-named-policies`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract
- Source: [`specifications/cli/force-bypasses-only-named-policies.spec.ts`](../specifications/cli/force-bypasses-only-named-policies.spec.ts)

#### Install

##### Install records direct workspace intent and realizes the extension

- Requirement: `cli/install/direct-intent-recorded-and-realized`
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/direct-intent-recorded-and-realized.spec.ts`](../specifications/cli/install/direct-intent-recorded-and-realized.spec.ts)

##### Workspace install treats inline MCP configuration as sync-owned, not acquirable

- Requirement: `cli/install/inline-mcp-configuration-not-acquirable`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/inline-mcp-configuration-not-acquirable.spec.ts`](../specifications/cli/install/inline-mcp-configuration-not-acquirable.spec.ts)

##### Install rejects a source it cannot install without changing the workspace

- Requirement: `cli/install/non-installable-sources-do-not-mutate`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: property
- Source: [`specifications/cli/install/non-installable-sources-do-not-mutate.spec.ts`](../specifications/cli/install/non-installable-sources-do-not-mutate.spec.ts)

##### Install leaves unrelated configuration and unowned content untouched

- Requirement: `cli/install/preserves-unrelated-and-unowned-state`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts`](../specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts)

##### Install preview describes the plan without changing any state

- Requirement: `cli/install/preview-is-pure`
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preview-is-pure.spec.ts`](../specifications/cli/install/preview-is-pure.spec.ts)

##### Installing an already desired extension at the same constraint is a successful no-op

- Requirement: `cli/install/reinstall-is-idempotent`
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/reinstall-is-idempotent.spec.ts`](../specifications/cli/install/reinstall-is-idempotent.spec.ts)

##### Root install and the type command express the same durable intent

- Requirement: `cli/install/root-and-type-forms-express-same-intent`
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts`](../specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts)

#### Instructions

##### Instruction-file management is inspected, enabled, and disabled explicitly

- Requirement: `cli/instructions/management-is-explicit`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/instructions/management-is-explicit.spec.ts`](../specifications/cli/instructions/management-is-explicit.spec.ts)

#### Lint

##### Lint fix repairs only state determined by local authority

- Requirement: `cli/lint/fix-repairs-only-determined-state`
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/lint/fix-repairs-only-determined-state.spec.ts`](../specifications/cli/lint/fix-repairs-only-determined-state.spec.ts)

##### Local lint honors configured rule severities

- Requirement: `cli/lint/honors-configured-rule-severities`
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/honors-configured-rule-severities.spec.ts`](../specifications/cli/lint/honors-configured-rule-severities.spec.ts)

##### Lint reports invariant violations without changing any workspace state

- Requirement: `cli/lint/reports-facts-without-mutation`
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/reports-facts-without-mutation.spec.ts`](../specifications/cli/lint/reports-facts-without-mutation.spec.ts)

#### Lock State Never Creates Reachability

##### A lockfile row alone never makes an extension desired or retained

- Requirement: `cli/lock-state-never-creates-reachability`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Source: [`specifications/cli/lock-state-never-creates-reachability.spec.ts`](../specifications/cli/lock-state-never-creates-reachability.spec.ts)

#### Managed Projection Guidance Respects Authority

##### Managed projections name editable sources only when the workspace owns them

- Requirement: `cli/managed-projection-guidance-respects-authority`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/managed-projection-guidance-respects-authority.spec.ts`](../specifications/cli/managed-projection-guidance-respects-authority.spec.ts)

#### Mcps

##### Inline MCP entries stay authoritative workspace configuration realized only by sync

- Requirement: `cli/mcps/inline-authority-is-operation-coherent`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/cli/mcps/inline-authority-is-operation-coherent.spec.ts`](../specifications/cli/mcps/inline-authority-is-operation-coherent.spec.ts)

##### The inline MCP server lifecycle is explicit and safe to repeat

- Requirement: `cli/mcps/inline-lifecycle-is-idempotent`
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI end to end so the inline MCP add/uninstall cycle proves argv parsing, exit codes, JSON envelopes on stdout, and native agent config files on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts`](../specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts)

#### Mutations Are Closure Atomic

##### A failed workspace mutation leaves every authoritative state family unchanged

- Requirement: `cli/mutations-are-closure-atomic`
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/mutations-are-closure-atomic.spec.ts`](../specifications/cli/mutations-are-closure-atomic.spec.ts)

#### Packs

##### Authored packs grow membership that stays reachable through the pack

- Requirement: `cli/packs/authored-packs-expand-membership`
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/packs.e2e.test.ts`](../packages/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/packs/authored-packs-expand-membership.spec.ts`](../specifications/cli/packs/authored-packs-expand-membership.spec.ts)

#### Publish

##### Publish preview evaluates the fixed publication gate and distributes nothing

- Requirement: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`specifications/cli/publish/preview-is-pure-and-gate-is-fixed.spec.ts`](../specifications/cli/publish/preview-is-pure-and-gate-is-fixed.spec.ts)

##### Publish refuses extensions the workspace does not author

- Requirement: `cli/publish/requires-established-authorship`
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/publish/requires-established-authorship.spec.ts`](../specifications/cli/publish/requires-established-authorship.spec.ts)

#### Settings Validity Gates Operations

##### Workspace operations begin only after both settings sources validate

- Requirement: `cli/settings-validity-gates-operations`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts`](../packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts) — Proves at the real process boundary what the in-memory harness cannot: the shipped command wiring routes every sampled command family through the settings gate, machine stdout stays a valid document separated from stderr diagnostics, exit codes are nonzero, and version and help remain outside the gate.
- Source: [`specifications/cli/settings-validity-gates-operations.spec.ts`](../specifications/cli/settings-validity-gates-operations.spec.ts)

#### Sync

##### Sync never changes configuration and never advances a satisfying resolution

- Requirement: `cli/sync/preserves-configuration-and-resolutions`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts`](../specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts)

##### Sync restores managed state until it agrees with desired state

- Requirement: `cli/sync/realizes-desired-state`
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/realizes-desired-state.spec.ts`](../specifications/cli/sync/realizes-desired-state.spec.ts)

#### Uninstall

##### Uninstalling an extension the workspace does not desire is a safe no-op

- Requirement: `cli/uninstall/is-idempotent`
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/root-uninstall.e2e.test.ts`](../packages/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/is-idempotent.spec.ts`](../specifications/cli/uninstall/is-idempotent.spec.ts)

##### Uninstall removes direct intent and keeps state another desired route still reaches

- Requirement: `cli/uninstall/removes-direct-route-and-recomputes-reachability`
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/root-uninstall.e2e.test.ts`](../packages/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts`](../specifications/cli/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts)

#### Update

##### Update advances the accepted resolution within durable intent

- Requirement: `cli/update/advances-resolution-within-intent`
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs the real skills update command against a changed local source, proving the accepted content identity advances while configuration stays byte-identical, disabled entries are skipped, and preview applies nothing — local-source advancement the in-memory root update surface does not expose.
- Source: [`specifications/cli/update/advances-resolution-within-intent.spec.ts`](../specifications/cli/update/advances-resolution-within-intent.spec.ts)

#### Workspace Lockfile Rejections Name State And Recovery

##### Workspace lockfile rejections name the observed state and a safe recovery route

- Requirement: `cli/workspace-lockfile-rejections-name-state-and-recovery`
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table, example, invariant
- Additional evidence: process via [`packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts`](../packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts) — Proves the shipped command wiring emits exit 9 and one structured error document, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, and uses the shared schema diagnosis for a Knowledge command.
- Source: [`specifications/cli/workspace-lockfile-rejections-name-state-and-recovery.spec.ts`](../specifications/cli/workspace-lockfile-rejections-name-state-and-recovery.spec.ts)

### System

#### Installability

##### AXM installs through its supported channels with integrity verification

- Requirement: `system/installability/product-installs-through-supported-channels`
- Class: installability
- Role: experience
- Product goals: `platform-reach`, `trustworthy-distribution`
- Boundary: repository; selection: release-candidate
- Methods: contract
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout, proving checksum verification, PATH guidance, and a working installed product.
- Source: [`specifications/system/installability/product-installs-through-supported-channels.spec.ts`](../specifications/system/installability/product-installs-through-supported-channels.spec.ts)

#### Security

##### Telemetry collection follows only the operator's environment consent

- Requirement: `system/security/telemetry-consent-and-precedence`
- Class: security
- Role: experience
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Source: [`specifications/system/security/telemetry-consent-and-precedence.spec.ts`](../specifications/system/security/telemetry-consent-and-precedence.spec.ts)

##### Telemetry collection or delivery failure is invisible to the operation

- Requirement: `system/security/telemetry-failure-never-alters-outcomes`
- Class: functional
- Role: experience
- Product goals: `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/system/security/telemetry-failure-never-alters-outcomes.spec.ts`](../specifications/system/security/telemetry-failure-never-alters-outcomes.spec.ts)

## Programmatic interfaces

### CLI

#### Exit Codes Match Published Reference

##### The published exit-code reference matches the runtime exit codes

- Requirement: `cli/exit-codes-match-published-reference`
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/exit-codes-match-published-reference.spec.ts`](../specifications/cli/exit-codes-match-published-reference.spec.ts)

#### Install

##### Machine install output is one complete schema-backed plan document

- Requirement: `cli/install/machine-result-is-schema-backed`
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Additional evidence: process via [`packages/cli-e2e/src/cli-commands/skills/install/output-ux.e2e.test.ts`](../packages/cli-e2e/src/cli-commands/skills/install/output-ux.e2e.test.ts) — Observes the real process stdout document and stderr diagnostics of the shipped CLI, which the in-memory renderer capture cannot prove.
- Source: [`specifications/cli/install/machine-result-is-schema-backed.spec.ts`](../specifications/cli/install/machine-result-is-schema-backed.spec.ts)

#### Lint

##### Every supported lint rule has a stable default and input scope

- Requirement: `cli/lint/catalog-is-complete`
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Source: [`specifications/cli/lint/catalog-is-complete.spec.ts`](../specifications/cli/lint/catalog-is-complete.spec.ts)

##### Lint findings identify the violated invariant and affected subject as facts

- Requirement: `cli/lint/findings-name-the-violated-invariant`
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/findings-name-the-violated-invariant.spec.ts`](../specifications/cli/lint/findings-name-the-violated-invariant.spec.ts)

#### Lockfile Version Errors Expose Structured Problem

##### Lockfile version errors expose a structured machine problem

- Requirement: `cli/lockfile-version-errors-expose-structured-problem`
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Additional evidence: process via [`packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts`](../packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts) — Proves the shipped command wiring emits exit 9 and one structured error document, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, and uses the shared schema diagnosis for a Knowledge command.
- Source: [`specifications/cli/lockfile-version-errors-expose-structured-problem.spec.ts`](../specifications/cli/lockfile-version-errors-expose-structured-problem.spec.ts)

#### Machine Errors Use The Stable Envelope

##### A failed machine invocation still emits the stable error envelope

- Requirement: `cli/machine-errors-use-the-stable-envelope`
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Additional evidence: process via [`packages/cli-e2e/src/smoke.e2e.test.ts`](../packages/cli-e2e/src/smoke.e2e.test.ts) — Observes the shipped process streams under --json: exactly one stdout document per invocation, NDJSON diagnostics on stderr, and the redacted error envelope for failing and defect invocations — channel separation the in-memory renderer capture cannot prove.
- Source: [`specifications/cli/machine-errors-use-the-stable-envelope.spec.ts`](../specifications/cli/machine-errors-use-the-stable-envelope.spec.ts)

#### Machine Mode Never Prompts

##### Machine output mode terminates deterministically instead of prompting

- Requirement: `cli/machine-mode-never-prompts`
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/machine-mode-never-prompts.spec.ts`](../specifications/cli/machine-mode-never-prompts.spec.ts)

### Extension identity

#### Canonical Names Round Trip

##### A canonical extension name always parses back to the identity that produced it

- Requirement: `extension-identity/canonical-names-round-trip`
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`specifications/extension-identity/canonical-names-round-trip.spec.ts`](../specifications/extension-identity/canonical-names-round-trip.spec.ts)

#### Malformed Names Are Rejected

##### A malformed extension name is rejected with a typed failure naming the input

- Requirement: `extension-identity/malformed-names-are-rejected`
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Source: [`specifications/extension-identity/malformed-names-are-rejected.spec.ts`](../specifications/extension-identity/malformed-names-are-rejected.spec.ts)

### Package identity

#### Companion Packages Are Identities Not Pins

##### A companion package names an ecosystem package identity, never a pinned version

- Requirement: `package-identity/companion-packages-are-identities-not-pins`
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/package-identity/companion-packages-are-identities-not-pins.spec.ts`](../specifications/package-identity/companion-packages-are-identities-not-pins.spec.ts)

#### Compatibility Ranges Match The Package Ecosystem

##### A companion compatibility range is a concrete ecosystem range matching its package identity

- Requirement: `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts`](../specifications/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts)

### Settings contract

#### Published Schemas Agree With Accepted Input

##### The published settings and lockfile schemas describe what the product accepts

- Requirement: `settings-contract/published-schemas-agree-with-accepted-input`
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Source: [`specifications/settings-contract/published-schemas-agree-with-accepted-input.spec.ts`](../specifications/settings-contract/published-schemas-agree-with-accepted-input.spec.ts)

#### Saving Settings Preserves Authored Formatting

##### Saving settings preserves authored formatting, ordering, and unrecognized content

- Requirement: `settings-contract/saving-settings-preserves-authored-formatting`
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: golden-output, example
- Source: [`specifications/settings-contract/saving-settings-preserves-authored-formatting.spec.ts`](../specifications/settings-contract/saving-settings-preserves-authored-formatting.spec.ts)

### Source resolution

#### Locator Grammar Is Stable

##### Source locators resolve through a stable grammar and configured hosts

- Requirement: `source-resolution/locator-grammar-is-stable`
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`specifications/source-resolution/locator-grammar-is-stable.spec.ts`](../specifications/source-resolution/locator-grammar-is-stable.spec.ts)

### System

#### Security

##### Telemetry payloads carry only the documented observation fields

- Requirement: `system/security/telemetry-payloads-respect-data-boundary`
- Class: security
- Role: interface
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: golden-output
- Source: [`specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts`](../specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts)

### Version constraints

#### Constraint Intersection Preserves Every Limit

##### Combining version constraints keeps every contributor's limits or reports the combination unsatisfiable

- Requirement: `version-constraints/constraint-intersection-preserves-every-limit`
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`specifications/version-constraints/constraint-intersection-preserves-every-limit.spec.ts`](../specifications/version-constraints/constraint-intersection-preserves-every-limit.spec.ts)

#### Range Satisfaction Follows Semver

##### A version constraint accepts exactly the versions its semver range allows

- Requirement: `version-constraints/range-satisfaction-follows-semver`
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, decision-table, example
- Source: [`specifications/version-constraints/range-satisfaction-follows-semver.spec.ts`](../specifications/version-constraints/range-satisfaction-follows-semver.spec.ts)

## Supporting system behavior

### System

#### Architecture

##### End-to-end suites reach the product only as a shipped artifact, never as imported code

- Requirement: `system/architecture/e2e-observes-only-shipped-artifacts`
- Class: architecture
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts`](../specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts)

##### Environment-backed service composition happens only in the application composition root

- Requirement: `system/architecture/live-composition-stays-in-application`
- Class: architecture
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Bound evidence: `lint: no-restricted-imports (@agentxm/*/live, @agentxm/*/testing)` — Rejects concrete environment-backed Layer imports and in-memory port imports from production source outside the application composition root, while tests and specifications keep their sanctioned exceptions.
- Source: [`specifications/system/architecture/live-composition-stays-in-application.spec.ts`](../specifications/system/architecture/live-composition-stays-in-application.spec.ts)

##### Production package dependencies point inward, stay acyclic, and keep features isolated

- Requirement: `system/architecture/package-dependencies-point-inward`
- Class: architecture
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Bound evidence: `lint: @nx/enforce-module-boundaries` — Rejects outward or feature-to-feature workspace imports, undeclared transitive dependencies, external imports outside a constrained package's budget, and dependency cycles across every production project.
- Bound evidence: `lint: @nx/dependency-checks` — Keeps each buildable package manifest aligned with its actual imports so the graph Nx derives is truthful.
- Source: [`specifications/system/architecture/package-dependencies-point-inward.spec.ts`](../specifications/system/architecture/package-dependencies-point-inward.spec.ts)

##### The public system depends on private platform responsibilities only through published contracts

- Requirement: `system/architecture/public-system-depends-only-on-published-contracts`
- Class: architecture
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts`](../specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts)

##### Specification layout mirrors the command tree and declared identities

- Requirement: `system/architecture/specification-folders-mirror-command-tree`
- Class: architecture
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts`](../specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts)

#### Compatibility

##### Every supported platform and shell receives release-blocking verification

- Requirement: `system/compatibility/supported-platform-matrix`
- Class: compatibility
- Role: supporting
- Product goals: `platform-reach`
- Boundary: repository; selection: platform-matrix
- Methods: contract
- Additional evidence: binary via [`packages/cli-e2e/src/binary-smoke.e2e.test.ts`](../packages/cli-e2e/src/binary-smoke.e2e.test.ts) — Executes the compiled platform binary, proving the shipped artifact starts and answers on the target operating system and architecture.
- Additional evidence: platform via [`packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts`](../packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts) — Exercises workspace mutation semantics on a real Windows filesystem, where path, symlink, and lock behavior differ from POSIX.
- Source: [`specifications/system/compatibility/supported-platform-matrix.spec.ts`](../specifications/system/compatibility/supported-platform-matrix.spec.ts)

#### Process

##### Changes land through human-reviewed pull requests, with requirements changes routed to maintainers

- Requirement: `system/process/changes-land-through-reviewed-pull-requests`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/changes-land-through-reviewed-pull-requests.spec.ts`](../specifications/system/process/changes-land-through-reviewed-pull-requests.spec.ts)

##### The dual TypeScript alias stays in place until its recorded exit condition

- Requirement: `system/process/dual-typescript-alias-retained`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/dual-typescript-alias-retained.spec.ts`](../specifications/system/process/dual-typescript-alias-retained.spec.ts)

##### Changes are verified by one aggregate required check before merge

- Requirement: `system/process/merges-require-aggregate-verification`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/merges-require-aggregate-verification.spec.ts`](../specifications/system/process/merges-require-aggregate-verification.spec.ts)

##### Pre-launch contract changes land as one coherent break without compatibility paths

- Requirement: `system/process/pre-launch-changes-stay-coherent`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/pre-launch-changes-stay-coherent.spec.ts`](../specifications/system/process/pre-launch-changes-stay-coherent.spec.ts)

##### Tracked repository content references no private coordination context

- Requirement: `system/process/public-artifacts-protect-private-context`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/public-artifacts-protect-private-context.spec.ts`](../specifications/system/process/public-artifacts-protect-private-context.spec.ts)

##### Release preparation isolates candidate state until delivery

- Requirement: `system/process/release-preparation-isolates-candidate-state`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `safe-repetition`
- Boundary: repository; selection: per-change
- Methods: model, decision-table
- Source: [`specifications/system/process/release-preparation-isolates-candidate-state.spec.ts`](../specifications/system/process/release-preparation-isolates-candidate-state.spec.ts)

##### Release preparation validates production Registry gates without distribution

- Requirement: `system/process/release-preparation-validates-production-gates`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Methods: contract, decision-table
- Source: [`specifications/system/process/release-preparation-validates-production-gates.spec.ts`](../specifications/system/process/release-preparation-validates-production-gates.spec.ts)

##### Releases publish only through the canonical automated workflow

- Requirement: `system/process/releases-publish-through-canonical-workflow`
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/releases-publish-through-canonical-workflow.spec.ts`](../specifications/system/process/releases-publish-through-canonical-workflow.spec.ts)

## Product goals

- `actionable-diagnostics` — People and agents can understand invalid workspace state and recover it through ordinary commands without a repair workflow.
- `agent-interoperability` — Configured extensions realize correctly and completely for every configured coding agent's native surfaces.
- `authoring-and-creation` — Extension authors can create, evolve, and version workspace-authored extensions with explicit authority transitions.
- `dependable-change-process` — AXM changes and releases land through the governed repository process with required evidence and human approval.
- `extension-adoption` — People and agents can find, install, update, and remove reusable extensions across coding agents through one dependable command surface.
- `knowledge-access` — Installed knowledge and help surfaces let people and agents discover concepts, commands, and contracts without leaving the CLI.
- `machine-automation` — Machine consumers can drive AXM non-interactively with complete, schema-backed results separated from diagnostics.
- `platform-reach` — AXM works on every supported operating system, runtime, shell, and filesystem.
- `privacy-and-consent` — Observation of CLI use stays within the documented data boundary and under the control of the person running the CLI.
- `safe-repetition` — Every operation is safe to repeat and safe to interrupt: reruns are no-ops, failures roll back their closure, and surviving authority converges.
- `trustworthy-distribution` — Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.
- `workspace-intent-fidelity` — Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.
