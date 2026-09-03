# AXM specification catalog

Generated from `specifications/` metadata by `scripts/specification-catalog.ts`.
Do not edit by hand: run `pnpm run generate` after a specification change.
This catalog lists every requirement specification whether or not its
implementation currently passes; execution evidence lives in test results,
never here. An accepted specification is normative; a candidate records a
proposed obligation and its sources and is not authority until its subject
batch is accepted. Requirements are organized by their role in the product
contract: product behavior, programmatic interfaces, and supporting system
behavior.

## Product behavior

### CLI

#### Activation Follows Desired State

##### Activation commands change realized surfaces without touching content or resolutions

- Requirement: `cli/activation-follows-desired-state`
- Status: accepted
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
- Status: accepted
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

##### Agent membership changes update the durable target set and its owned outputs together

- Requirement: `cli/agents/membership-changes-realize-affected-outputs`
- Status: accepted
- Statement: When a coding agent is added to or removed from the workspace, AXM shall update the durable agent set and that agent's owned outputs in one operation, and shall not remove content it cannot prove it owns or that another configured agent still reaches.
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
- Status: accepted
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
- Status: accepted
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
- Status: accepted
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
- Status: accepted
- Statement: No command shall expose a bare --force flag, and every override flag a command exposes shall name in its help text the one policy it bypasses.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract
- Source: [`specifications/cli/force-bypasses-only-named-policies.spec.ts`](../specifications/cli/force-bypasses-only-named-policies.spec.ts)

#### Install

##### Install records direct workspace intent and realizes the extension

- Requirement: `cli/install/direct-intent-recorded-and-realized`
- Status: accepted
- Statement: When a person installs an acquirable extension, the install command shall record it as directly desired workspace configuration, record its accepted resolution in the lockfile, materialize its canonical content, realize it for every configured agent, and report an applied outcome.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/direct-intent-recorded-and-realized.spec.ts`](../specifications/cli/install/direct-intent-recorded-and-realized.spec.ts)

##### Workspace install treats inline MCP configuration as sync-owned, not acquirable

- Requirement: `cli/install/inline-mcp-configuration-not-acquirable`
- Status: accepted
- Statement: When the workspace's declared extensions are installed and axm.json configures an MCP server inline, the install command shall report that entry as owned by sync rather than acquirable, shall not fail, and shall not record it in the lockfile.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/inline-mcp-configuration-not-acquirable.spec.ts`](../specifications/cli/install/inline-mcp-configuration-not-acquirable.spec.ts)

##### Install rejects a source it cannot install without changing the workspace

- Requirement: `cli/install/non-installable-sources-do-not-mutate`
- Status: accepted
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
- Status: accepted
- Statement: When an extension is installed, the install command shall leave hand-authored content in agent directories and unrelated project files byte-for-byte intact and shall preserve every unrelated setting while adding the new declaration.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts`](../specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts)

##### Install preview describes the plan without changing any state

- Requirement: `cli/install/preview-is-pure`
- Status: accepted
- Statement: When the install command runs in preview mode, it shall report the planned closure with a previewed outcome, shall not change settings, the lockfile, canonical content, or agent projections, and a subsequent apply shall realize exactly the closure the preview described.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preview-is-pure.spec.ts`](../specifications/cli/install/preview-is-pure.spec.ts)

##### Installing an already desired extension at the same constraint is a successful no-op

- Requirement: `cli/install/reinstall-is-idempotent`
- Status: accepted
- Statement: When a person reinstalls an extension the workspace already desires at the same constraint, through either the root command or the type command, the install shall succeed with a no-op outcome and shall not change settings, the lockfile, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/projection-currency.e2e.test.ts`](../packages/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/reinstall-is-idempotent.spec.ts`](../specifications/cli/install/reinstall-is-idempotent.spec.ts)

##### Root install and the type command express the same durable intent

- Requirement: `cli/install/root-and-type-forms-express-same-intent`
- Status: accepted
- Statement: When the same extension is installed through the root install command and through its type-specific install command, both forms shall produce identical workspace configuration, identical canonical content, and identical agent projections.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts`](../specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts)

#### Instructions

##### Instruction-file management is inspected, enabled, and disabled explicitly

- Requirement: `cli/instructions/management-is-explicit`
- Status: accepted
- Statement: AXM shall manage instruction-file aliases only when management has been explicitly enabled and recorded in axm.json, shall report management status without changing workspace state, and on disable shall remove only the aliases and regions it owns while preserving authored content.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/instructions/management-is-explicit.spec.ts`](../specifications/cli/instructions/management-is-explicit.spec.ts)

#### Lint

##### Lint fix repairs only state determined by local authority

- Requirement: `cli/lint/fix-repairs-only-determined-state`
- Status: accepted
- Statement: When lint runs with --fix, it shall repair only state that local authority fully determines, such as a missing instruction alias, and shall fail with a conflict without touching the workspace when a target is unowned or its desired content is ambiguous.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/lint/fix-repairs-only-determined-state.spec.ts`](../specifications/cli/lint/fix-repairs-only-determined-state.spec.ts)

##### Local lint honors configured rule severities

- Requirement: `cli/lint/honors-configured-rule-severities`
- Status: accepted
- Statement: For each lint rule, lint shall report findings at the severity axm.json configures, suppress the rule when configured off, apply the catalog default when unconfigured, fail a normal run only on errors, and fail a --strict run on warnings as well.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/honors-configured-rule-severities.spec.ts`](../specifications/cli/lint/honors-configured-rule-severities.spec.ts)

##### Lint observes only the selected filesystem view

- Requirement: `cli/lint/observes-selected-filesystem-view`
- Status: accepted
- Statement: When a lint view is selected, lint shall evaluate only that view, reporting the staged content and its fingerprint for git-index and the working tree for workspace, and shall change neither the Git index nor the working tree.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/observes-selected-filesystem-view.spec.ts`](../specifications/cli/lint/observes-selected-filesystem-view.spec.ts)

##### Lint reports the official AXM skill against what the workspace declared

- Requirement: `cli/lint/official-skill-findings-follow-declared-intent`
- Status: accepted
- Statement: Lint shall report the official AXM skill as an informational finding when the workspace does not declare it, as a compatibility error with a reason and recovery action when the declared skill is missing, incompatible, skewed, authored, or unreadable, and as clean when compatible.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Open questions: The reason code reported for the authored and unreadable official-skill states is not pinned by the decision table, while every other error state pins one.
- Source: [`specifications/cli/lint/official-skill-findings-follow-declared-intent.spec.ts`](../specifications/cli/lint/official-skill-findings-follow-declared-intent.spec.ts)

##### Lint reports invariant violations without changing any workspace state

- Requirement: `cli/lint/reports-facts-without-mutation`
- Status: accepted
- Statement: When lint runs without --fix, it shall report every invariant violation as findings and fail the run when errors exist, shall report clean and succeed when none exist, and shall not change any workspace state in either case.
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
- Status: accepted
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
- Status: accepted
- Statement: A managed projection shall direct edits to its source only when the workspace authors that extension, and for an acquired extension shall mark the canonical content immutable and point to axm fork instead.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/managed-projection-guidance-respects-authority.spec.ts`](../specifications/cli/managed-projection-guidance-respects-authority.spec.ts)

#### Mcps

##### An imported MCP server is adopted once and reaches every configured agent

- Requirement: `cli/mcps/import/adoption-reaches-every-configured-agent`
- Status: accepted
- Statement: When an MCP server found in one agent's native configuration is imported, AXM shall record it once without an agent subset, shall project it to every configured agent that can represent it on the next reconciliation, and shall report every native target it will write in preview and apply.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/sync/realizes-desired-state`, `packages/cli/src/root/mcps/import.internal.test.ts`
- Assumptions: Claude Code and Cursor keep distinct project-scope MCP configuration files, so a server present in one file and absent from the other observes adoption reaching a second agent.
- Source: [`specifications/cli/mcps/import/adoption-reaches-every-configured-agent.spec.ts`](../specifications/cli/mcps/import/adoption-reaches-every-configured-agent.spec.ts)

##### Inline MCP entries stay authoritative workspace configuration realized only by sync

- Requirement: `cli/mcps/inline-authority-is-operation-coherent`
- Status: accepted
- Statement: An inline MCP entry in axm.json shall stay authoritative as authored, shall reach agent configuration only through sync and only while enabled without ever gaining an accepted resolution, and shall be rejected before any workspace change unless it declares exactly one of source, command, or url.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/cli/mcps/inline-authority-is-operation-coherent.spec.ts`](../specifications/cli/mcps/inline-authority-is-operation-coherent.spec.ts)

##### The inline MCP server lifecycle is explicit and safe to repeat

- Requirement: `cli/mcps/inline-lifecycle-is-idempotent`
- Status: accepted
- Statement: Adding an inline MCP server shall record it in axm.json and project it to agents without recording a resolution, uninstalling it shall remove only that configuration and its projections, and repeating either operation shall change nothing and report a no-op.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI end to end so the inline MCP add/uninstall cycle proves argv parsing, exit codes, JSON envelopes on stdout, and native agent config files on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts`](../specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts)

##### One registry MCP source supports multiple independently named local connections

- Requirement: `cli/mcps/install/local-connection-names-share-source-resolution`
- Status: accepted
- Statement: Installing a Registry MCP server under a local name with --as shall add one connection per name sharing one accepted resolution per source, and shall reject before any change an invalid name, a name owned by another source, a non-intersecting version constraint, or --as without a source.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/cli/mcps/install/local-connection-names-share-source-resolution.spec.ts`](../specifications/cli/mcps/install/local-connection-names-share-source-resolution.spec.ts)

##### MCP servers reach every configured agent that can represent them

- Requirement: `cli/mcps/projects-to-every-configured-agent`
- Status: accepted
- Statement: When an MCP server is configured, enabled, or re-enabled, AXM shall write it to the native configuration of every configured agent that can represent it, shall report each agent that cannot as unsupported rather than omitting it, and disabling or uninstalling it shall remove it from every agent it reached.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/activation-follows-desired-state`, `packages/extension-workspace/src/mcps/shared-target-catalog.internal.test.ts`
- Assumptions: Claude Code and Cursor keep distinct project-scope MCP configuration files, so two native files observe two agents.; Amp is catalogued without MCP configuration support, so it stands for any configured agent that cannot represent a server.
- Source: [`specifications/cli/mcps/projects-to-every-configured-agent.spec.ts`](../specifications/cli/mcps/projects-to-every-configured-agent.spec.ts)

##### Uninstall removes one local MCP connection and retains shared source state

- Requirement: `cli/mcps/uninstall/removes-one-local-connection-at-a-time`
- Status: accepted
- Statement: When a locally named MCP connection is uninstalled, AXM shall remove only that connection from axm.json and agent configuration, and shall retain the shared source's package content and accepted resolution until no connection to that source remains.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts`](../specifications/cli/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts)

##### Updating one locally named connection advances every connection sharing its source

- Requirement: `cli/mcps/update/shared-source-update-is-closure-wide`
- Status: accepted
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
- Status: accepted
- Statement: When a workspace change cannot complete, the command shall fail with a typed error, shall render no result document, and shall leave settings, lockfile, canonical content, projections, and temporary directories exactly as they were.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/mutations-are-closure-atomic.spec.ts`](../specifications/cli/mutations-are-closure-atomic.spec.ts)

#### Packs

##### Authored packs grow membership that stays reachable through the pack

- Requirement: `cli/packs/authored-packs-expand-membership`
- Status: accepted
- Statement: Creating a workspace-authored pack shall record it in axm.json without an accepted resolution, adding an installed extension shall record it as a pack dependency, and a member reached only through the pack shall stay resolved and realized after its direct configuration is removed.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/packs.e2e.test.ts`](../packages/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/packs/authored-packs-expand-membership.spec.ts`](../specifications/cli/packs/authored-packs-expand-membership.spec.ts)

#### Projection Currency Follows State Authority

##### Generated document currency follows authoritative inputs, not rendered bytes

- Requirement: `cli/projection-currency-follows-state-authority`
- Status: accepted
- Statement: Reconciliation shall judge a generated document current by its authoritative inputs and generation record rather than its rendered bytes, preserving body rewrites while inputs are unchanged, regenerating when inputs change, and blocking on invalid ownership markers without altering the file.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/projection-currency.e2e.test.ts`](../packages/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Source: [`specifications/cli/projection-currency-follows-state-authority.spec.ts`](../specifications/cli/projection-currency-follows-state-authority.spec.ts)

#### Publish

##### Publish preview evaluates the fixed publication gate and distributes nothing

- Requirement: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Status: accepted
- Statement: A publish preview shall report the admitted publication set without uploading anything or changing workspace state, and the fixed publication gate shall block an ineligible extension in preview and apply alike regardless of any locally relaxed lint rule.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`specifications/cli/publish/preview-is-pure-and-gate-is-fixed.spec.ts`](../specifications/cli/publish/preview-is-pure-and-gate-is-fixed.spec.ts)

##### Publish refuses extensions the workspace does not author

- Requirement: `cli/publish/requires-established-authorship`
- Status: accepted
- Statement: Publish shall distribute only extensions the workspace authors: an explicitly selected installed extension shall fail with a conflict that suggests adopting it, a bulk publish shall report it as not authored rather than selecting it, and nothing shall be uploaded either way.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/publish/requires-established-authorship.spec.ts`](../specifications/cli/publish/requires-established-authorship.spec.ts)

##### Publish requires explicit acceptance when archive content differs from Git HEAD

- Requirement: `cli/publish/requires-explicit-acceptance-for-non-head-source`
- Status: accepted
- Statement: When an extension's archive differs from Git HEAD or the repository has no HEAD, publish shall report the difference and block the whole selection until --accept-warnings is given, while archives matching HEAD, outside Git, or differing only in excluded paths shall publish without acceptance.
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
- Status: accepted
- Statement: When a present project or user settings file is malformed, schema-invalid, or unreadable, every workspace operation shall stop before it begins with a validation error naming that file and a repair route, and shall change no workspace state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts`](../packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts) — Proves at the real process boundary what the in-memory harness cannot: the shipped command wiring routes every sampled command family through the settings gate, machine stdout stays a valid document separated from stderr diagnostics, exit codes are nonzero, and version and help remain outside the gate.
- Source: [`specifications/cli/settings-validity-gates-operations.spec.ts`](../specifications/cli/settings-validity-gates-operations.spec.ts)

#### Skills

##### Bundled official-skill recovery converges without changing source authority

- Requirement: `cli/skills/install/bundled-recovery-converges`
- Status: accepted
- Statement: Installing the bundled official AXM skill shall record it as bundled workspace-owned content and retire its Registry resolution while leaving other resolutions intact and the workspace lint-clean, shall change nothing when repeated, and shall be blocked before any change when the workspace authors a skill of that name.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Open questions: The title says recovery converges without changing source authority, yet the recovery scenario rewrites the skill's axm.json entry from a Registry locator to a bundled workspace entry; which authority is meant to stay unchanged is unclear.
- Source: [`specifications/cli/skills/install/bundled-recovery-converges.spec.ts`](../specifications/cli/skills/install/bundled-recovery-converges.spec.ts)

##### A new skill is scaffolded for the universal location and every configured agent

- Requirement: `cli/skills/new/scaffolds-for-every-configured-agent`
- Status: accepted
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
- Status: accepted
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
- Status: accepted
- Statement: Sync shall never rewrite axm.json or alter an accepted resolution that still satisfies its constraint, shall restore realized content from the accepted resolution even when a newer version is available, and shall record a resolution only for a desired extension that has none.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts`](../specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts)

##### Sync never removes agent-native content without AXM ownership proof

- Requirement: `cli/sync/preserves-unowned-agent-content`
- Status: accepted
- Statement: When sync retires agent-native content that desired state no longer reaches, it shall remove only content AXM can prove it owns and shall leave hand-authored neighbors in the same agent directory untouched.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/preserves-unowned-agent-content.spec.ts`](../specifications/cli/sync/preserves-unowned-agent-content.spec.ts)

##### Sync converges AXM-owned outputs bidirectionally on desired state

- Requirement: `cli/sync/realizes-desired-state`
- Status: accepted
- Statement: Sync shall converge AXM-owned outputs on desired state, restoring missing projections from canonical content and missing canonical content from the exact accepted identity, removing owned outputs desired state no longer reaches, and reporting a no-op once managed state agrees with desired state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/realizes-desired-state.spec.ts`](../specifications/cli/sync/realizes-desired-state.spec.ts)

#### Uninstall

##### Uninstalling an extension the workspace does not desire is a safe no-op

- Requirement: `cli/uninstall/is-idempotent`
- Status: accepted
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
- Status: accepted
- Statement: When a directly desired extension is uninstalled, AXM shall remove its direct configuration from axm.json, shall remove its resolution, canonical content, and projections only when no other desired route still reaches it, reporting retained state otherwise, and shall leave every other desired extension's state untouched.
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
- Status: accepted
- Statement: Update of a desired Registry extension shall advance its accepted resolution and realized content to the newest version within the durable constraint without changing axm.json or any other extension, shall be a no-op when already current, and shall be blocked for an extension the workspace does not desire.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Assumptions: The version constraint recorded at install bounds which newer publications an update may accept; the evidence exercises only an unconstrained install.
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects that in-memory execution cannot expose.
- Source: [`specifications/cli/update/advances-resolution-within-intent.spec.ts`](../specifications/cli/update/advances-resolution-within-intent.spec.ts)

##### Targeted update routes bundled source to its converging recovery

- Requirement: `cli/update/bundled-source-routes-to-recovery`
- Status: accepted
- Statement: When a targeted update names an extension whose source is bundled with the AXM executable, the update shall be blocked in preview and apply without contacting any Registry or changing workspace state, and shall suggest reinstalling the bundled skill as the recovery path.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/update/bundled-source-routes-to-recovery.spec.ts`](../specifications/cli/update/bundled-source-routes-to-recovery.spec.ts)

#### Workspace Lockfile Rejections Name State And Recovery

##### Workspace lockfile rejections name the observed state and a safe recovery route

- Requirement: `cli/workspace-lockfile-rejections-name-state-and-recovery`
- Status: accepted
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
- Status: accepted
- Statement: AXM shall install through its supported bash, PowerShell, and cmd installers, each verifying artifact integrity by checksum, and a release shall not complete until installation has been verified on every supported shell.
- Class: quality (installability)
- Role: experience
- Product goals: `platform-reach`, `trustworthy-distribution`
- Boundary: repository; selection: release-candidate
- Boundary rationale: Only the committed installer scripts and the publish.yml workflow show which channels exist, that they verify integrity, and that release completion waits on install verification.
- Methods: contract
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout, proving checksum verification, PATH guidance, and a working installed product.
- Source: [`specifications/system/installability/product-installs-through-supported-channels.spec.ts`](../specifications/system/installability/product-installs-through-supported-channels.spec.ts)

#### Security

##### Telemetry collection follows only the operator's environment consent

- Requirement: `system/security/telemetry-consent-and-precedence`
- Status: accepted
- Statement: Telemetry collection shall follow only the operator's environment, collecting by default, honoring the telemetry control to disable collection or limit it to errors, giving the do-not-track convention precedence over every other control, and reading no telemetry control from committed workspace configuration.
- Class: quality (security)
- Role: experience
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Open questions: One scenario reads the committed settings schema from the repository although no boundary beyond memory is declared, so the scope of the default execution is unclear.
- Source: [`specifications/system/security/telemetry-consent-and-precedence.spec.ts`](../specifications/system/security/telemetry-consent-and-precedence.spec.ts)

##### Telemetry collection or delivery failure is invisible to the operation

- Requirement: `system/security/telemetry-failure-never-alters-outcomes`
- Status: accepted
- Statement: When telemetry collection or delivery fails for any reason, the requested operation shall complete with the outcome it would have had without telemetry, and the failure shall neither fail nor alter that operation.
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
- Status: accepted
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
- Status: accepted
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
- Status: accepted
- Statement: The lint rule catalog shall expose exactly the accepted rule identities in reporting order, and each rule shall declare its accepted default severity, its rule group, and the filesystem views (workspace, git-index) it observes.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Source: [`specifications/cli/lint/catalog-is-complete.spec.ts`](../specifications/cli/lint/catalog-is-complete.spec.ts)

##### Lint distinguishes AXM-owned residue from genuinely undeclared agents

- Requirement: `cli/lint/distinguishes-owned-residue-from-undeclared-agents`
- Status: accepted
- Statement: When a workspace still contains AXM-owned projections for an agent that is no longer declared, lint shall report that residue as stale projections and shall not report the agent as detected but undeclared.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/lint/distinguishes-owned-residue-from-undeclared-agents.spec.ts`](../specifications/cli/lint/distinguishes-owned-residue-from-undeclared-agents.spec.ts)

##### Lint findings identify the violated invariant and affected subject as facts

- Requirement: `cli/lint/findings-name-the-violated-invariant`
- Status: accepted
- Statement: When lint reports a finding in machine output mode, the finding shall carry a stable rule identity, the affected subject, the deciding authority, the observed state, the expected invariant, and its location, and shall carry no advisory or suggestion content.
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
- Status: accepted
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
- Status: accepted
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
- Status: accepted
- Statement: When machine output mode is on, a command that needs interactive input shall terminate with an approval-required failure and shall not raise any prompt, while the same request with machine output off shall prompt and honor the answer.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/machine-mode-never-prompts.spec.ts`](../specifications/cli/machine-mode-never-prompts.spec.ts)

#### Mcps

##### MCP inventory distinguishes local connection identity from source resolution

- Requirement: `cli/mcps/list/local-name-source-and-resolution-are-distinct`
- Status: accepted
- Statement: When MCP servers are listed, AXM shall report each connection's local name, its source, and its accepted resolution as distinct fields in machine output and as separate columns in human output, so that connections sharing one source remain individually identifiable.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: golden-output, contract
- Source: [`specifications/cli/mcps/list/local-name-source-and-resolution-are-distinct.spec.ts`](../specifications/cli/mcps/list/local-name-source-and-resolution-are-distinct.spec.ts)

#### Sync

##### Sync reports aggregate projection drift at ownership-unit precision

- Requirement: `cli/sync/reports-aggregate-projection-drift-at-unit-precision`
- Status: accepted
- Statement: When an aggregate projection like an instruction file's rules or knowledge region drifts, a sync preview shall report it as stale or missing at the owning managed unit and region, and shall not attribute the cause to any individual contributing extension.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract, example
- Source: [`specifications/cli/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts`](../specifications/cli/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts)

### Extension identity

#### Canonical Names Round Trip

##### A canonical extension name always parses back to the identity that produced it

- Requirement: `extension-identity/canonical-names-round-trip`
- Status: accepted
- Statement: A fully qualified name or owner handle produced from an extension identity shall parse back to exactly that identity, and appending a version constraint to the name shall not change which extension it identifies.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`specifications/extension-identity/canonical-names-round-trip.spec.ts`](../specifications/extension-identity/canonical-names-round-trip.spec.ts)

#### Malformed Names Are Rejected

##### A malformed extension name is rejected with a typed failure naming the input

- Requirement: `extension-identity/malformed-names-are-rejected`
- Status: accepted
- Statement: A reference that does not match the extension name grammar, including any bare name, shall be rejected with a typed failure that preserves the offending input, and a malformed version constraint shall be rejected with guidance naming the version constraint.
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
- Status: accepted
- Statement: A companion package shall be declared by a versionless package identity in a supported ecosystem, and a declaration that pins a version or names an unsupported ecosystem shall be refused with guidance toward the compatibility range or naming that ecosystem.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/package-identity/companion-packages-are-identities-not-pins.spec.ts`](../specifications/package-identity/companion-packages-are-identities-not-pins.spec.ts)

#### Compatibility Ranges Match The Package Ecosystem

##### A companion compatibility range is a concrete ecosystem range matching its package identity

- Requirement: `package-identity/compatibility-ranges-match-the-package-ecosystem`
- Status: accepted
- Statement: A companion compatibility range shall be a vers range carrying at least one plain constraint in the same concrete package ecosystem as its package identity, and any generic, empty, wildcard-only, encoded, or mismatched range shall be refused with guidance naming the flaw.
- Class: functional
- Role: interface
- Product goals: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts`](../specifications/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts)

### Settings contract

#### Agent Membership Is The Only Agent Selection

##### Workspace settings select agents only through the workspace agent list

- Requirement: `settings-contract/agent-membership-is-the-only-agent-selection`
- Status: accepted
- Statement: Workspace settings shall express agent selection only through the workspace agent list, shall reject an extension entry that declares its own agent subset with an error naming that key, and the published settings schema shall admit no per-entry agent subset.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `settings-contract/published-schemas-agree-with-accepted-input`, `cli/settings-validity-gates-operations`, `packages/workspace-state/src/settings/schema.internal.test.ts`
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.; The product reads settings with excess keys treated as errors, so decoding here with the same option observes the product's acceptance boundary.
- Source: [`specifications/settings-contract/agent-membership-is-the-only-agent-selection.spec.ts`](../specifications/settings-contract/agent-membership-is-the-only-agent-selection.spec.ts)

#### Published Schemas Agree With Accepted Input

##### The published settings and lockfile schemas describe what the product accepts

- Requirement: `settings-contract/published-schemas-agree-with-accepted-input`
- Status: accepted
- Statement: The published settings and lockfile schemas shall agree with the product on every example document, top-level key, lint rule identity, severity value, and lockfile version, and shall not admit an unregistered rule, wildcard rule, misspelled severity, or other lockfile version.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Assumptions: The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.
- Source: [`specifications/settings-contract/published-schemas-agree-with-accepted-input.spec.ts`](../specifications/settings-contract/published-schemas-agree-with-accepted-input.spec.ts)

#### Saving Settings Preserves Authored Formatting

##### Saving settings preserves authored formatting, ordering, and unrecognized content

- Requirement: `settings-contract/saving-settings-preserves-authored-formatting`
- Status: accepted
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
- Status: accepted
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

##### Telemetry payloads carry only the documented observation fields

- Requirement: `system/security/telemetry-payloads-respect-data-boundary`
- Status: accepted
- Statement: Every telemetry event AXM sends shall carry only the documented observation fields for identity, timing, and command context, so that extension content, authored instructions and knowledge, credentials, and resolved secret values have no field in which to travel.
- Class: quality (security)
- Role: interface
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: golden-output
- Assumptions: Values inside the properties field carry only documented observation data; the evidence bounds only top-level field names.
- Open questions: The allowed field list is declared inside the specification rather than read from a published telemetry contract, so which document is authoritative for the data boundary is unresolved.
- Source: [`specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts`](../specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts)

### Version constraints

#### Constraint Intersection Preserves Every Limit

##### Combining version constraints keeps every contributor's limits or reports the combination unsatisfiable

- Requirement: `version-constraints/constraint-intersection-preserves-every-limit`
- Status: accepted
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
- Status: accepted
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

##### MCP secret accounts isolate workspace, local connection, source, and input identity

- Requirement: `cli/mcps/secret-namespaces-include-local-and-source-identity`
- Status: accepted
- Statement: The account under which AXM stores an MCP secret shall be derived deterministically from the workspace root, the local connection name, the source identity, and the input name, so that changing any one of those yields a different account.
- Class: quality (security)
- Role: supporting
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: property
- Assumptions: The derivation encodes the four namespace components unambiguously, so distinct component combinations cannot collide except through the underlying hash.
- Source: [`specifications/cli/mcps/secret-namespaces-include-local-and-source-identity.spec.ts`](../specifications/cli/mcps/secret-namespaces-include-local-and-source-identity.spec.ts)

### System

#### Architecture

##### End-to-end suites reach the product only as a shipped artifact, never as imported code

- Requirement: `system/architecture/e2e-observes-only-shipped-artifacts`
- Status: accepted
- Statement: End-to-end test projects shall exercise AXM only through its shipped artifacts and shall not declare a dependency on, or a project reference to, any product source package.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests and TypeScript project references of the end-to-end projects show whether they reach product source directly.
- Methods: contract
- Assumptions: Relative imports that cross project roots are rejected by the module-boundary lint rather than by this evidence.
- Source: [`specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts`](../specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts)

##### Environment-backed service composition happens only in the application composition root

- Requirement: `system/architecture/live-composition-stays-in-application`
- Status: accepted
- Statement: Environment-backed and in-memory service implementations shall be composed only at the application composition root, and production source in any other package shall not import them directly.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed lint configuration shows that the import restriction is armed and that its exception list is exactly the sanctioned one.
- Methods: contract
- Assumptions: The lint gate declared as bound evidence runs on every change through the required aggregate check.
- Bound evidence: `lint: no-restricted-imports (@agentxm/*/live, @agentxm/*/testing)` — Rejects concrete environment-backed Layer imports and in-memory port imports from production source outside the application composition root, while tests and specifications keep their sanctioned exceptions.
- Source: [`specifications/system/architecture/live-composition-stays-in-application.spec.ts`](../specifications/system/architecture/live-composition-stays-in-application.spec.ts)

##### Production package dependencies point inward, stay acyclic, and keep features isolated

- Requirement: `system/architecture/package-dependencies-point-inward`
- Status: accepted
- Statement: Production package dependencies shall point only inward from the application through feature, kernel, integration, and contract levels, shall never form a cycle, and no feature package shall depend on another feature package.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed Nx and lint configuration shows that the module-boundary and manifest-fidelity gates are armed with the intended level constraints and cycle detection.
- Methods: contract
- Assumptions: The module-boundary and manifest-fidelity lint gates run on every change through the required aggregate check.
- Bound evidence: `lint: @nx/enforce-module-boundaries` — Rejects outward or feature-to-feature workspace imports, undeclared transitive dependencies, external imports outside a constrained package's budget, and dependency cycles across every production project.
- Bound evidence: `lint: @nx/dependency-checks` — Keeps each buildable package manifest aligned with its actual imports so the graph Nx derives is truthful.
- Source: [`specifications/system/architecture/package-dependencies-point-inward.spec.ts`](../specifications/system/architecture/package-dependencies-point-inward.spec.ts)

##### The public system depends on private platform responsibilities only through published contracts

- Requirement: `system/architecture/public-system-depends-only-on-published-contracts`
- Status: accepted
- Statement: The public AXM system shall depend on private platform responsibilities only through published packages and generated clients tracked in this repository, and no workspace package shall reference a private package or a filesystem path outside the repository.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed package manifests and the tracked generated client directories show what the public system actually depends on.
- Methods: contract
- Open questions: Whether the registry client must be generated from a published contract is unresolved: the scenario accepts either a generated directory or any source directory, so it cannot fail for the registry client.
- Source: [`specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts`](../specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts)

##### Specification layout mirrors the command tree and declared identities

- Requirement: `system/architecture/specification-folders-mirror-command-tree`
- Status: accepted
- Statement: Every specification directory under cli shall name a registered command path, every requirement identity shall equal its file path under specifications, and no symbolic link shall hide specification content from discovery.
- Class: constraint
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the specification tree on disk, compared with the registered command tree, can show that folders, identities, and file paths correspond.
- Methods: contract
- Source: [`specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts`](../specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts)

#### Compatibility

##### Every supported platform and shell receives release-blocking verification

- Requirement: `system/compatibility/supported-platform-matrix`
- Status: accepted
- Statement: Every supported operating system, architecture, and installer shell shall receive release-blocking verification, and Windows workspace behavior shall be verified on a real Windows runner.
- Class: quality (compatibility)
- Role: supporting
- Product goals: `platform-reach`
- Boundary: repository; selection: platform-matrix
- Boundary rationale: Only the committed ci.yml and publish.yml workflow files show which platforms, shells, and runners the release-blocking verification covers.
- Methods: contract
- Assumptions: A job named in the workflow files blocks its merge or release rather than running as an advisory check.
- Additional evidence: binary via [`packages/cli-e2e/src/binary-smoke.e2e.test.ts`](../packages/cli-e2e/src/binary-smoke.e2e.test.ts) — Executes the compiled platform binary, proving the shipped artifact starts and answers on the target operating system and architecture.
- Additional evidence: platform via [`packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts`](../packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts) — Exercises workspace mutation semantics on a real Windows filesystem, where path, symlink, and lock behavior differ from POSIX.
- Source: [`specifications/system/compatibility/supported-platform-matrix.spec.ts`](../specifications/system/compatibility/supported-platform-matrix.spec.ts)

#### Process

##### Changes land through human-reviewed pull requests, with requirements changes routed to maintainers

- Requirement: `system/process/changes-land-through-reviewed-pull-requests`
- Status: accepted
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
- Status: accepted
- Statement: Until the recorded TypeScript 7.1 exit condition is met, the workspace shall resolve tsc to native TypeScript 7 and shall keep the typescript package resolving to the TypeScript 6 compatibility package.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed workspace catalog in pnpm-workspace.yaml shows which packages the two TypeScript aliases resolve to.
- Methods: contract
- Open questions: The exit condition is described as recorded, but the specification does not name where it is recorded or how meeting it is observed.
- Source: [`specifications/system/process/dual-typescript-alias-retained.spec.ts`](../specifications/system/process/dual-typescript-alias-retained.spec.ts)

##### Changes are verified by one aggregate required check before merge

- Requirement: `system/process/merges-require-aggregate-verification`
- Status: accepted
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
- Status: accepted
- Statement: Until public launch, a contract change shall land as one coherent break that updates every affected producer, consumer, test, fixture, and document together, and shall not add compatibility shims, aliases, dual paths, or deprecation windows.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The obligation is review-enforced; the repository supplies its declaration in the committed agent instructions from which every change is directed.
- Methods: contract
- Assumptions: Human and agent reviewers enforce the clean-break policy on each change; the evidence establishes only that the policy is declared.
- Source: [`specifications/system/process/pre-launch-changes-stay-coherent.spec.ts`](../specifications/system/process/pre-launch-changes-stay-coherent.spec.ts)

##### Tracked repository content references no private coordination context

- Requirement: `system/process/public-artifacts-protect-private-context`
- Status: accepted
- Statement: Tracked text content in the public AXM repository shall not reference the private work tracker or the private platform repository, so public artifacts carry no private coordination context.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the tracked file set reported by git and the committed text content can show whether public artifacts reference private context.
- Methods: contract
- Open questions: Tracked content under agent_extensions is exempt from the check without a recorded reason for the exemption.
- Source: [`specifications/system/process/public-artifacts-protect-private-context.spec.ts`](../specifications/system/process/public-artifacts-protect-private-context.spec.ts)

##### Release preparation isolates candidate state until delivery

- Requirement: `system/process/release-preparation-isolates-candidate-state`
- Status: accepted
- Statement: Release preparation shall generate candidate state in a disposable detached worktree with a frozen lockfile, deliver it only in a real run after confirming the invoking checkout is unchanged, and clean up every allocated candidate even when a step fails.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `safe-repetition`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed release-preparation scripts and their tooling tests show how candidate state is allocated, delivered, and cleaned up.
- Methods: model, decision-table
- Source: [`specifications/system/process/release-preparation-isolates-candidate-state.spec.ts`](../specifications/system/process/release-preparation-isolates-candidate-state.spec.ts)

##### Release preparation validates production Registry gates without distribution

- Requirement: `system/process/release-preparation-validates-production-gates`
- Status: accepted
- Statement: Release preparation shall preflight the production Registry before allocating candidate state and shall validate the exact generated candidate against the production Registry in preview-only mode, never applying a publication.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the committed release scripts show the preflight order, the production Registry address, and the preview-only publication arguments.
- Methods: contract, decision-table
- Assumptions: A preview publication against the production Registry reports the same gate outcomes a real publication would enforce.
- Source: [`specifications/system/process/release-preparation-validates-production-gates.spec.ts`](../specifications/system/process/release-preparation-validates-production-gates.spec.ts)

##### Releases publish only through the canonical automated workflow

- Requirement: `system/process/releases-publish-through-canonical-workflow`
- Status: accepted
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
