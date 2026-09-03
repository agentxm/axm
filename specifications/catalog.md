# AXM specification catalog

Generated from `specifications/` metadata by `scripts/specification-catalog.ts`.
Do not edit by hand: run `pnpm run generate` after a specification change.
This catalog lists every requirement specification whether or not its
implementation currently passes; execution evidence lives in test results,
never here. Every specification in this catalog is normative: a
specification on `main` is accepted authority, and merging the change that
adds, revises, or removes one is the acceptance decision. Requirements are
organized by their role in the product contract: product behavior,
programmatic interfaces, and supporting system behavior.

## Product behavior

### CLI

#### Activation Follows Desired State

##### Activation commands change realized surfaces without touching content or resolutions

- Requirement: `cli/activation-follows-desired-state`
- Statement: When an installed extension is disabled or enabled, the workspace shall record the new activation intent and change only that extension's realized agent surfaces, and shall not alter canonical content or accepted resolutions.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../packages/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Source: [`specifications/cli/activation-follows-desired-state.spec.ts`](../specifications/cli/activation-follows-desired-state.spec.ts)

#### Agent Selection Is Membership Or Filter

##### Agent selection chooses workspace membership or filters a listing, never one extension

- Requirement: `cli/agent-selection-is-membership-or-filter`
- Statement: A command shall accept an agent selection only to choose the workspace's configured agents or to filter a listing, shall reject an unsupported agent identifier before any work begins, and no command shall accept an agent selection that narrows one extension.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `axm setup --agent`, `axm skills list --agent`, `axm subagents list --agent`, `cli/sync/realizes-desired-state`, `cli/agents/membership-changes-realize-affected-outputs`
- Assumptions: The agent catalog shipped with the CLI is the only source of supported agent identifiers, so an identifier outside it can be refused without consulting the workspace.
- Source: [`specifications/cli/agent-selection-is-membership-or-filter.spec.ts`](../specifications/cli/agent-selection-is-membership-or-filter.spec.ts)

#### Agents

##### Adding an already configured coding agent is a successful no-op

- Requirement: `cli/agents/add/add-is-idempotent`
- Statement: When a coding agent the workspace already configures is added again, AXM shall report a no-op outcome and shall not change the agent set or that agent's realized outputs.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Source: [`specifications/cli/agents/add/add-is-idempotent.spec.ts`](../specifications/cli/agents/add/add-is-idempotent.spec.ts)

##### Adding a coding agent records it durably and realizes installed extensions for it

- Requirement: `cli/agents/add/records-membership-and-realizes-outputs`
- Statement: When a coding agent is added to the workspace, AXM shall record it in the durable agent set and realize every installed extension for that agent's native surfaces in one operation.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Additional evidence: process via [`packages/cli-e2e/src/agent-membership.e2e.test.ts`](../packages/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/agents/add/records-membership-and-realizes-outputs.spec.ts`](../specifications/cli/agents/add/records-membership-and-realizes-outputs.spec.ts)

##### Removing a coding agent never removes agent-native content without AXM ownership proof

- Requirement: `cli/agents/remove/preserves-unowned-agent-content`
- Statement: When a coding agent is removed from the workspace, AXM shall remove only agent-native content it can prove it owns and shall leave hand-authored content in the same agent directory untouched.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Additional evidence: process via [`packages/cli-e2e/src/agent-membership.e2e.test.ts`](../packages/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/agents/remove/preserves-unowned-agent-content.spec.ts`](../specifications/cli/agents/remove/preserves-unowned-agent-content.spec.ts)

##### Removing a coding agent retires it together with the outputs only it reached

- Requirement: `cli/agents/remove/removes-membership-and-owned-outputs`
- Statement: When a coding agent is removed from the workspace, AXM shall remove it from the durable agent set and remove the owned outputs no remaining configured agent reaches in one operation, and shall leave every remaining agent's realization untouched.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Additional evidence: process via [`packages/cli-e2e/src/agent-membership.e2e.test.ts`](../packages/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/agents/remove/removes-membership-and-owned-outputs.spec.ts`](../specifications/cli/agents/remove/removes-membership-and-owned-outputs.spec.ts)

#### Changes Do Not Interleave

##### Concurrent changes to one workspace never interleave

- Requirement: `cli/changes-do-not-interleave`
- Statement: When two changes contend for one workspace at the same time, each change shall either apply completely or terminate without applying anything, and a change serialized out shall succeed when rerun afterward.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Assumptions: Contention between separate operating-system processes behaves like contention between concurrent invocations within one process.
- Source: [`specifications/cli/changes-do-not-interleave.spec.ts`](../specifications/cli/changes-do-not-interleave.spec.ts)

#### Command Help Is Complete And Alias Free

##### Every supported command presents help and no alias routes exist

- Requirement: `cli/command-help-is-complete-and-alias-free`
- Statement: Every supported command shall present usable help, the rendered help tree shall list exactly the supported command paths, and no command shall be reachable through an alias route.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Open questions: The alias prohibition is phrased as a pre-launch condition in its scenario; whether alias routes stay prohibited after public launch is unresolved.
- Source: [`specifications/cli/command-help-is-complete-and-alias-free.spec.ts`](../specifications/cli/command-help-is-complete-and-alias-free.spec.ts)

#### Every Type Completes The Shared Lifecycle

##### Every extension type completes the shared install and removal lifecycle

- Requirement: `cli/every-type-completes-the-shared-lifecycle`
- Statement: Every extension type shall complete the shared lifecycle: installing shall record intent, an accepted resolution, canonical content, and realized agent surfaces, and uninstalling shall remove that whole footprint while preserving unrelated workspace files.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Assumptions: Process-boundary end-to-end executions supply the shared-lifecycle evidence for the MCP server and pack extension types.
- Additional evidence: process via [`packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../packages/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/every-type-completes-the-shared-lifecycle.spec.ts`](../specifications/cli/every-type-completes-the-shared-lifecycle.spec.ts)

#### Force Bypasses Only Named Policies

##### Force flags exist only for explicitly named forceable policies

- Requirement: `cli/force-bypasses-only-named-policies`
- Statement: No command shall expose a bare --force flag, and every override flag a command exposes shall name in its help text the one policy it bypasses.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract
- Source: [`specifications/cli/force-bypasses-only-named-policies.spec.ts`](../specifications/cli/force-bypasses-only-named-policies.spec.ts)

#### Install

##### Applying an install realizes exactly the closure its preview described

- Requirement: `cli/install/apply-realizes-the-previewed-closure`
- Statement: When an install preview is followed by an apply of the same request against an unchanged workspace, the install command shall realize exactly the closure the preview described, committing the same plan candidate and the same units, and the described extension shall be present in the workspace afterwards.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Open questions: The install preview lists the closure's units and plan candidate but no artifact paths or target surfaces, while the apply lists both; whether a preview should describe target surfaces, as skill and subagent creation do, is unresolved, so this specification requires agreement on the plan candidate and unit set only.
- Source: [`specifications/cli/install/apply-realizes-the-previewed-closure.spec.ts`](../specifications/cli/install/apply-realizes-the-previewed-closure.spec.ts)

##### Workspace install skips inline MCP configuration without failing

- Requirement: `cli/install/inline-mcp-configuration-is-skipped`
- Statement: When the workspace's configured extensions are installed and workspace settings configure an MCP server inline, the install command shall report that entry as a skipped unit carrying guidance, shall complete without failure, shall not record the entry in the lockfile, and shall leave the inline configuration unchanged.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/inline-mcp-configuration-not-acquirable`
- Supersedes: `cli/install/inline-mcp-configuration-not-acquirable`
- Open questions: The plan result names the entry's state (skipped) but carries the reason only as prose in the unit's message; no structured field says the entry is inline workspace configuration that sync reconciles. Until the plan-result contract names that reason, this specification asserts the skipped state and the presence of guidance and leaves the message wording non-normative.
- Source: [`specifications/cli/install/inline-mcp-configuration-is-skipped.spec.ts`](../specifications/cli/install/inline-mcp-configuration-is-skipped.spec.ts)

##### Install materializes the extension's canonical content inside the workspace

- Requirement: `cli/install/materializes-canonical-content`
- Statement: When a person installs an acquirable extension, the install command shall materialize the extension's canonical content inside the workspace's managed extension tree.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/direct-intent-recorded-and-realized`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/materializes-canonical-content.spec.ts`](../specifications/cli/install/materializes-canonical-content.spec.ts)

##### Install rejects a source it cannot install without changing the workspace

- Requirement: `cli/install/non-installable-sources-do-not-mutate`
- Statement: When the install source is a bare name or names an unknown extension type, the install command shall fail with usage guidance or a not-found outcome and shall not change settings, the lockfile, or workspace content.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: property
- Open questions: Whether an unknown extension type in a registry name fails as usage guidance or as not found is undecided; the scenario accepts either outcome.
- Source: [`specifications/cli/install/non-installable-sources-do-not-mutate.spec.ts`](../specifications/cli/install/non-installable-sources-do-not-mutate.spec.ts)

##### Install leaves unrelated configuration and unowned content untouched

- Requirement: `cli/install/preserves-unrelated-and-unowned-state`
- Statement: When an extension is installed, the install command shall leave hand-authored content in agent directories and unrelated project files byte-for-byte intact and shall preserve every unrelated setting while adding the new declaration.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts`](../specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts)

##### Install preview describes the plan without changing any state

- Requirement: `cli/install/preview-is-pure`
- Statement: When the install command runs in preview mode, it shall report the planned closure with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preview-is-pure.spec.ts`](../specifications/cli/install/preview-is-pure.spec.ts)

##### Install realizes the extension for every configured agent

- Requirement: `cli/install/realizes-for-every-configured-agent`
- Statement: When a person installs an acquirable extension, the install command shall realize it on the native surface of every configured agent that can represent it and on the universal location.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/direct-intent-recorded-and-realized`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`
- Assumptions: Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the universal location.
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/realizes-for-every-configured-agent.spec.ts`](../specifications/cli/install/realizes-for-every-configured-agent.spec.ts)

##### Install records the accepted resolution in the lockfile

- Requirement: `cli/install/records-accepted-resolution`
- Statement: When a person installs an acquirable extension, the install command shall record the extension's accepted resolution, including its source and content identity, in the workspace lockfile.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/direct-intent-recorded-and-realized`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/records-accepted-resolution.spec.ts`](../specifications/cli/install/records-accepted-resolution.spec.ts)

##### Install records the extension as directly desired workspace configuration

- Requirement: `cli/install/records-direct-intent`
- Statement: When a person installs an acquirable extension, the install command shall record it in workspace settings as directly desired configuration.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/direct-intent-recorded-and-realized`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/records-direct-intent.spec.ts`](../specifications/cli/install/records-direct-intent.spec.ts)

##### Installing an already desired extension at the same constraint is a successful no-op

- Requirement: `cli/install/reinstall-is-idempotent`
- Statement: When a person reinstalls an extension the workspace already desires at the same constraint, the install shall succeed with a no-op outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/projection-currency.e2e.test.ts`](../packages/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/reinstall-is-idempotent.spec.ts`](../specifications/cli/install/reinstall-is-idempotent.spec.ts)

##### Root install and the type command express the same durable intent

- Requirement: `cli/install/root-and-type-forms-express-same-intent`
- Statement: When the same extension is installed, and then reinstalled at the same constraint, through the root install command and through its type-specific install command, both forms shall produce identical workspace configuration, identical canonical content, identical agent projections, and the same reported outcome.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: model
- Derived from: `cli/install/reinstall-is-idempotent`
- Source: [`specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts`](../specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts)

#### Instructions

##### Disabling already disabled instruction-file management is a successful no-op

- Requirement: `cli/instructions/disable/disable-is-idempotent`
- Statement: When instruction-file management is disabled while already disabled, AXM shall report a no-op outcome and shall not change settings.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`specifications/cli/instructions/disable/disable-is-idempotent.spec.ts`](../specifications/cli/instructions/disable/disable-is-idempotent.spec.ts)

##### Disabling instruction-file management removes only what AXM owns

- Requirement: `cli/instructions/disable/removes-only-owned-aliases`
- Statement: When instruction-file management is disabled, AXM shall record the choice in axm.json and remove only the alias files and ignore regions it owns, and shall preserve authored instruction content and unrelated ignore entries.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`specifications/cli/instructions/disable/removes-only-owned-aliases.spec.ts`](../specifications/cli/instructions/disable/removes-only-owned-aliases.spec.ts)

##### Enabling instruction-file management records the explicit choice and reconciles aliases together

- Requirement: `cli/instructions/enable/records-choice-and-reconciles-aliases`
- Statement: When instruction-file management is enabled, AXM shall record the explicit choice and its source file in axm.json and shall reconcile the alias files and ignore regions it owns in the same operation.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`specifications/cli/instructions/enable/records-choice-and-reconciles-aliases.spec.ts`](../specifications/cli/instructions/enable/records-choice-and-reconciles-aliases.spec.ts)

##### Instruction-file status is inspected without changing workspace state

- Requirement: `cli/instructions/status-reports-without-changing-state`
- Statement: When instruction-file management status is inspected, AXM shall report whether management is enabled and, when it is, the source file and the managed target for each configured agent, and shall not change settings or instruction files.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`specifications/cli/instructions/status-reports-without-changing-state.spec.ts`](../specifications/cli/instructions/status-reports-without-changing-state.spec.ts)

#### Lint

##### Lint holds a declared official AXM skill to compatibility

- Requirement: `cli/lint/declared-official-skill-must-be-compatible`
- Statement: When the workspace declares the official AXM skill, lint shall report a compatibility error and fail when the declared skill is missing, incompatible, skewed, authored, or unreadable, and shall report clean and succeed when it is compatible.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/lint/official-skill-findings-follow-declared-intent`
- Supersedes: `cli/lint/official-skill-findings-follow-declared-intent`
- Source: [`specifications/cli/lint/declared-official-skill-must-be-compatible.spec.ts`](../specifications/cli/lint/declared-official-skill-must-be-compatible.spec.ts)

##### Lint fix repairs only state determined by local authority

- Requirement: `cli/lint/fix-repairs-only-determined-state`
- Statement: When lint runs with --fix, it shall repair only state that local authority fully determines, such as a missing instruction alias, and shall fail with a conflict without touching the workspace when a target is unowned or its desired content is ambiguous.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/lint/fix-repairs-only-determined-state.spec.ts`](../specifications/cli/lint/fix-repairs-only-determined-state.spec.ts)

##### Local lint honors configured rule severities

- Requirement: `cli/lint/honors-configured-rule-severities`
- Statement: For each lint rule, lint shall report findings at the severity axm.json configures, suppress the rule when configured off, and apply the catalog default when unconfigured.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/honors-configured-rule-severities.spec.ts`](../specifications/cli/lint/honors-configured-rule-severities.spec.ts)

##### Lint fails a normal run on errors and a strict run on warnings as well

- Requirement: `cli/lint/normal-and-strict-runs-fail-by-severity`
- Statement: When lint finishes, a normal run shall fail only when an error finding exists, a --strict run shall fail when an error or warning finding exists, and both runs shall succeed on informational or no findings while reporting the same findings and summary.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/lint/honors-configured-rule-severities`
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/normal-and-strict-runs-fail-by-severity.spec.ts`](../specifications/cli/lint/normal-and-strict-runs-fail-by-severity.spec.ts)

##### Lint observes only the selected filesystem view

- Requirement: `cli/lint/observes-selected-filesystem-view`
- Statement: When a lint view is selected, lint shall evaluate only that view, reporting the staged content and its fingerprint for git-index and the working tree for workspace, and shall change neither the Git index nor the working tree.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`, `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Only a real Git index and working tree, driven through the git executable, can hold staged content that differs from the working tree, yield the index fingerprint, and show afterwards that the index, status, and files were left untouched; an in-memory run has no Git index to observe.
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/observes-selected-filesystem-view.spec.ts`](../specifications/cli/lint/observes-selected-filesystem-view.spec.ts)

##### Lint reports invariant violations without changing any workspace state

- Requirement: `cli/lint/reports-facts-without-mutation`
- Statement: When lint runs without --fix, it shall report every invariant violation as findings and fail the run when errors exist, shall report clean and succeed when none exist, and shall not change any workspace state in either case.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/reports-facts-without-mutation.spec.ts`](../specifications/cli/lint/reports-facts-without-mutation.spec.ts)

##### Lint reports an undeclared official AXM skill as informational

- Requirement: `cli/lint/undeclared-official-skill-is-informational`
- Statement: When the workspace does not declare the official AXM skill, lint shall report one informational finding for the declared-skill rule, shall report no compatibility finding, and shall succeed.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/lint/official-skill-findings-follow-declared-intent`
- Supersedes: `cli/lint/official-skill-findings-follow-declared-intent`
- Source: [`specifications/cli/lint/undeclared-official-skill-is-informational.spec.ts`](../specifications/cli/lint/undeclared-official-skill-is-informational.spec.ts)

#### Lock State Never Creates Reachability

##### A lockfile row alone never makes an extension desired or retained

- Requirement: `cli/lock-state-never-creates-reachability`
- Statement: An accepted-resolution row in the lockfile that no settings entry desires shall not cause the workspace to acquire, realize, or report that extension or pack as present.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Source: [`specifications/cli/lock-state-never-creates-reachability.spec.ts`](../specifications/cli/lock-state-never-creates-reachability.spec.ts)

#### Managed Projection Guidance Respects Authority

##### Managed projections name editable sources only when the workspace owns them

- Requirement: `cli/managed-projection-guidance-respects-authority`
- Statement: A managed projection shall direct edits to its source only when the workspace authors that extension, and for an acquired extension shall mark the canonical content immutable and point to axm fork instead.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/managed-projection-guidance-respects-authority.spec.ts`](../specifications/cli/managed-projection-guidance-respects-authority.spec.ts)

#### Mcps

##### Adding an inline MCP server records it as authored configuration and realizes it

- Requirement: `cli/mcps/add/records-and-realizes-inline-configuration`
- Statement: When an inline MCP server is added by command or url, AXM shall record it in axm.json as authored configuration, realize it in the native configuration of configured agents, report the applied change, and shall record no accepted resolution.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI end to end so the inline MCP add/uninstall cycle proves argv parsing, exit codes, JSON envelopes on stdout, and native agent config files on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/mcps/add/records-and-realizes-inline-configuration.spec.ts`](../specifications/cli/mcps/add/records-and-realizes-inline-configuration.spec.ts)

##### An imported MCP server is adopted once and reaches every configured agent

- Requirement: `cli/mcps/import/adoption-reaches-every-configured-agent`
- Statement: When an MCP server found in one agent's native configuration is imported, AXM shall record it once without an agent subset, shall project it to every configured agent that can represent it on the next reconciliation, and shall report every native target it will write in preview and apply.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/sync/realizes-desired-state`, `packages/cli/src/root/mcps/import.internal.test.ts`
- Assumptions: Claude Code and Cursor keep distinct project-scope MCP configuration files, so a server present in one file and absent from the other observes adoption reaching a second agent.
- Source: [`specifications/cli/mcps/import/adoption-reaches-every-configured-agent.spec.ts`](../specifications/cli/mcps/import/adoption-reaches-every-configured-agent.spec.ts)

##### Inline MCP entries stay authoritative exactly as authored

- Requirement: `cli/mcps/inline-entries-are-authoritative-as-authored`
- Statement: An inline MCP entry authored in axm.json shall remain the authoritative configuration exactly as written through MCP operations and sync, and shall never gain an accepted resolution.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-authority-is-operation-coherent`
- Supersedes: `cli/mcps/inline-authority-is-operation-coherent`
- Source: [`specifications/cli/mcps/inline-entries-are-authoritative-as-authored.spec.ts`](../specifications/cli/mcps/inline-entries-are-authoritative-as-authored.spec.ts)

##### Inline MCP server add and uninstall are safe to repeat

- Requirement: `cli/mcps/inline-lifecycle-is-idempotent`
- Statement: Repeating an identical inline MCP server add, or repeating its uninstall, shall change no workspace configuration or agent projection and shall report a no-op.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI end to end so the inline MCP add/uninstall cycle proves argv parsing, exit codes, JSON envelopes on stdout, and native agent config files on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts`](../specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts)

##### One registry MCP source supports multiple independently named local connections

- Requirement: `cli/mcps/install/local-connection-names-share-source-resolution`
- Statement: Installing a Registry MCP server under a local name with --as shall add one connection per name, sharing one accepted resolution per source, and shall use each local name verbatim as the agent-native key.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/mcps/install/local-connection-names-share-source-resolution.spec.ts`](../specifications/cli/mcps/install/local-connection-names-share-source-resolution.spec.ts)

##### The human MCP inventory shows local name and source as separate columns

- Requirement: `cli/mcps/list/human-inventory-separates-local-name-and-source`
- Statement: When MCP servers are listed in human output, AXM shall present each connection's local name, its source, and its resolved version as separate columns, so that connections sharing one source remain individually identifiable.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/list/local-name-source-and-resolution-are-distinct`
- Source: [`specifications/cli/mcps/list/human-inventory-separates-local-name-and-source.spec.ts`](../specifications/cli/mcps/list/human-inventory-separates-local-name-and-source.spec.ts)

##### MCP servers reach every configured agent that can represent them

- Requirement: `cli/mcps/projects-to-every-configured-agent`
- Statement: When an MCP server is configured and enabled, or re-enabled, AXM shall write it to the native configuration of every configured agent that can represent it, shall report each agent that cannot as unsupported rather than omitting it, shall write no server that is configured as disabled, and disabling or uninstalling it shall remove it from every agent it reached.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/mcps/inline-authority-is-operation-coherent`, `cli/activation-follows-desired-state`, `packages/extension-workspace/src/mcps/shared-target-catalog.internal.test.ts`
- Assumptions: Claude Code and Cursor keep distinct project-scope MCP configuration files, so two native files observe two agents.; Amp is catalogued without MCP configuration support, so it stands for any configured agent that cannot represent a server.
- Source: [`specifications/cli/mcps/projects-to-every-configured-agent.spec.ts`](../specifications/cli/mcps/projects-to-every-configured-agent.spec.ts)

##### Uninstalling an MCP server preserves native entries AXM does not own

- Requirement: `cli/mcps/uninstall/preserves-unowned-native-entries`
- Statement: When an MCP server is uninstalled, AXM shall remove that server's configuration from axm.json and its projection from every agent's native configuration, and shall preserve every native entry it does not own.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI end to end so the inline MCP add/uninstall cycle proves argv parsing, exit codes, JSON envelopes on stdout, and native agent config files on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/mcps/uninstall/preserves-unowned-native-entries.spec.ts`](../specifications/cli/mcps/uninstall/preserves-unowned-native-entries.spec.ts)

##### Uninstall removes one local MCP connection and retains shared source state

- Requirement: `cli/mcps/uninstall/removes-one-local-connection-at-a-time`
- Statement: When a locally named MCP connection is uninstalled, AXM shall remove only that connection from axm.json and agent configuration, and shall retain the shared source's package content and accepted resolution until no connection to that source remains.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts`](../specifications/cli/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts)

##### Updating one locally named connection advances every connection sharing its source

- Requirement: `cli/mcps/update/shared-source-update-is-closure-wide`
- Statement: When an update targets one locally named MCP connection, AXM shall advance the single accepted resolution of its shared source and refresh the agent configuration of every connection to that source, rather than advancing the named connection alone.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/mcps/update/shared-source-update-is-closure-wide.spec.ts`](../specifications/cli/mcps/update/shared-source-update-is-closure-wide.spec.ts)

#### Mutations Are Closure Atomic

##### A failed workspace mutation leaves every authoritative state family unchanged

- Requirement: `cli/mutations-are-closure-atomic`
- Statement: When a workspace change cannot complete, the command shall fail with a typed error, shall render no result document, and shall leave settings, lockfile, canonical content, projections, and temporary directories exactly as they were.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/mutations-are-closure-atomic.spec.ts`](../specifications/cli/mutations-are-closure-atomic.spec.ts)

#### Packs

##### Adding an installed extension to an authored pack records it as a pack dependency

- Requirement: `cli/packs/add/records-member-as-pack-dependency`
- Statement: When a person adds an installed extension to a workspace-authored pack, AXM shall record the extension in the pack manifest as a dependency constrained to at least its accepted version.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/packs/authored-packs-expand-membership`
- Supersedes: `cli/packs/authored-packs-expand-membership`
- Additional evidence: process via [`packages/cli-e2e/src/packs.e2e.test.ts`](../packages/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/packs/add/records-member-as-pack-dependency.spec.ts`](../specifications/cli/packs/add/records-member-as-pack-dependency.spec.ts)

##### Creating a pack records workspace authorship with an empty dependency graph

- Requirement: `cli/packs/new/records-workspace-authorship`
- Statement: When a person creates a workspace-authored pack, AXM shall record it in axm.json as workspace authored, write its manifest with an empty dependency graph, and shall not record an accepted resolution for it.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/packs/authored-packs-expand-membership`
- Supersedes: `cli/packs/authored-packs-expand-membership`
- Additional evidence: process via [`packages/cli-e2e/src/packs.e2e.test.ts`](../packages/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/packs/new/records-workspace-authorship.spec.ts`](../specifications/cli/packs/new/records-workspace-authorship.spec.ts)

#### Projection Currency Follows State Authority

##### Generated document currency follows authoritative inputs, not rendered bytes

- Requirement: `cli/projection-currency-follows-state-authority`
- Statement: Reconciliation shall judge a generated document current by its authoritative inputs and generation record rather than its rendered bytes, preserving body rewrites while inputs are unchanged, regenerating when inputs change, and blocking on invalid ownership markers without altering the file.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/projection-currency.e2e.test.ts`](../packages/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Source: [`specifications/cli/projection-currency-follows-state-authority.spec.ts`](../specifications/cli/projection-currency-follows-state-authority.spec.ts)

#### Publish

##### One failed publish preflight blocks the whole selection

- Requirement: `cli/publish/preflight-blocks-the-whole-selection`
- Statement: When any selected extension fails publish preflight, publish shall upload nothing for the selection and shall report every other publishable extension as blocked by preflight, naming the extension that failed.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/requires-explicit-acceptance-for-non-head-source`
- Assumptions: The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; the source-state scenario substitutes the comparison outcome rather than running Git.
- Source: [`specifications/cli/publish/preflight-blocks-the-whole-selection.spec.ts`](../specifications/cli/publish/preflight-blocks-the-whole-selection.spec.ts)

##### Publish preview reports the admitted publication set without distributing anything

- Requirement: `cli/publish/preview-is-pure`
- Statement: When publish runs in preview mode, it shall report the admitted publication set with no execution and shall not upload anything or change settings or the lockfile.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Supersedes: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`specifications/cli/publish/preview-is-pure.spec.ts`](../specifications/cli/publish/preview-is-pure.spec.ts)

##### The publication gate is fixed and ignores locally relaxed lint rules

- Requirement: `cli/publish/publication-gate-is-fixed`
- Statement: When a selected extension violates the fixed publication gate, publish shall block it in preview and apply alike, shall name the violated rule, and shall upload nothing, regardless of any lint rule relaxed in axm.json.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Supersedes: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Source: [`specifications/cli/publish/publication-gate-is-fixed.spec.ts`](../specifications/cli/publish/publication-gate-is-fixed.spec.ts)

##### Publish refuses extensions the workspace does not author

- Requirement: `cli/publish/requires-established-authorship`
- Statement: Publish shall distribute only extensions the workspace authors: an explicitly selected installed extension shall fail with a conflict that suggests adopting it, a bulk publish shall report it as not authored rather than selecting it, and nothing shall be uploaded either way.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/publish/requires-established-authorship.spec.ts`](../specifications/cli/publish/requires-established-authorship.spec.ts)

##### Publish requires explicit acceptance when archive content differs from Git HEAD

- Requirement: `cli/publish/requires-explicit-acceptance-for-non-head-source`
- Statement: When an extension's archive differs from Git HEAD or the repository has no HEAD, publish shall block that extension and name --accept-warnings as the required override until it is given, while an archive matching HEAD, outside Git, or differing only in excluded paths shall publish without acceptance.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Assumptions: The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; every scenario substitutes the comparison outcome rather than running Git.
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects that in-memory execution cannot expose.
- Source: [`specifications/cli/publish/requires-explicit-acceptance-for-non-head-source.spec.ts`](../specifications/cli/publish/requires-explicit-acceptance-for-non-head-source.spec.ts)

#### Settings Validity Gates Operations

##### Workspace operations begin only after both settings sources validate

- Requirement: `cli/settings-validity-gates-operations`
- Statement: When a present project or user settings file is malformed, schema-invalid, or unreadable, every workspace operation shall stop before it begins with a validation error naming that file and a repair route, and shall change no workspace state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts`](../packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts) — Proves at the real process boundary what the in-memory harness cannot: the shipped command wiring routes every sampled command family through the settings gate, machine stdout stays a valid document separated from stderr diagnostics, exit codes are nonzero, and version and help remain outside the gate.
- Source: [`specifications/cli/settings-validity-gates-operations.spec.ts`](../specifications/cli/settings-validity-gates-operations.spec.ts)

#### Skills

##### Bundled official-skill recovery rewrites the settings entry to bundled ownership and retires the Registry resolution

- Requirement: `cli/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution`
- Statement: When the workspace desires the official AXM skill from the Registry, installing the bundled official AXM skill shall rewrite that skill's axm.json entry to bundled workspace-owned content and retire its accepted Registry resolution, shall leave every other accepted resolution intact and the workspace lint-clean, and shall change nothing when repeated.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/install/bundled-recovery-converges`
- Supersedes: `cli/skills/install/bundled-recovery-converges`
- Source: [`specifications/cli/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution.spec.ts`](../specifications/cli/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution.spec.ts)

##### Bundled official-skill recovery never overwrites a workspace-authored official skill

- Requirement: `cli/skills/install/preserves-authored-official-skill`
- Statement: When the workspace authors a skill named axm, installing the bundled official AXM skill shall be blocked before any change in preview and in a forced apply, shall name the authored skill as the cause, and shall leave configuration, lock state, and the authored source byte-for-byte intact.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/install/bundled-recovery-converges`
- Supersedes: `cli/skills/install/bundled-recovery-converges`
- Source: [`specifications/cli/skills/install/preserves-authored-official-skill.spec.ts`](../specifications/cli/skills/install/preserves-authored-official-skill.spec.ts)

##### A new skill is scaffolded for the universal location and every configured agent

- Requirement: `cli/skills/new/scaffolds-for-every-configured-agent`
- Statement: When a skill is created, AXM shall create its manifest, content, and enabled settings entry together, shall materialize it for the universal location and every configured agent that can represent it, shall list the same targets in preview and apply, and a following reconciliation shall report no change.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `agent-interoperability`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/sync/realizes-desired-state`, `cli/install/preview-is-pure`, `packages/cli/src/root/skills/new.internal.test.ts`, `packages/cli-e2e/src/cli-commands/skills/new/command.e2e.ts`
- Assumptions: Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the universal location.
- Source: [`specifications/cli/skills/new/scaffolds-for-every-configured-agent.spec.ts`](../specifications/cli/skills/new/scaffolds-for-every-configured-agent.spec.ts)

#### Subagents

##### A new subagent is scaffolded and rendered for every configured agent

- Requirement: `cli/subagents/new/scaffolds-for-every-configured-agent`
- Statement: When a subagent is created, AXM shall create its manifest, content, and enabled settings entry together, shall render it for every configured agent that can represent it, shall list the same targets in preview and apply, and a following reconciliation shall report no change.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `agent-interoperability`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/sync/realizes-desired-state`, `cli/install/preview-is-pure`, `packages/cli/src/root/subagents/new/handler.internal.test.ts`
- Assumptions: Claude Code and Cursor both render project-scope subagents into distinct directories, so two rendered files observe two configured agents.
- Open questions: Whether the creation result should list each agent's rendered file as a target, as skill creation lists agent locations, is unresolved; this specification requires only that preview and apply agree and that every configured agent receives its rendering.
- Source: [`specifications/cli/subagents/new/scaffolds-for-every-configured-agent.spec.ts`](../specifications/cli/subagents/new/scaffolds-for-every-configured-agent.spec.ts)

#### Sync

##### Sync never changes configuration and never advances a satisfying resolution

- Requirement: `cli/sync/preserves-configuration-and-resolutions`
- Statement: Sync shall never rewrite axm.json or alter an accepted resolution that still satisfies its constraint, and shall restore realized content from the accepted resolution even when a newer version is available.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts`](../specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts)

##### Sync never removes agent-native content without AXM ownership proof

- Requirement: `cli/sync/preserves-unowned-agent-content`
- Statement: When sync retires agent-native content that desired state no longer reaches, it shall remove only content AXM can prove it owns and shall leave hand-authored neighbors in the same agent directory untouched.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/preserves-unowned-agent-content.spec.ts`](../specifications/cli/sync/preserves-unowned-agent-content.spec.ts)

##### Sync realizes desired additions and removes what desired state no longer includes

- Requirement: `cli/sync/realizes-desired-state`
- Statement: Sync shall realize each desired extension AXM owns, recording a first accepted resolution for one that has none and restoring missing agent projections from canonical content and missing canonical content from the exact accepted identity, shall remove owned outputs that desired state no longer includes, and shall report a no-op once managed state agrees with desired state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/sync/preserves-configuration-and-resolutions`
- Source: [`specifications/cli/sync/realizes-desired-state.spec.ts`](../specifications/cli/sync/realizes-desired-state.spec.ts)

#### Uninstall

##### Uninstalling an extension the workspace does not desire is a safe no-op

- Requirement: `cli/uninstall/is-idempotent`
- Statement: When uninstall targets an extension the workspace does not desire, whether never installed or already uninstalled, it shall report a no-op and shall change no configuration, resolution, canonical content, or agent projection.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/root-uninstall.e2e.test.ts`](../packages/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/is-idempotent.spec.ts`](../specifications/cli/uninstall/is-idempotent.spec.ts)

##### Uninstall removes direct intent and keeps state another desired route still reaches

- Requirement: `cli/uninstall/removes-direct-route-and-recomputes-reachability`
- Statement: When a directly desired extension is uninstalled, AXM shall remove its direct configuration from axm.json, shall remove its resolution, canonical content, and projections only when no other desired route still reaches it, reporting retained state otherwise, and shall leave every other desired extension's state untouched.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/root-uninstall.e2e.test.ts`](../packages/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts`](../specifications/cli/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts)

##### Uninstall retires a desired pack whose package cannot be read

- Requirement: `cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable`
- Statement: When uninstall targets a desired pack whose package manifest is missing or cannot be decoded, and every other desired pack is intact, AXM shall remove the pack's configuration and accepted resolution, shall delete no content it could not verify, shall report the removal as registration-only naming the unreadable manifest, and shall reach the same decision in preview and apply; when any other desired pack is incomplete, AXM shall remain blocked and shall change nothing.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Assumptions: A pack's member list is not persisted outside its package manifest; neither axm.json nor axm-lock.yaml carries one, so an unreadable manifest leaves members computable only from the remaining desired state.
- Additional evidence: process via [`packages/cli-e2e/src/root-uninstall.e2e.test.ts`](../packages/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable.spec.ts`](../specifications/cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable.spec.ts)

#### Unreadable Knowledge Is Left Out And Reported

##### A Knowledge bundle AXM cannot read is left out of the instructions file and reported

- Requirement: `cli/unreadable-knowledge-is-left-out-and-reported`
- Statement: When a desired Knowledge bundle's package cannot be read, AXM shall leave that bundle out of the generated instructions file, shall report the omission with its reason and remedy on every command that writes or inspects that file, and shall not fail another extension's operation because of it.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/extension-lifecycle/src/knowledge/manager.ts`, `packages/extension-workspace/src/projection/planning.ts`
- Source: [`specifications/cli/unreadable-knowledge-is-left-out-and-reported.spec.ts`](../specifications/cli/unreadable-knowledge-is-left-out-and-reported.spec.ts)

#### Update

##### Update advances the accepted resolution within durable intent

- Requirement: `cli/update/advances-resolution-within-intent`
- Statement: Update of a desired Registry extension shall advance its accepted resolution and realized content to the newest version within the durable constraint without changing axm.json or any other extension, and shall be a no-op when already current.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects that in-memory execution cannot expose.
- Source: [`specifications/cli/update/advances-resolution-within-intent.spec.ts`](../specifications/cli/update/advances-resolution-within-intent.spec.ts)

##### Targeted update routes bundled source to its converging recovery

- Requirement: `cli/update/bundled-source-routes-to-recovery`
- Statement: When a targeted update names an extension whose source is bundled with the AXM executable, the update shall be blocked in preview and apply without contacting any Registry or changing workspace state, and shall suggest reinstalling the bundled skill as the recovery path.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/update/bundled-source-routes-to-recovery.spec.ts`](../specifications/cli/update/bundled-source-routes-to-recovery.spec.ts)

##### Update is blocked for an extension the workspace does not desire

- Requirement: `cli/update/refuses-undesired-extensions`
- Statement: When an update names an extension the workspace does not desire, the update shall be blocked as an unmet precondition before any change and shall leave configuration, lock state, and acquired content untouched.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/update/advances-resolution-within-intent`
- Source: [`specifications/cli/update/refuses-undesired-extensions.spec.ts`](../specifications/cli/update/refuses-undesired-extensions.spec.ts)

#### Workspace Lockfile Rejections Name State And Recovery

##### Workspace lockfile rejections name the observed state and a safe recovery route

- Requirement: `cli/workspace-lockfile-rejections-name-state-and-recovery`
- Statement: When a present workspace lockfile in either scope is unsupported, unreadable, or invalid, every operation shall stop before it begins with a validation error naming the file, the observed state, and a non-destructive recovery route, and shall change no workspace state.
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
- Statement: AXM shall install through its supported bash, PowerShell, and cmd installers, each verifying artifact integrity by checksum.
- Class: quality (installability)
- Role: experience
- Product goals: `platform-reach`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed installer scripts show which install channels exist and that each verifies artifact integrity by checksum; the installed execution bound to this requirement shows that they install a working product.
- Methods: contract
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum verification, PATH guidance, and a working installed product on that shell.
- Source: [`specifications/system/installability/product-installs-through-supported-channels.spec.ts`](../specifications/system/installability/product-installs-through-supported-channels.spec.ts)

#### Reliability

##### Telemetry collection or delivery failure is invisible to the operation

- Requirement: `system/reliability/telemetry-failure-never-alters-outcomes`
- Statement: When telemetry collection or delivery fails for any reason, the requested operation shall complete with the outcome it would have had without telemetry, and the failure shall neither fail nor alter that operation.
- Class: quality (reliability)
- Role: experience
- Product goals: `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `system/security/telemetry-failure-never-alters-outcomes`
- Supersedes: `system/security/telemetry-failure-never-alters-outcomes`
- Source: [`specifications/system/reliability/telemetry-failure-never-alters-outcomes.spec.ts`](../specifications/system/reliability/telemetry-failure-never-alters-outcomes.spec.ts)

#### Security

##### Telemetry collection follows only the operator's environment consent

- Requirement: `system/security/telemetry-consent-and-precedence`
- Statement: Telemetry collection shall follow only the operator's environment, collecting by default, honoring the telemetry control to disable collection or limit it to errors, giving the do-not-track convention precedence over every other control, and reading no telemetry control from committed workspace configuration.
- Class: functional
- Role: experience
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/system/security/telemetry-consent-and-precedence.spec.ts`](../specifications/system/security/telemetry-consent-and-precedence.spec.ts)

## Programmatic interfaces

### CLI

#### Exit Codes Match Published Reference

##### The published exit-code reference matches the runtime exit codes

- Requirement: `cli/exit-codes-match-published-reference`
- Statement: The served exit-codes help topic shall list exactly the exit codes and meanings the command line returns at runtime, with no missing, extra, or differing rows.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/exit-codes-match-published-reference.spec.ts`](../specifications/cli/exit-codes-match-published-reference.spec.ts)

#### Install

##### Machine install output is one complete schema-backed plan document

- Requirement: `cli/install/machine-result-is-schema-backed`
- Statement: When the install command runs in machine output mode, it shall emit a single result document that satisfies the published plan-result schema and accounts for every unit exactly once in its counts, and preview shall report through that same contract with a previewed outcome.
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
- Statement: The lint rule catalog shall expose exactly the accepted rule identities, and each rule shall declare its accepted default severity and the filesystem views (workspace, git-index) it observes.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.
- Source: [`specifications/cli/lint/catalog-is-complete.spec.ts`](../specifications/cli/lint/catalog-is-complete.spec.ts)

##### The machine lint result names the official skill's compatibility reason and recovery

- Requirement: `cli/lint/compatibility-result-names-reason-and-recovery`
- Statement: When lint runs in machine output mode, the result shall carry a compatibility result only when the workspace declares the official AXM skill, and that result shall name the reason the skill is incompatible and the recovery action with its next command, or no action when the skill is compatible.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/lint/official-skill-findings-follow-declared-intent`
- Supersedes: `cli/lint/official-skill-findings-follow-declared-intent`
- Open questions: The reason code reported for the authored and unreadable official-skill states is not pinned by the decision table, while every other error state pins one.
- Source: [`specifications/cli/lint/compatibility-result-names-reason-and-recovery.spec.ts`](../specifications/cli/lint/compatibility-result-names-reason-and-recovery.spec.ts)

##### Lint distinguishes AXM-owned residue from genuinely undeclared agents

- Requirement: `cli/lint/distinguishes-owned-residue-from-undeclared-agents`
- Statement: When a workspace still contains AXM-owned projections for an agent that is no longer declared, lint shall report that residue as stale projections and shall not report the agent as detected but undeclared.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/lint/distinguishes-owned-residue-from-undeclared-agents.spec.ts`](../specifications/cli/lint/distinguishes-owned-residue-from-undeclared-agents.spec.ts)

##### Lint findings identify the violated invariant and affected subject as facts

- Requirement: `cli/lint/findings-name-the-violated-invariant`
- Statement: When lint reports a finding in machine output mode, the finding shall carry a stable rule identity, the affected subject, the deciding authority, the observed state, the expected invariant, and its location.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/findings-name-the-violated-invariant.spec.ts`](../specifications/cli/lint/findings-name-the-violated-invariant.spec.ts)

##### Machine lint output carries facts and no advice

- Requirement: `cli/lint/machine-findings-carry-only-facts`
- Statement: When lint runs in machine output mode, each reported finding shall carry only fact fields, and the run shall emit no advisory or suggestion content on any channel.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Derived from: `cli/lint/findings-name-the-violated-invariant`
- Source: [`specifications/cli/lint/machine-findings-carry-only-facts.spec.ts`](../specifications/cli/lint/machine-findings-carry-only-facts.spec.ts)

#### Lockfile Version Errors Expose Structured Problem

##### Lockfile version errors expose a structured machine problem

- Requirement: `cli/lockfile-version-errors-expose-structured-problem`
- Statement: When a machine-output invocation rejects a workspace lockfile whose version is unsupported, the error envelope shall carry a structured problem naming the file, the observed and supported versions, and the direction, plus direction-specific recovery commands.
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
- Statement: When a machine-output invocation fails, it shall exit non-zero and write exactly one schema-valid error document to standard output, keeping every diagnostic line on standard error as a structured event.
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
- Statement: When machine output mode is on, a command that needs interactive input shall terminate with an approval-required failure and shall not raise any prompt, while the same request with machine output off shall prompt and honor the answer.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/machine-mode-never-prompts.spec.ts`](../specifications/cli/machine-mode-never-prompts.spec.ts)

#### Mcps

##### MCP entries declare exactly one of source, command, or url

- Requirement: `cli/mcps/entries-declare-exactly-one-transport`
- Statement: An MCP server entry in axm.json shall declare exactly one of source, command, or url, and a workspace operation that reads an entry declaring none or more than one shall reject it before any workspace change with an error naming that rule.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/mcps/inline-authority-is-operation-coherent`
- Supersedes: `cli/mcps/inline-authority-is-operation-coherent`
- Assumptions: Sync stands for every workspace operation that reads MCP entries, because settings are validated once before any operation begins.
- Source: [`specifications/cli/mcps/entries-declare-exactly-one-transport.spec.ts`](../specifications/cli/mcps/entries-declare-exactly-one-transport.spec.ts)

##### Locally named MCP install requests are validated before any workspace change

- Requirement: `cli/mcps/install/local-name-requests-are-validated-before-any-change`
- Statement: When an MCP install names a local connection with --as, AXM shall reject the request before any workspace change, with an error naming the violated rule, if the local name is invalid, the name is owned by a different source, the version constraint does not intersect the source's existing constraints, or --as is given without a source.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `cli/mcps/install/local-connection-names-share-source-resolution`
- Source: [`specifications/cli/mcps/install/local-name-requests-are-validated-before-any-change.spec.ts`](../specifications/cli/mcps/install/local-name-requests-are-validated-before-any-change.spec.ts)

##### The machine MCP inventory distinguishes local connection identity from source resolution

- Requirement: `cli/mcps/list/local-name-source-and-resolution-are-distinct`
- Statement: When MCP servers are listed in machine output, AXM shall report each connection's local name, its source, and its accepted resolution as distinct fields, so that connections sharing one source remain individually identifiable.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Source: [`specifications/cli/mcps/list/local-name-source-and-resolution-are-distinct.spec.ts`](../specifications/cli/mcps/list/local-name-source-and-resolution-are-distinct.spec.ts)

#### Publish

##### Machine publish outcomes report source state against Git HEAD

- Requirement: `cli/publish/outcomes-report-source-state`
- Statement: When publish compares an extension's archive with Git, each machine outcome for that extension shall carry a schema-backed source-state report naming its basis, whether it matches HEAD, differs from HEAD, or has no HEAD, the HEAD revision when one exists, and the list and count of material differences, and an outcome for an extension outside Git shall carry no source-state report.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: contract
- Derived from: `cli/publish/requires-explicit-acceptance-for-non-head-source`
- Assumptions: The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; every scenario substitutes the comparison outcome rather than running Git.
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects that in-memory execution cannot expose.
- Source: [`specifications/cli/publish/outcomes-report-source-state.spec.ts`](../specifications/cli/publish/outcomes-report-source-state.spec.ts)

#### Sync

##### Sync reports aggregate projection drift at ownership-unit precision

- Requirement: `cli/sync/reports-aggregate-projection-drift-at-unit-precision`
- Statement: When an aggregate projection like an instruction file's rules or knowledge region drifts, a sync preview shall report it as stale or missing at the owning managed unit and region, and shall not attribute the cause to any individual contributing extension.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract, example
- Source: [`specifications/cli/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts`](../specifications/cli/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts)

#### Update

##### Machine update output names the bundled source as the blocker with every effect unchanged

- Requirement: `cli/update/machine-result-names-bundled-source-blocker`
- Statement: When a targeted update of a bundled-source extension is blocked in machine output mode, the result document shall satisfy the published plan-result schema and shall report the targeted-update context with direct-only ownership, enabled activation, blocked authority, a bundled direct source, the bundled-source blocker, and every effect unchanged, in preview and apply alike.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract
- Derived from: `cli/update/bundled-source-routes-to-recovery`
- Source: [`specifications/cli/update/machine-result-names-bundled-source-blocker.spec.ts`](../specifications/cli/update/machine-result-names-bundled-source-blocker.spec.ts)

### Extension identity

#### Canonical Names Round Trip

##### A canonical extension name always parses back to the identity that produced it

- Requirement: `extension-identity/canonical-names-round-trip`
- Statement: A fully qualified name or owner handle produced from an extension identity shall parse back to exactly that identity.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`specifications/extension-identity/canonical-names-round-trip.spec.ts`](../specifications/extension-identity/canonical-names-round-trip.spec.ts)

#### Malformed Names Are Rejected

##### A malformed extension name is rejected with a typed failure naming the input

- Requirement: `extension-identity/malformed-names-are-rejected`
- Statement: A reference that does not match the extension name grammar, including any bare name, shall be rejected with a typed failure that preserves the offending input.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Source: [`specifications/extension-identity/malformed-names-are-rejected.spec.ts`](../specifications/extension-identity/malformed-names-are-rejected.spec.ts)

#### Owner Input Normalizes To The Canonical Handle

##### Owner input that differs only by whitespace or letter case normalizes to the canonical handle

- Requirement: `extension-identity/owner-input-normalizes-to-the-canonical-handle`
- Statement: Owner input that differs from a canonical owner handle only by surrounding whitespace or letter case shall normalize to that canonical lower-case handle.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: property, example
- Derived from: `extension-identity/canonical-names-round-trip`
- Source: [`specifications/extension-identity/owner-input-normalizes-to-the-canonical-handle.spec.ts`](../specifications/extension-identity/owner-input-normalizes-to-the-canonical-handle.spec.ts)

#### References Are A Name With An Optional Constraint

##### An extension reference is a fully qualified name with an optional version constraint

- Requirement: `extension-identity/references-are-a-name-with-an-optional-constraint`
- Statement: An extension reference shall identify exactly the extension its fully qualified name identifies regardless of any appended version constraint, and a reference whose appended constraint is not a valid version constraint shall be rejected with guidance naming the version constraint.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: property, example
- Derived from: `extension-identity/canonical-names-round-trip`, `extension-identity/malformed-names-are-rejected`
- Source: [`specifications/extension-identity/references-are-a-name-with-an-optional-constraint.spec.ts`](../specifications/extension-identity/references-are-a-name-with-an-optional-constraint.spec.ts)

### Package identity

#### Companion Packages Are Identities Not Pins

##### A companion package names an ecosystem package identity, never a pinned version

- Requirement: `package-identity/companion-packages-are-identities-not-pins`
- Statement: A companion package shall be declared by a versionless package identity, and a declaration that pins a version shall be refused with guidance toward the compatibility range.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/package-identity/companion-packages-are-identities-not-pins.spec.ts`](../specifications/package-identity/companion-packages-are-identities-not-pins.spec.ts)

#### Companion Packages Use A Supported Ecosystem

##### Companion packages and their compatibility ranges name a supported package ecosystem

- Requirement: `package-identity/companion-packages-use-a-supported-ecosystem`
- Statement: A companion package identity and its compatibility range shall each name a supported concrete package ecosystem, and a declaration naming a generic version scheme or an ecosystem the product does not support shall be refused with guidance naming that ecosystem.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `package-identity/companion-packages-are-identities-not-pins`, `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Source: [`specifications/package-identity/companion-packages-use-a-supported-ecosystem.spec.ts`](../specifications/package-identity/companion-packages-use-a-supported-ecosystem.spec.ts)

#### Compatibility Ranges Are Well Formed

##### A companion compatibility range is a well-formed vers range with at least one plain constraint

- Requirement: `package-identity/compatibility-ranges-are-well-formed`
- Statement: A companion compatibility range shall be a vers range with the vers prefix, an ecosystem scheme, and at least one plain constraint, and a range that omits the prefix, carries no constraint, is wildcard-only, or percent-encodes its constraints shall be refused with guidance naming the flaw.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Source: [`specifications/package-identity/compatibility-ranges-are-well-formed.spec.ts`](../specifications/package-identity/compatibility-ranges-are-well-formed.spec.ts)

#### Compatibility Ranges Match The Package Ecosystem

##### A companion compatibility range names the same ecosystem as its package identity

- Requirement: `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Statement: A companion declaration that carries a compatibility range shall be accepted only when the range names the same package ecosystem as the package identity, and a mismatched pair shall be refused with guidance naming both ecosystems.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts`](../specifications/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts)

### Settings contract

#### Accepted Settings Round Trip Losslessly

##### An accepted settings document re-encodes exactly as it was authored

- Requirement: `settings-contract/accepted-settings-round-trip-losslessly`
- Statement: A settings document the product accepts shall re-encode to exactly the authored document, including entries in object form and content the product does not recognize.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `settings-contract/saving-settings-preserves-authored-formatting`
- Source: [`specifications/settings-contract/accepted-settings-round-trip-losslessly.spec.ts`](../specifications/settings-contract/accepted-settings-round-trip-losslessly.spec.ts)

#### Agent Membership Is The Only Agent Selection

##### Workspace settings select agents only through the workspace agent list

- Requirement: `settings-contract/agent-membership-is-the-only-agent-selection`
- Statement: Workspace settings shall express agent selection only through the workspace agent list, shall reject an extension entry that declares its own agent subset with an error naming that key, and the published settings schema shall admit no per-entry agent subset.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `settings-contract/published-schemas-agree-with-accepted-input`, `cli/settings-validity-gates-operations`, `packages/workspace-state/src/settings/schema.internal.test.ts`
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.; The product reads settings with excess keys treated as errors, so decoding here with the same option observes the product's acceptance boundary.
- Source: [`specifications/settings-contract/agent-membership-is-the-only-agent-selection.spec.ts`](../specifications/settings-contract/agent-membership-is-the-only-agent-selection.spec.ts)

#### Published Lockfile Schema Agrees With Accepted Input

##### The published lockfile schema describes what the product accepts

- Requirement: `settings-contract/published-lockfile-schema-agrees-with-accepted-input`
- Statement: The published lockfile schema shall admit exactly the lockfile version and required fields the product accepts, and a lockfile at any other version or missing a required field shall be refused.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `settings-contract/published-schemas-agree-with-accepted-input`
- Supersedes: `settings-contract/published-schemas-agree-with-accepted-input`
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.
- Source: [`specifications/settings-contract/published-lockfile-schema-agrees-with-accepted-input.spec.ts`](../specifications/settings-contract/published-lockfile-schema-agrees-with-accepted-input.spec.ts)

#### Published Settings Schema Agrees With Accepted Input

##### The published settings schema describes what the product accepts

- Requirement: `settings-contract/published-settings-schema-agrees-with-accepted-input`
- Statement: The published settings schema shall agree with the product on every example document, lint rule identity, and severity value it admits, and shall not admit an unregistered rule, wildcard rule, or misspelled severity.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `settings-contract/published-schemas-agree-with-accepted-input`
- Supersedes: `settings-contract/published-schemas-agree-with-accepted-input`
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.
- Source: [`specifications/settings-contract/published-settings-schema-agrees-with-accepted-input.spec.ts`](../specifications/settings-contract/published-settings-schema-agrees-with-accepted-input.spec.ts)

#### Saving Settings Preserves Authored Formatting

##### Saving settings preserves authored formatting, ordering, and unrecognized content

- Requirement: `settings-contract/saving-settings-preserves-authored-formatting`
- Statement: When the product saves settings back to axm.json, it shall preserve the authored indentation, key order, and unrecognized content, and rewriting unchanged settings shall leave the file byte-identical.
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
- Statement: A source locator shall resolve through the published grammar to exactly the coordinates it names, a project-defined source shall override a built-in host of the same name, and a locator outside the grammar shall be refused with a typed failure that explains the rejection.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`specifications/source-resolution/locator-grammar-is-stable.spec.ts`](../specifications/source-resolution/locator-grammar-is-stable.spec.ts)

### System

#### Security

##### Telemetry payloads carry only the fields the published telemetry contract declares

- Requirement: `system/security/telemetry-payloads-respect-data-boundary`
- Statement: Every telemetry event AXM sends shall carry only the observation fields for identity, timing, and command context that the published telemetry contract declares, so that extension content, authored instructions and knowledge, credentials, and resolved secret values have no field in which to travel.
- Class: quality (privacy)
- Role: interface
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Assumptions: Values inside the free-form properties field carry only documented observation data; the evidence bounds field names at every level the published contract closes, not the values inside properties.; The telemetry contract snapshot generated into the CLI is the contract the production telemetry service publishes.
- Source: [`specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts`](../specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts)

### Version constraints

#### Constraint Intersection Preserves Every Limit

##### Combining version constraints keeps every contributor's limits or reports the combination unsatisfiable

- Requirement: `version-constraints/constraint-intersection-preserves-every-limit`
- Statement: When version constraints from several contributors are combined, the combined constraint shall accept a version exactly when every contributor accepts it, and a combination that no version satisfies or that includes an invalid contributor shall be reported as unsatisfiable.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Open questions: Combining the accepts-everything contributor >=0.0.0 yields an empty constraint that the product's own satisfaction check rejects; the property excludes that contributor pending a defect decision on whether it is in scope.
- Source: [`specifications/version-constraints/constraint-intersection-preserves-every-limit.spec.ts`](../specifications/version-constraints/constraint-intersection-preserves-every-limit.spec.ts)

#### Range Satisfaction Follows Semver

##### A version constraint accepts exactly the versions its semver range allows

- Requirement: `version-constraints/range-satisfaction-follows-semver`
- Statement: A version constraint shall be accepted only as a valid semver range and shall match a version exactly when semver allows it, and an exact version shall be accepted only in strict semver form with no leading v, missing part, or leading zero.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, decision-table, example
- Source: [`specifications/version-constraints/range-satisfaction-follows-semver.spec.ts`](../specifications/version-constraints/range-satisfaction-follows-semver.spec.ts)

## Supporting system behavior

### CLI

#### Mcps

##### MCP secrets stay in a per-connection keychain namespace and out of workspace files

- Requirement: `cli/mcps/secret-namespaces-include-local-and-source-identity`
- Statement: When a locally named MCP connection is installed with a secret input, AXM shall keep the secret in the system keychain under a namespace unique to the workspace, the local connection name, the source, and the input name, and shall write the secret value into neither axm.json, any agent's native configuration, nor the reported result.
- Class: quality (security)
- Role: supporting
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Assumptions: The specification runtime has no system keychain, so the keychain write is reported as failed while the workspace files and the reported result remain observable.
- Limitation: In-memory execution cannot observe the system keychain, so the namespace under which each connection's secret is kept is not evidenced here; the derivation is verified by an internal test beside the deriving module. Retires when: The specification harness composes an observable secret store whose namespaces specifications can read.
- Source: [`specifications/cli/mcps/secret-namespaces-include-local-and-source-identity.spec.ts`](../specifications/cli/mcps/secret-namespaces-include-local-and-source-identity.spec.ts)

### System

#### Architecture

##### End-to-end suites reach the product only as a shipped artifact, never as imported code

- Requirement: `system/architecture/e2e-observes-only-shipped-artifacts`
- Statement: End-to-end test projects shall exercise AXM only through its shipped artifacts and shall not declare a dependency on, or a project reference to, any product source package.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests and TypeScript project references of the end-to-end projects show whether they reach product source directly.
- Methods: contract
- Assumptions: The module-boundary lint gate declared as bound evidence runs on every change through the required aggregate check.
- Bound evidence: `lint: @nx/enforce-module-boundaries` — Rejects workspace imports from end-to-end and test-support projects into product source packages, and relative imports that cross a project root, leaving the built CLI output path as the only sanctioned way to reach the shipped surface.
- Source: [`specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts`](../specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts)

##### Feature packages stay peers and never depend on one another

- Requirement: `system/architecture/feature-packages-stay-peers`
- Statement: No feature package shall declare a dependency on another feature package, so that features remain peers composed only from kernel, integration, and contract packages.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests and project declarations show which packages are features and which production packages each feature depends on.
- Methods: contract
- Derived from: `system/architecture/package-dependencies-point-inward`
- Assumptions: Package manifests declare every production dependency; the manifest-fidelity lint gate bound as evidence keeps them truthful.; The module-boundary lint gate runs on every change through the required aggregate check.
- Bound evidence: `lint: @nx/enforce-module-boundaries` — Rejects any workspace import from one feature package into another feature package on every change.
- Source: [`specifications/system/architecture/feature-packages-stay-peers.spec.ts`](../specifications/system/architecture/feature-packages-stay-peers.spec.ts)

##### Environment-backed service composition happens only in the application composition root

- Requirement: `system/architecture/live-composition-stays-in-application`
- Statement: Environment-backed and in-memory service implementations shall be composed only at the application composition root, and production source in any other package shall not import them directly.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed lint configuration shows that the import restriction on environment-backed and in-memory implementation entries is armed for production source.
- Methods: contract
- Assumptions: The lint gate declared as bound evidence runs on every change through the required aggregate check.; Which non-test modules are exempt from the restriction is realization detail pinned by repository tooling tests, not by this specification.
- Bound evidence: `lint: no-restricted-imports (@agentxm/*/live, @agentxm/*/testing)` — Rejects imports of environment-backed implementations and in-memory ports from production source outside the application composition root, while tests and specifications keep their sanctioned exceptions.
- Source: [`specifications/system/architecture/live-composition-stays-in-application.spec.ts`](../specifications/system/architecture/live-composition-stays-in-application.spec.ts)

##### Production package dependencies point inward from the application

- Requirement: `system/architecture/package-dependencies-point-inward`
- Statement: Every dependency between production packages shall point inward, from the application through the feature level and the peer kernel and integration levels to the contract level, and shall never point toward a level nearer the application.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests and project declarations show which production packages exist, which level each declares, and which production packages each depends on.
- Methods: contract
- Assumptions: Package manifests declare every production dependency; the manifest-fidelity lint gate bound as evidence keeps them truthful.; The module-boundary and manifest-fidelity lint gates run on every change through the required aggregate check.
- Bound evidence: `lint: @nx/enforce-module-boundaries` — Rejects any workspace import from a production package toward a level nearer the application, and any undeclared transitive dependency, on every change.
- Bound evidence: `lint: @nx/dependency-checks` — Keeps each production package manifest aligned with its actual imports so the dependency structure this specification observes is truthful.
- Source: [`specifications/system/architecture/package-dependencies-point-inward.spec.ts`](../specifications/system/architecture/package-dependencies-point-inward.spec.ts)

##### Production package dependencies never form a cycle

- Requirement: `system/architecture/package-dependencies-stay-acyclic`
- Statement: The dependencies declared between production packages shall never form a cycle, so that every production package can be built and released before the packages that depend on it.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests show which production packages each production package depends on, so a dependency cycle is observable there and nowhere in memory.
- Methods: contract
- Derived from: `system/architecture/package-dependencies-point-inward`
- Assumptions: Package manifests declare every production dependency; the manifest-fidelity lint gate bound as evidence keeps them truthful.; The module-boundary lint gate runs on every change through the required aggregate check.
- Bound evidence: `lint: @nx/enforce-module-boundaries` — Rejects circular workspace imports across every production project on every change, with no ignored project pairs and no self-dependency allowance.
- Source: [`specifications/system/architecture/package-dependencies-stay-acyclic.spec.ts`](../specifications/system/architecture/package-dependencies-stay-acyclic.spec.ts)

##### The public system depends on private platform responsibilities only through published contracts

- Requirement: `system/architecture/public-system-depends-only-on-published-contracts`
- Statement: The public AXM system shall depend on private platform responsibilities only through published packages and through clients generated from contract documents tracked in this repository, and no workspace package shall reference a private package or a filesystem path outside the repository.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests, the tracked contract documents, and the tracked generated clients show what the public system actually depends on.
- Methods: contract
- Source: [`specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts`](../specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts)

##### Specification layout mirrors the command tree and declared identities

- Requirement: `system/architecture/specification-folders-mirror-command-tree`
- Statement: Every specification directory under cli shall name a registered command path, every requirement identity shall equal its file path under specifications, and no symbolic link shall hide specification content from discovery.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the specification tree on disk, compared with the registered command tree, can show that folders, identities, and file paths correspond.
- Methods: contract
- Source: [`specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts`](../specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts)

#### Compatibility

##### Every supported platform and shell receives release-blocking verification

- Requirement: `system/compatibility/supported-platform-matrix`
- Statement: Every supported operating system and architecture shall receive release-blocking verification of the compiled binary, every supported installer shell shall receive release-blocking verification of the installed product, and Windows workspace behavior shall be verified on a real Windows runner.
- Class: quality (compatibility)
- Role: supporting
- Product goals: `platform-reach`
- Boundary: repository; selection: platform-matrix
- Boundary rationale: The committed ci.yml and publish.yml workflow files are read only as a coverage check showing which supported platforms, shells, and runners the bound matrix jobs cover; the compatibility evidence itself comes from the binary, platform, and installed executions those jobs run on each platform.
- Methods: contract
- Derived from: `system/installability/product-installs-through-supported-channels`
- Assumptions: A job named in the workflow files blocks its merge or release rather than running as an advisory check.
- Bound evidence: `ci: binary-smoke` — Runs the compiled-binary smoke execution on every supported operating system and architecture for every change that reaches the main branch, producing the binaries a release attaches.
- Bound evidence: `ci: windows-workspace` — Runs the Windows workspace mutation execution on a real Windows runner for every change.
- Bound evidence: `publish: install-verify` — Runs the installer verification execution against the real release assets on every supported installer shell before the release workflow completes.
- Additional evidence: binary via [`packages/cli-e2e/src/binary-smoke.e2e.test.ts`](../packages/cli-e2e/src/binary-smoke.e2e.test.ts) — Executes the compiled platform binary, proving the shipped artifact starts and answers on the target operating system and architecture.
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum verification, PATH guidance, and a working installed product on that shell.
- Additional evidence: platform via [`packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts`](../packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts) — Exercises workspace mutation semantics on a real Windows filesystem, where path, symlink, and lock behavior differ from POSIX.
- Source: [`specifications/system/compatibility/supported-platform-matrix.spec.ts`](../specifications/system/compatibility/supported-platform-matrix.spec.ts)

#### Process

##### Changes land through human-reviewed pull requests, with requirements changes routed to maintainers

- Requirement: `system/process/changes-land-through-reviewed-pull-requests`
- Statement: Every change shall land through a pull request with passing required checks and human approval, and any change under specifications shall be routed to maintainer review as a requirements decision.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The committed code-owner rules and contributor guidance are the repository-side declaration of the review route, which no in-memory run can observe.
- Methods: contract
- Assumptions: GitHub branch protection enforces pull-request review and code-owner approval outside the repository.
- Source: [`specifications/system/process/changes-land-through-reviewed-pull-requests.spec.ts`](../specifications/system/process/changes-land-through-reviewed-pull-requests.spec.ts)

##### The dual TypeScript alias stays in place until its recorded exit condition

- Requirement: `system/process/dual-typescript-alias-retained`
- Statement: Until the recorded TypeScript 7.1 exit condition is met, the workspace shall resolve tsc to native TypeScript 7 and shall keep the typescript package resolving to the TypeScript 6 compatibility package.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed workspace catalog in pnpm-workspace.yaml shows which packages the two TypeScript aliases resolve to.
- Methods: contract
- Limitation: The evidence establishes only that the committed workspace catalog declares the two aliases; it cannot observe whether the exit condition recorded in the dual TypeScript alias decision (docs/architecture/decisions/typescript-dual-alias.md) has been reached. Retires when: TypeScript 7.1 or a later release removes the need for the compatibility split, the dual TypeScript alias decision record is superseded, and the workspace collapses to a single TypeScript dependency, retiring this constraint in the same change.
- Source: [`specifications/system/process/dual-typescript-alias-retained.spec.ts`](../specifications/system/process/dual-typescript-alias-retained.spec.ts)

##### Changes are verified by one aggregate required check before merge

- Requirement: `system/process/merges-require-aggregate-verification`
- Statement: Every pull request shall be verified by one always-run aggregate required check that gates on every other verification job, so that no skipped or failed check can disappear from the merge verdict.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed ci.yml workflow shows the pull-request trigger, the aggregate job, and the set of jobs it gates on.
- Methods: contract
- Assumptions: GitHub branch protection requires the aggregate check to pass before merge outside the repository.
- Source: [`specifications/system/process/merges-require-aggregate-verification.spec.ts`](../specifications/system/process/merges-require-aggregate-verification.spec.ts)

##### Pre-launch contract changes land as one coherent break without compatibility paths

- Requirement: `system/process/pre-launch-changes-stay-coherent`
- Statement: Until public launch, a contract change shall land as one coherent break that updates every affected producer, consumer, test, fixture, and document together, and shall not add compatibility shims, aliases, dual paths, or deprecation windows.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The obligation is review-enforced; the repository supplies its declaration in the committed agent instructions from which every change is directed.
- Methods: contract
- Assumptions: Human and agent reviewers enforce the clean-break policy on each change; the evidence establishes only that the policy is declared.
- Limitation: The obligation is time-boxed to the pre-launch period and its evidence establishes only that the clean-break policy is declared in the committed agent instructions; it cannot observe whether an individual change honored the policy. Retires when: Public launch of AXM, when backward compatibility returns to scope and this obligation is retired or superseded by the launch compatibility policy in the same change.
- Source: [`specifications/system/process/pre-launch-changes-stay-coherent.spec.ts`](../specifications/system/process/pre-launch-changes-stay-coherent.spec.ts)

##### Repository-authored tracked content references no private coordination context

- Requirement: `system/process/public-artifacts-protect-private-context`
- Statement: Repository-authored tracked text content in the public AXM repository shall not reference the private work tracker or the private platform repository, so public artifacts carry no private coordination context.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the tracked file set reported by git and the committed text content can show whether public artifacts reference private context.
- Methods: contract
- Assumptions: Installed extension content under agent_extensions/ is published extension content that AXM manages and the Registry governs, not a repository-authored artifact; the obligation and its scan cover repository-authored content only.
- Source: [`specifications/system/process/public-artifacts-protect-private-context.spec.ts`](../specifications/system/process/public-artifacts-protect-private-context.spec.ts)

##### Release preparation isolates candidate state until delivery

- Requirement: `system/process/release-preparation-isolates-candidate-state`
- Statement: Release preparation shall generate candidate state in a disposable detached worktree with a frozen lockfile, deliver it only in a real run after confirming the invoking checkout is unchanged, and clean up every allocated candidate even when a step fails.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `safe-repetition`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed task interface and the contributor-facing release guide show what the release-preparation entry point promises about candidate isolation, delivery, and cleanup; the orchestration itself is driven against a fake host by the bound tooling gate.
- Methods: contract
- Assumptions: The tooling test gate declared as bound evidence runs on every change through the required aggregate check.
- Bound evidence: `test: axm:test (scripts/release-prepare.tooling.test.ts)` — Drives release preparation against a fake host and checks that candidate state is allocated and initialized from the preflighted source commit, that a dry run prepares the candidate and never commits, pushes, or opens a pull request, that a real run commits and confirms the invoking checkout is unchanged before pushing, that every allocated candidate is cleaned up when any later step fails, that a cleanup failure never hides the primary failure, and that the entry point allocates a temporary detached worktree installed with a frozen lockfile.
- Source: [`specifications/system/process/release-preparation-isolates-candidate-state.spec.ts`](../specifications/system/process/release-preparation-isolates-candidate-state.spec.ts)

##### Release preparation validates production Registry gates without distribution

- Requirement: `system/process/release-preparation-validates-production-gates`
- Statement: Release preparation shall preflight the production Registry before allocating candidate state and shall validate the exact generated candidate against the production Registry in preview-only mode, never applying a publication.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed task interface and the contributor-facing release guide show what the release-preparation entry point promises about the production Registry preflight and preview; the orchestration order and the preview publication contract are driven against a fake host by the bound tooling gate.
- Methods: contract
- Assumptions: A preview publication against the production Registry reports the same gate outcomes a real publication would enforce.; The tooling test gate declared as bound evidence runs on every change through the required aggregate check.
- Bound evidence: `test: axm:test (scripts/release-prepare.tooling.test.ts)` — Drives release preparation against a fake host and checks that the production Registry preflight runs before any candidate state is allocated and stops preparation when it fails, that the exact generated candidate is previewed against the Registry only after versioning, changelog, and bundled-skill generation, and that the production preview publication targets the production Registry in verify-on-existing preview mode with no apply path.
- Source: [`specifications/system/process/release-preparation-validates-production-gates.spec.ts`](../specifications/system/process/release-preparation-validates-production-gates.spec.ts)

##### Releases publish only through the canonical automated workflow

- Requirement: `system/process/releases-publish-through-canonical-workflow`
- Statement: Release artifacts shall be published only by the canonical publish.yml workflow, triggered by a published release or an explicit release tag and validating release assets before completion, and no other workflow shall publish release artifacts.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed workflow files show which workflow publishes releases, what triggers it, and that no other workflow does.
- Methods: contract
- Assumptions: Publishing credentials are available only to the canonical workflow, so no manual or external path can publish release artifacts.
- Source: [`specifications/system/process/releases-publish-through-canonical-workflow.spec.ts`](../specifications/system/process/releases-publish-through-canonical-workflow.spec.ts)

## Product goals

### Shared across AgentXM repositories

- `dependable-change-process` — Changes and releases land through the governed repository process with required evidence and human approval.
- `extension-adoption` — People and agents can find, install, update, and remove reusable extensions across coding agents through dependable product surfaces.
- `knowledge-access` — People and agents can discover concepts, commands, and contracts from the surface they are already using.
- `machine-automation` — Machine consumers can drive AgentXM surfaces non-interactively with complete, schema-backed results separated from diagnostics.
- `privacy-and-consent` — Observation of product use stays within the documented data boundary and under the control of the person being observed.
- `trustworthy-distribution` — Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.

### Local to AXM

- `actionable-diagnostics` — People and agents can understand invalid workspace state and recover it through ordinary commands without a repair workflow.
- `agent-interoperability` — Configured extensions realize correctly and completely for every configured coding agent's native surfaces.
- `authoring-and-creation` — Extension authors can create, evolve, and version workspace-authored extensions with explicit authority transitions.
- `platform-reach` — AXM works on every supported operating system, runtime, shell, and filesystem.
- `safe-repetition` — Every operation is safe to repeat and safe to interrupt: reruns are no-ops, failures roll back their closure, and surviving authority converges.
- `workspace-intent-fidelity` — Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.
