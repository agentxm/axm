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

#### Adopt

##### Adopt moves an existing package into workspace authorship

- Requirement: `cli/adopt/moves-package-into-workspace-authorship`
- Statement: When a person adopts an existing AXM package into an unoccupied authoring location, AXM shall preserve its content in the workspace authoring directory, retain its declared activation (enabling a previously undeclared package), and remove the acquired copy and its external resolution.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/adopt/command.internal.test.ts`, `packages/cli/src/root/adopt/command.ts`
- Source: [`specifications/cli/adopt/moves-package-into-workspace-authorship.spec.ts`](../specifications/cli/adopt/moves-package-into-workspace-authorship.spec.ts)

##### Adopt preview describes the authorship transition without changing any state

- Requirement: `cli/adopt/preview-is-pure`
- Statement: When adopt runs in preview mode against a canonical package the workspace could author, it shall report the adoption it would apply with a previewed outcome and shall not move the package, create authored content, or change settings or the lockfile.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/adopt/preview-is-pure.spec.ts`](../specifications/cli/adopt/preview-is-pure.spec.ts)

#### Agent Selection Is Membership Or Filter

##### The agent option configures workspace membership or filters a listing

- Requirement: `cli/agent-selection-is-membership-or-filter`
- Statement: A command shall accept the agent option only to choose the workspace's configured agents or to filter a listing, shall reject an unsupported identifier supplied through that option before any work begins, and shall not use that option to narrow the agents for one extension.
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

##### Agent add preview describes the new membership without changing any state

- Requirement: `cli/agents/add/preview-is-pure`
- Statement: When agents add runs in preview mode for a coding agent the workspace does not yet configure, it shall report the membership and realized outputs it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/add/records-membership-and-realizes-outputs`
- Source: [`specifications/cli/agents/add/preview-is-pure.spec.ts`](../specifications/cli/agents/add/preview-is-pure.spec.ts)

##### Adding a coding agent records it durably and realizes installed extensions for it

- Requirement: `cli/agents/add/records-membership-and-realizes-outputs`
- Statement: When a coding agent is added to the workspace, AXM shall record it in the configured agent set and realize installed extensions on its supported native and shared surfaces as permitted by workspace activation and instruction settings in one operation.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/membership-changes-realize-affected-outputs`
- Supersedes: `cli/agents/membership-changes-realize-affected-outputs`
- Additional evidence: process via [`packages/cli-e2e/src/agent-membership.e2e.test.ts`](../packages/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/agents/add/records-membership-and-realizes-outputs.spec.ts`](../specifications/cli/agents/add/records-membership-and-realizes-outputs.spec.ts)

##### Agent capabilities distinguish native support from AXM integration

- Requirement: `cli/agents/capabilities/describes-native-support-and-axm-integration`
- Statement: When a person inspects a coding agent’s capabilities, AXM shall report its modeled extension support, AXM integration, applicable directories and scopes, and lifecycle.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/agents/capabilities.internal.test.ts`, `packages/cli/src/root/agents/capabilities.ts`
- Source: [`specifications/cli/agents/capabilities/describes-native-support-and-axm-integration.spec.ts`](../specifications/cli/agents/capabilities/describes-native-support-and-axm-integration.spec.ts)

##### Unknown coding-agent capability requests name corrective guidance

- Requirement: `cli/agents/capabilities/rejects-unknown-agent`
- Statement: When a capability request names an unknown coding agent, AXM shall reject it with corrective guidance and leave workspace state unchanged.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/agents/capabilities.internal.test.ts`
- Source: [`specifications/cli/agents/capabilities/rejects-unknown-agent.spec.ts`](../specifications/cli/agents/capabilities/rejects-unknown-agent.spec.ts)

##### Agent inventory distinguishes configuration from detection

- Requirement: `cli/agents/list/reports-configured-detected-and-available-agents`
- Statement: When a person lists coding agents, AXM shall distinguish configured membership from detected installations, identify their catalog lifecycle, show their union by default, and restrict the results to detected agents or include every configurable agent when the respective selection is requested.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/agents/list.internal.test.ts`, `packages/cli/src/root/agents/list.ts`
- Open questions: The combination of --detected and --available has no separately established user-facing meaning; precedence is not specified here.
- Source: [`specifications/cli/agents/list/reports-configured-detected-and-available-agents.spec.ts`](../specifications/cli/agents/list/reports-configured-detected-and-available-agents.spec.ts)

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

##### Agent remove preview describes the departing membership without changing any state

- Requirement: `cli/agents/remove/preview-is-pure`
- Statement: When agents remove runs in preview mode for a configured coding agent, it shall report the membership and owned outputs it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/agents/remove/removes-membership-and-owned-outputs`
- Source: [`specifications/cli/agents/remove/preview-is-pure.spec.ts`](../specifications/cli/agents/remove/preview-is-pure.spec.ts)

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

#### Approval Required Names A Valid Recovery

##### A blocked approval names a recovery the command line will accept

- Requirement: `cli/approval-required-names-a-valid-recovery`
- Statement: When an apply stops as approval required, its recovery shall name the approval its route supports — a replay carrying the advance-approval flag where the route offers one, otherwise an interactive rerun without machine or non-interactive switches — the named command shall parse on the real command line, and a request whose values cannot be replayed safely shall describe the recovery without echoing those values.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/lockfile-rejections-name-recovery-routes`, `cli/confirmation-flags-have-a-supported-purpose`
- Source: [`specifications/cli/approval-required-names-a-valid-recovery.spec.ts`](../specifications/cli/approval-required-names-a-valid-recovery.spec.ts)

#### Authoring Uses Project Workspace

##### Authoring commands use the project workspace

- Requirement: `cli/authoring-uses-project-workspace`
- Statement: Commands that create or change authored packages shall operate in the selected project workspace and reject a user-scope selector without changing either workspace.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI must reject a scope option before executing an authoring command and establish authored content under the selected project directory.
- Methods: contract, example
- Derived from: `packages/cli/src/root/scope-contract.ts`, `packages/cli/src/app.internal.test.ts`
- Source: [`specifications/cli/authoring-uses-project-workspace.spec.ts`](../specifications/cli/authoring-uses-project-workspace.spec.ts)

#### Cache

##### Cache pruning enforces the reported retention limits

- Requirement: `cli/cache/prune/enforces-reported-retention-limits`
- Statement: The cache prune command shall remove expired archives and enough excess archive storage to satisfy the reported 2 GiB limit, preserve unrelated files, and report the removed and remaining entry and byte totals.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/cache/command.ts`, `packages/registry-client/src/archive-cache.ts`
- Open questions: Should removal of the oldest archives first and the exact expiration boundary be product guarantees? The current implementation chooses both; this requirement establishes the externally reported limits without fixing those choices.
- Source: [`specifications/cli/cache/prune/enforces-reported-retention-limits.spec.ts`](../specifications/cli/cache/prune/enforces-reported-retention-limits.spec.ts)

##### Cache verification removes corrupt archives and preserves valid content

- Requirement: `cli/cache/verify/removes-only-corrupt-archives`
- Statement: The cache verify command shall compare every cached archive with its recorded integrity, remove entries whose integrity is invalid or mismatched, retain matching entries and unrelated files, and report the checked, valid, and removed counts.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/cache/command.ts`, `packages/registry-client/src/archive-cache.ts`
- Source: [`specifications/cli/cache/verify/removes-only-corrupt-archives.spec.ts`](../specifications/cli/cache/verify/removes-only-corrupt-archives.spec.ts)

#### Changes Do Not Interleave

##### Concurrent changes to one workspace never interleave

- Requirement: `cli/changes-do-not-interleave`
- Statement: When changes contend for the same workspace, AXM shall prevent one change from applying workspace writes while another is in progress and shall allow a change refused for contention to proceed when retried after the workspace becomes available.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: Separate Node processes overlap while using the production workspace-operations package’s published lock and transaction boundaries; existing handler examples establish installation outcomes.
- Methods: example
- Source: [`specifications/cli/changes-do-not-interleave.spec.ts`](../specifications/cli/changes-do-not-interleave.spec.ts)

#### Command Help Is Complete

##### Every supported command describes its invocation and purpose

- Requirement: `cli/command-help-is-complete`
- Statement: Every supported command shall present help identifying its invocation and purpose, and the rendered help tree shall list exactly the supported command paths.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Derived from: `cli/command-help-is-complete-and-alias-free`
- Supersedes: `cli/command-help-is-complete-and-alias-free`
- Source: [`specifications/cli/command-help-is-complete.spec.ts`](../specifications/cli/command-help-is-complete.spec.ts)

#### Commands Have No Alias Routes

##### No command is reachable through an alias route

- Requirement: `cli/commands-have-no-alias-routes`
- Statement: Before public launch, no supported command shall be reachable through an alias route; each command shall answer to exactly one invocation path.
- Class: constraint
- Role: experience
- Product goals: `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Derived from: `cli/command-help-is-complete-and-alias-free`
- Supersedes: `cli/command-help-is-complete-and-alias-free`
- Open questions: The alias prohibition is phrased as a pre-launch condition in its scenario; whether alias routes stay prohibited after public launch is unresolved.
- Limitation: The evidence establishes the pre-launch command surface only; it cannot establish whether alias routes remain prohibited after public launch. Retires when: Public launch, when the alias-route policy is decided and this specification is revised or retired.
- Source: [`specifications/cli/commands-have-no-alias-routes.spec.ts`](../specifications/cli/commands-have-no-alias-routes.spec.ts)

#### Commands Use Selected Directory

##### Commands use the selected working directory

- Requirement: `cli/commands-use-selected-directory`
- Statement: AXM shall execute workspace commands in the directory selected by --directory or -C, including when that selection is a symbolic link, and shall use the launch directory when no directory is selected.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI parses global arguments and selects its execution directory before composing workspace services; a real process establishes the selected filesystem boundary.
- Methods: example, decision-table
- Derived from: `packages/cli-e2e/src/directory.e2e.test.ts`, `packages/cli/help/topics/basic-usage.md`
- Open questions: Should repeated or empty directory options be rejected or have an explicit selection policy?
- Source: [`specifications/cli/commands-use-selected-directory.spec.ts`](../specifications/cli/commands-use-selected-directory.spec.ts)

#### Confirmation Flags Have A Supported Purpose

##### Advance approval is offered only where it settles one documented decision

- Requirement: `cli/confirmation-flags-have-a-supported-purpose`
- Statement: A command shall accept the advance-approval flag only when it documents the one confirmation that flag settles, an invocation carrying the flag shall change that command's outcome exactly as documented, and every other command shall reject the flag and its short spelling before any work begins.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `cli/demote/preview-is-pure`, `cli/setup/unattended-apply-requires-explicit-intent`, `cli/login/preapproval-requests-new-sign-in`
- Source: [`specifications/cli/confirmation-flags-have-a-supported-purpose.spec.ts`](../specifications/cli/confirmation-flags-have-a-supported-purpose.spec.ts)

#### Confirmation Is Required Only For Actionable Risk

##### A person is asked to confirm only when the plan carries a risk worth confirming

- Requirement: `cli/confirmation-is-required-only-for-actionable-risk`
- Statement: An apply whose plan carries no confirmable risk shall proceed without asking, an apply with nothing to do shall finish without asking, and an apply whose plan carries a confirmable risk shall ask when a prompt can open, honor a declined answer by changing nothing, and stop as approval required when no prompt can open.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/machine-mode-never-prompts`, `cli/preview-does-not-consume-approval`
- Source: [`specifications/cli/confirmation-is-required-only-for-actionable-risk.spec.ts`](../specifications/cli/confirmation-is-required-only-for-actionable-risk.spec.ts)

#### Creation Refuses Existing Content

##### Creation refuses existing declarations and authored content

- Requirement: `cli/creation-refuses-existing-content`
- Statement: When a new-extension command targets a name that is already configured or an authoring directory that already contains content, AXM shall refuse creation without replacing existing files or workspace declarations.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/extension-authoring/src/create-preflight.internal.test.ts`, `packages/cli/src/root/hooks/new.internal.test.ts`, `packages/cli/src/root/mcps/new.internal.test.ts`
- Source: [`specifications/cli/creation-refuses-existing-content.spec.ts`](../specifications/cli/creation-refuses-existing-content.spec.ts)

#### Creation Uses Configured Workspace Ownership

##### Creation uses the configured workspace owner

- Requirement: `cli/creation-uses-configured-workspace-ownership`
- Statement: When a person creates an extension, AXM shall use the configured workspace owner, accept an explicitly matching owner with or without its leading @, and refuse creation before changing workspace content when no owner is configured or the explicitly requested owner differs.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/hooks/new.internal.test.ts`, `packages/cli/src/root/shared/authored-owner.ts`, `packages/cli/src/root/shared/resolve-owner.ts`
- Source: [`specifications/cli/creation-uses-configured-workspace-ownership.spec.ts`](../specifications/cli/creation-uses-configured-workspace-ownership.spec.ts)

#### Credentials Follow Explicit Source Precedence

##### Explicit token sources take precedence over saved sessions

- Requirement: `cli/credentials-follow-explicit-source-precedence`
- Statement: For commands using the selected Registry, AXM shall use a nonempty AXM_TOKEN before AXM_TOKEN_FILE and a valid token file before saved Registry credentials, refusing an unreadable or empty selected token file instead of silently using a saved session.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/registry-auth/src/token-resolution.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/auth.e2e.test.ts`](../packages/cli-e2e/src/auth.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/auth/token/token.e2e.ts scenarios through real CLI processes. They observe raw/JSON token stdout and HTTP verification followed by token creation. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`specifications/cli/credentials-follow-explicit-source-precedence.spec.ts`](../specifications/cli/credentials-follow-explicit-source-precedence.spec.ts)

#### Credentials Stay With Their Registry

##### Credentials stay within their Registry origin

- Requirement: `cli/credentials-stay-with-their-registry`
- Statement: When authenticating a Registry request, AXM shall use ambient tokens only for the configured Registry origin and otherwise use credentials saved for the request origin or send no credential.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/registry-auth/src/token-resolution.internal.test.ts`
- Source: [`specifications/cli/credentials-stay-with-their-registry.spec.ts`](../specifications/cli/credentials-stay-with-their-registry.spec.ts)

#### Delegated Operations Narrate External Work

##### A delegating operation narrates the external work it hands off

- Requirement: `cli/delegated-operations-narrate-external-work`
- Statement: An operation that delegates work to an external tool shall publish one unit for each command it delegates, nested under the unit that delegated it, and shall publish a wait naming its blocking class and subject for each poll that blocks on that tool, so the delegated work is observable while it runs rather than only after it settles.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `cli/machine-progress-events-follow-the-lifecycle-schema`
- Limitation: The conditional wait narration obligation has no product polling witness after upgrade stopped polling publication. Retires when: A command that polls an external tool supplies an event-log example for waiting and completion.
- Limitation: Upgrade is the only delegating operation this specification exercises; another command that delegates to an external tool is covered by the statement but not yet by an example. Retires when: A second command delegates to an external tool and its event log is added to this specification.
- Source: [`specifications/cli/delegated-operations-narrate-external-work.spec.ts`](../specifications/cli/delegated-operations-narrate-external-work.spec.ts)

#### Demote

##### Demote preview describes the authority transition without consuming approval

- Requirement: `cli/demote/preview-is-pure`
- Statement: When demote runs in preview mode, it shall report the replacement it would apply with a previewed outcome that is identical with or without advance approval, shall not change settings, the lockfile, authored content, or agent projections, and an unattended apply without advance approval shall stop before changing anything and name the approval it needs.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/demote/preview-is-pure.spec.ts`](../specifications/cli/demote/preview-is-pure.spec.ts)

##### Demote returns an authored package to the selected external source

- Requirement: `cli/demote/replaces-workspace-source-with-selected-source`
- Statement: When a person demotes a workspace-authored extension to a valid external source, AXM shall replace workspace source authority with that source and its content while preserving the configured activation state, and shall refuse a workspace replacement source or a target that is not workspace authored.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/demote/command.internal.test.ts`, `packages/cli/src/root/demote/command.ts`
- Assumptions: Pack and MCP transitions use registry sources and the other types use local sources; additional registry and Git acquisition behavior is verified by its owning source requirements.
- Source: [`specifications/cli/demote/replaces-workspace-source-with-selected-source.spec.ts`](../specifications/cli/demote/replaces-workspace-source-with-selected-source.spec.ts)

#### Deprecate

##### Deprecation rejects contradictory or empty guidance

- Requirement: `cli/deprecate/rejects-conflicting-or-empty-guidance`
- Statement: The deprecate command shall reject a field supplied together with its clearing flag before contacting the Registry and reject an edit that leaves neither a message nor a replacement before attempting a write.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/lifecycle/command.ts`, `packages/cli/src/root/lifecycle/command.internal.test.ts`
- Source: [`specifications/cli/deprecate/rejects-conflicting-or-empty-guidance.spec.ts`](../specifications/cli/deprecate/rejects-conflicting-or-empty-guidance.spec.ts)

##### Deprecation edits preserve omitted guidance at the observed revision

- Requirement: `cli/deprecate/updates-guidance-at-the-observed-revision`
- Statement: The deprecate command shall compose the requested message and replacement edits with the observed guidance, preserve omitted and concealed replacement information, condition the write on the observed revision, and report the Registry's acknowledged transition with publisher guidance presented as result information.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/lifecycle/command.ts`, `packages/cli/src/root/lifecycle/command.internal.test.ts`
- Source: [`specifications/cli/deprecate/updates-guidance-at-the-observed-revision.spec.ts`](../specifications/cli/deprecate/updates-guidance-at-the-observed-revision.spec.ts)

#### Disabled Credential Persistence Requires Explicit Token

##### Environments without session storage require explicit tokens

- Requirement: `cli/disabled-credential-persistence-requires-explicit-token`
- Statement: When persisted credentials are disabled, AXM shall refuse login and saved-session authentication with explicit-token guidance while allowing commands to use an explicitly supplied environment token.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/registry-auth/src/credential-store.internal.test.ts`
- Source: [`specifications/cli/disabled-credential-persistence-requires-explicit-token.spec.ts`](../specifications/cli/disabled-credential-persistence-requires-explicit-token.spec.ts)

#### Discover

##### Discover identifies local recommendations when Registry lookup fails

- Requirement: `cli/discover/identifies-local-only-recommendations`
- Statement: When the Registry cannot supply companion recommendations, AXM shall retain valid package-declared recommendations and explicitly report that Registry results are unavailable.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/discover/handler.internal.test.ts`, `packages/extension-discovery/src/discover.ts`
- Open questions: How should local-only recommendations represent unresolved Registry identity and install version? The current fallback supplies resolved true and a synthetic 0.0.0 version; this requirement does not accept those values as verified Registry facts.
- Source: [`specifications/cli/discover/identifies-local-only-recommendations.spec.ts`](../specifications/cli/discover/identifies-local-only-recommendations.spec.ts)

##### Discover reports companions for actual project dependencies

- Requirement: `cli/discover/reports-companions-for-detected-dependencies`
- Statement: When discovering companion extensions, AXM shall report Registry recommendations only for dependencies detected in the selected project, including their observed package versions and the Registry-provided attestation information.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/getting-started.md`, `packages/cli/src/root/discover/handler.internal.test.ts`, `packages/extension-discovery/src/discover.internal.test.ts`
- Source: [`specifications/cli/discover/reports-companions-for-detected-dependencies.spec.ts`](../specifications/cli/discover/reports-companions-for-detected-dependencies.spec.ts)

#### Errors Do Not Disclose Credentials

##### Error reports keep credentials out of diagnostic details

- Requirement: `cli/errors-do-not-disclose-credentials`
- Statement: AXM shall redact credential values from error reports and their diagnostic details in human and machine output at every supported verbosity level.
- Class: quality (security)
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `packages/cli/help/topics/machine-output.md`, `packages/cli/src/cli-runtime/handle-error.internal.test.ts`, `packages/cli/src/cli-runtime/json-envelope.internal.test.ts`
- Limitation: These examples exercise production error construction and channel rendering with supplied verbosity settings; they do not establish every command-specific diagnostic producer or global flag combination. Retires when: Bind process evidence for global verbosity selection and review diagnostic producers for values that bypass the shared error boundary.
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
- Additional evidence: process via [`packages/cli-e2e/src/smoke.e2e.test.ts`](../packages/cli-e2e/src/smoke.e2e.test.ts) — Observes the shipped process streams under --json: exactly one stdout document per invocation, NDJSON diagnostics on stderr, and the redacted error envelope for failing and defect invocations — channel separation the in-memory renderer capture cannot prove.
- Source: [`specifications/cli/errors-do-not-disclose-credentials.spec.ts`](../specifications/cli/errors-do-not-disclose-credentials.spec.ts)

#### Force Bypasses Only Named Policies

##### Override flags bypass only the one policy they name

- Requirement: `cli/force-bypasses-only-named-policies`
- Statement: No command shall expose a bare --force flag; every override flag a command exposes shall name in its help text the one policy it bypasses, and a request carrying that flag shall bypass that policy while remaining subject to every other policy.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Source: [`specifications/cli/force-bypasses-only-named-policies.spec.ts`](../specifications/cli/force-bypasses-only-named-policies.spec.ts)

#### Fork

##### Fork creates a distinct workspace package while preserving its source

- Requirement: `cli/fork/creates-distinct-workspace-package`
- Statement: When a person forks one managed AXM package, AXM shall preserve the source and its reusable content while creating a workspace-authored package of the same type under the requested identity, initially disabled unless activation is requested or already configured.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/extension-authoring/src/fork-package.internal.test.ts`, `packages/cli/src/root/fork/command.ts`
- Source: [`specifications/cli/fork/creates-distinct-workspace-package.spec.ts`](../specifications/cli/fork/creates-distinct-workspace-package.spec.ts)

##### Fork preview describes the new authored package without changing any state

- Requirement: `cli/fork/preview-is-pure`
- Statement: When fork runs in preview mode against a resolvable source package, it shall report the authored package it would create with a previewed outcome and shall not create authored content or change settings, the lockfile, or the source package.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/fork/preview-is-pure.spec.ts`](../specifications/cli/fork/preview-is-pure.spec.ts)

##### Fork refuses ambiguous sources and incompatible or occupied destinations

- Requirement: `cli/fork/refuses-ambiguous-or-conflicting-packages`
- Statement: When a fork cannot identify one source package of the requested type or its destination already contains content, AXM shall refuse the operation without changing source packages, destination content, or workspace declarations.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/extension-authoring/src/fork-package.internal.test.ts`, `packages/cli/src/root/fork/command.ts`
- Source: [`specifications/cli/fork/refuses-ambiguous-or-conflicting-packages.spec.ts`](../specifications/cli/fork/refuses-ambiguous-or-conflicting-packages.spec.ts)

#### Hooks

##### Hooks package disable preview describes the deactivation without changing any state

- Requirement: `cli/hooks/disable/preview-is-pure`
- Statement: When hooks disable runs in preview mode against an enabled hooks package, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/activation-follows-desired-state`, `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/hooks/disable/preview-is-pure.spec.ts`](../specifications/cli/hooks/disable/preview-is-pure.spec.ts)

##### Hooks package enable preview describes the activation without changing any state

- Requirement: `cli/hooks/enable/preview-is-pure`
- Statement: When hooks enable runs in preview mode against a disabled hooks package, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/activation-follows-desired-state`, `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/hooks/enable/preview-is-pure.spec.ts`](../specifications/cli/hooks/enable/preview-is-pure.spec.ts)

##### Hooks package install preview describes the installation without changing any state

- Requirement: `cli/hooks/install/preview-is-pure`
- Statement: When hooks install runs in preview mode against a local hooks package that is not yet installed, it shall report the installation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`, `cli/install/preview-is-pure`
- Source: [`specifications/cli/hooks/install/preview-is-pure.spec.ts`](../specifications/cli/hooks/install/preview-is-pure.spec.ts)

##### Creating a hook records editable workspace content

- Requirement: `cli/hooks/new/creates-enabled-workspace-content`
- Statement: When a person creates a hook, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/hooks/new.internal.test.ts`
- Source: [`specifications/cli/hooks/new/creates-enabled-workspace-content.spec.ts`](../specifications/cli/hooks/new/creates-enabled-workspace-content.spec.ts)

##### New hook preview describes the scaffold without changing any state

- Requirement: `cli/hooks/new/preview-is-pure`
- Statement: When hooks new runs in preview mode for a name that is not yet authored, it shall report the package it would create with a previewed outcome and shall not change settings, the authored source root, or agent hook configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/hooks/new.internal.test.ts`
- Source: [`specifications/cli/hooks/new/preview-is-pure.spec.ts`](../specifications/cli/hooks/new/preview-is-pure.spec.ts)

##### Hook publish preview reports the admitted hooks without distributing anything

- Requirement: `cli/hooks/publish/preview-is-pure`
- Statement: When hooks publish runs in preview mode, it shall report the admitted workspace-authored hooks with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure`
- Source: [`specifications/cli/hooks/publish/preview-is-pure.spec.ts`](../specifications/cli/hooks/publish/preview-is-pure.spec.ts)

##### Hooks package uninstall preview describes the removal without changing any state

- Requirement: `cli/hooks/uninstall/preview-is-pure`
- Statement: When hooks uninstall runs in preview mode against an installed hooks package, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`
- Source: [`specifications/cli/hooks/uninstall/preview-is-pure.spec.ts`](../specifications/cli/hooks/uninstall/preview-is-pure.spec.ts)

##### Hooks package update preview describes the update without changing any state

- Requirement: `cli/hooks/update/preview-is-pure`
- Statement: When hooks update runs in preview mode against an installed hooks package whose source has changed, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`
- Source: [`specifications/cli/hooks/update/preview-is-pure.spec.ts`](../specifications/cli/hooks/update/preview-is-pure.spec.ts)

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
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
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
- Statement: When install runs in preview mode, it shall report the planned closure with a previewed outcome, including any publisher change the acceptance would make, and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preview-is-pure.spec.ts`](../specifications/cli/install/preview-is-pure.spec.ts)

##### Install realizes the extension for every configured agent

- Requirement: `cli/install/realizes-for-every-configured-agent`
- Statement: When an acquirable extension is installed, AXM shall realize it on every native surface supported for that extension type by the configured agents and on its declared shared surfaces, as permitted by the workspace's activation and instruction settings.
- Class: functional
- Role: experience
- Product goals: `agent-interoperability`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
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
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/records-accepted-resolution.spec.ts`](../specifications/cli/install/records-accepted-resolution.spec.ts)

##### Install records the extension as directly desired workspace configuration

- Requirement: `cli/install/records-direct-intent`
- Statement: When a person installs an acquirable extension, the install command shall record it in workspace settings as directly desired configuration.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/install/direct-intent-recorded-and-realized`, `cli/every-type-completes-the-shared-lifecycle`
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
- Open questions: When installed files differ from the accepted content, should a repeated install restore that content and report a repair, or refuse until the user explicitly chooses recovery? The unchanged-state example does not decide this case.
- Additional evidence: process via [`packages/cli-e2e/src/projection-currency.e2e.test.ts`](../packages/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Source: [`specifications/cli/install/reinstall-is-idempotent.spec.ts`](../specifications/cli/install/reinstall-is-idempotent.spec.ts)

#### Install Forms Express Same Intent

##### Root install and the type command express the same durable intent

- Requirement: `cli/install-forms-express-same-intent`
- Statement: When the same extension is installed, and then reinstalled at the same constraint, through the root install command and through its type-specific install command, both forms shall produce identical workspace configuration, identical canonical content, identical agent projections, and the same reported outcome.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: model
- Derived from: `cli/install/reinstall-is-idempotent`
- Supersedes: `cli/install/root-and-type-forms-express-same-intent`
- Source: [`specifications/cli/install-forms-express-same-intent.spec.ts`](../specifications/cli/install-forms-express-same-intent.spec.ts)

#### Installed State Stays In Selected Scope

##### Installed state stays in the selected scope

- Requirement: `cli/installed-state-stays-in-selected-scope`
- Statement: Commands that operate on installed extensions shall read and change the selected project or user workspace and its agent projections while preserving the other scope's workspace and projections.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: process; selection: per-change
- Boundary rationale: Separate CLI invocations establish scope selection, persisted settings and resolution, and project-versus-home native projection paths through the built entry point.
- Methods: decision-table, example
- Derived from: `packages/cli/src/root/scope-contract.ts`, `packages/cli-e2e/src/scope-consistency.e2e.test.ts`, `packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/scope-consistency.e2e.test.ts`](../packages/cli-e2e/src/scope-consistency.e2e.test.ts) — Runs Pack, Knowledge and Subagent operations in a populated user workspace and verifies that the populated project workspace and native projections remain byte-identical.
- Source: [`specifications/cli/installed-state-stays-in-selected-scope.spec.ts`](../specifications/cli/installed-state-stays-in-selected-scope.spec.ts)

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

##### Instruction management disable preview describes the cleanup without changing any state

- Requirement: `cli/instructions/disable/preview-is-pure`
- Statement: When instructions disable runs in preview mode for a workspace with managed instruction files, it shall report the recorded choice and owned aliases it would remove with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/disable/removes-only-owned-aliases`
- Source: [`specifications/cli/instructions/disable/preview-is-pure.spec.ts`](../specifications/cli/instructions/disable/preview-is-pure.spec.ts)

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
- Open questions: When a configured alias path contains an unowned human file, current disable refuses the whole operation; decide whether disabling should preserve that file and still record disabled management. The current preservation promise does not independently choose that policy.
- Source: [`specifications/cli/instructions/disable/removes-only-owned-aliases.spec.ts`](../specifications/cli/instructions/disable/removes-only-owned-aliases.spec.ts)

##### Enabling the same instruction configuration is a successful no-op

- Requirement: `cli/instructions/enable/enable-is-idempotent`
- Statement: When instruction-file management is enabled with the already-current source file and ignore policy, AXM shall report a no-op and leave settings, source content, aliases and ignore entries unchanged.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/instructions.internal.test.ts`
- Source: [`specifications/cli/instructions/enable/enable-is-idempotent.spec.ts`](../specifications/cli/instructions/enable/enable-is-idempotent.spec.ts)

##### Instruction management enable preview describes the aliases without changing any state

- Requirement: `cli/instructions/enable/preview-is-pure`
- Statement: When instructions enable runs in preview mode for a workspace whose instruction files are unmanaged, it shall report the recorded choice and alias files it would create with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/enable/records-choice-and-reconciles-aliases`
- Source: [`specifications/cli/instructions/enable/preview-is-pure.spec.ts`](../specifications/cli/instructions/enable/preview-is-pure.spec.ts)

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
- Statement: When instruction-file management status is inspected, AXM shall report whether management is enabled and, when it is, the source file and the managed target for each configured agent together with stale owned aliases, and shall not change settings or instruction files.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/instructions/management-is-explicit`
- Supersedes: `cli/instructions/management-is-explicit`
- Source: [`specifications/cli/instructions/status-reports-without-changing-state.spec.ts`](../specifications/cli/instructions/status-reports-without-changing-state.spec.ts)

#### Invalid Ownership Markers Block Reconciliation

##### Invalid ownership markers block reconciliation without altering the document

- Requirement: `cli/invalid-ownership-markers-block-reconciliation`
- Statement: When a generated document carries an ownership marker AXM cannot validate, lint shall report the invalid ownership and reconciliation shall report a blocked outcome, and neither shall alter the document.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/projection-currency-follows-state-authority`
- Source: [`specifications/cli/invalid-ownership-markers-block-reconciliation.spec.ts`](../specifications/cli/invalid-ownership-markers-block-reconciliation.spec.ts)

#### Invalid Workspace State Gates Operations

##### Invalid workspace settings or lockfile state gates every operation

- Requirement: `cli/invalid-workspace-state-gates-operations`
- Statement: When a present project or user settings file, or a present workspace lockfile in the selected scope, is malformed, schema-invalid, unreadable, or of an unsupported version, every read, diagnose, preview, and mutate operation shall stop before it begins with a validation error naming the file, the observed fault, and a non-destructive recovery route, and shall change no workspace state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `cli/settings-validity-gates-operations`, `cli/workspace-lockfile-rejections-name-state-and-recovery`, `cli/lockfile-version-errors-expose-structured-problem`
- Supersedes: `cli/settings-validity-gates-operations`, `cli/workspace-lockfile-rejections-name-state-and-recovery`, `cli/lockfile-version-errors-expose-structured-problem`
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Additional evidence: process via [`packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts`](../packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts) — Proves the shipped command wiring emits exit 9 and one structured error document, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, and uses the shared schema diagnosis for a Knowledge command.
- Additional evidence: process via [`packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts`](../packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts) — Proves at the real process boundary what the in-memory harness cannot: the shipped command wiring routes every sampled command family through the settings gate, machine stdout stays a valid document separated from stderr diagnostics, exit codes are nonzero, and version and help remain outside the gate.
- Source: [`specifications/cli/invalid-workspace-state-gates-operations.spec.ts`](../specifications/cli/invalid-workspace-state-gates-operations.spec.ts)

#### Inventories Can Run Before Setup

##### Local inventories can run before setup

- Requirement: `cli/inventories-can-run-before-setup`
- Statement: When listing local extensions before workspace setup, AXM shall report detected entries or an empty inventory without requiring or creating workspace settings and resolution state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/skills/list.internal.test.ts`, `packages/cli/src/root/list/command.ts`, `packages/cli/src/root/knowledge/list.ts`
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`specifications/cli/inventories-can-run-before-setup.spec.ts`](../specifications/cli/inventories-can-run-before-setup.spec.ts)

#### Knowledge

##### Continuation cursors preserve query and corpus identity

- Requirement: `cli/knowledge/concepts/cursors-bind-query-and-corpus`
- Statement: When continuing a Knowledge query, AXM shall return the next page without repeating prior concepts only while the cursor is well formed, no more than twenty-four hours old, and bound to the same query and selected corpus, otherwise requiring the caller to restart.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/knowledge-query/src/knowledge-index.internal.test.ts`, `packages/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/cursors-bind-query-and-corpus.spec.ts`](../specifications/cli/knowledge/concepts/cursors-bind-query-and-corpus.spec.ts)

##### Conditional retrieval detects source changes

- Requirement: `cli/knowledge/concepts/get/rejects-changed-revision`
- Statement: When a caller supplies a previously observed content revision for Knowledge retrieval, AXM shall return the concept only if its current source revision matches and otherwise report a revision conflict with the current revision.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/get/rejects-changed-revision.spec.ts`](../specifications/cli/knowledge/concepts/get/rejects-changed-revision.spec.ts)

##### Query evidence respects requested bounds

- Requirement: `cli/knowledge/concepts/query/bounds-concept-evidence`
- Statement: When a Knowledge query matches a concept through several fields or passages, AXM shall return one concept result with matching-field and source-location evidence within the caller-selected passage-count and passage-length bounds.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/knowledge-query/src/knowledge-index.internal.test.ts`
- Open questions: What explanatory information should query --explain promise about why concepts matched and their ordering? The current strategy and numeric ranking weights are implementation evidence, not accepted output obligations.
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/query/bounds-concept-evidence.spec.ts`](../specifications/cli/knowledge/concepts/query/bounds-concept-evidence.spec.ts)

##### Query filters jointly select matching concepts

- Requirement: `cli/knowledge/concepts/query/combines-typed-filters`
- Statement: When a Knowledge query supplies text, field, property, metadata, lifecycle, tag, or bundle filters, AXM shall return only concepts satisfying every supplied filter with the selected operator.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/knowledge-query/src/knowledge-index.internal.test.ts`, `packages/cli/src/root/knowledge/concepts/query.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/query/combines-typed-filters.spec.ts`](../specifications/cli/knowledge/concepts/query/combines-typed-filters.spec.ts)

##### Enumeration selects ordinary current concepts by default

- Requirement: `cli/knowledge/concepts/query/enumerates-selected-document-kinds`
- Statement: When a Knowledge query has no text expression, AXM shall enumerate nondeprecated ordinary concepts in stable bundle and concept order unless the caller explicitly selects another document kind or lifecycle status.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/knowledge-query/src/knowledge-index.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/query/enumerates-selected-document-kinds.spec.ts`](../specifications/cli/knowledge/concepts/query/enumerates-selected-document-kinds.spec.ts)

##### Invalid query filters fail validation

- Requirement: `cli/knowledge/concepts/query/rejects-invalid-filters`
- Statement: When a Knowledge query contains an unknown field, malformed property pointer, unsupported operator, or empty filter value, AXM shall reject the query as a validation failure.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/cli/src/root/knowledge/concepts/query.ts`
- Source: [`specifications/cli/knowledge/concepts/query/rejects-invalid-filters.spec.ts`](../specifications/cli/knowledge/concepts/query/rejects-invalid-filters.spec.ts)

##### Discovery reads only enabled bundles in the selected workspace

- Requirement: `cli/knowledge/concepts/reads-only-enabled-selected-corpus`
- Statement: When discovering Knowledge, AXM shall read the enabled bundles in the selected workspace regardless of instruction-entry visibility and reflect current source content without changing workspace state.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: Populated project and user workspaces with the same Knowledge identity establish real scope composition, process argument selection, and preservation of both authoritative workspaces and native files.
- Methods: example, decision-table
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/cli/src/root/knowledge/inspect.ts`, `packages/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/reads-only-enabled-selected-corpus.spec.ts`](../specifications/cli/knowledge/concepts/reads-only-enabled-selected-corpus.spec.ts)

##### Discovery refuses an unstable source view

- Requirement: `cli/knowledge/concepts/refuses-changing-corpus`
- Statement: When Knowledge source bytes continue changing during capture, AXM shall report a corpus-changing conflict instead of returning results from an inconsistent source view.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/knowledge-query/src/knowledge-capture.internal.test.ts`, `packages/knowledge-query/src/knowledge-revision.internal.test.ts`, `packages/cli/src/root/knowledge/concepts/failures.ts`
- Source: [`specifications/cli/knowledge/concepts/refuses-changing-corpus.spec.ts`](../specifications/cli/knowledge/concepts/refuses-changing-corpus.spec.ts)

##### Related concepts follow authored links with evidence

- Requirement: `cli/knowledge/concepts/related/traverses-authored-links`
- Statement: When exploring related Knowledge concepts, AXM shall return outgoing links and backlinks within the requested depth with authored-link evidence, suppressing the starting concept, repeated visits, and index backlinks unless requested.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/knowledge-query/src/knowledge-graph.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/related/traverses-authored-links.spec.ts`](../specifications/cli/knowledge/concepts/related/traverses-authored-links.spec.ts)

##### Human discovery output preserves text without terminal control

- Requirement: `cli/knowledge/concepts/renders-authored-text-safely`
- Statement: When rendering bundle-authored Knowledge text for a person, AXM shall preserve ordinary text and line structure while displaying terminal-control and bidirectional-control characters as inert escapes.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/knowledge/concepts/terminal-text.ts`, `packages/cli/src/root/knowledge/concepts/terminal-text.internal.test.ts`
- Source: [`specifications/cli/knowledge/concepts/renders-authored-text-safely.spec.ts`](../specifications/cli/knowledge/concepts/renders-authored-text-safely.spec.ts)

##### Exact retrieval does not substitute another concept

- Requirement: `cli/knowledge/concepts/reports-unavailable-exact-references`
- Statement: When an exact Knowledge reference is absent from the selected corpus, AXM shall report not found without substituting a similarly named concept.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/knowledge/concepts/get.ts`, `packages/cli/src/root/knowledge/concepts/resolve.ts`, `packages/cli/src/root/knowledge/concepts/related.ts`
- Source: [`specifications/cli/knowledge/concepts/reports-unavailable-exact-references.spec.ts`](../specifications/cli/knowledge/concepts/reports-unavailable-exact-references.spec.ts)

##### Fuzzy resolution requires opt-in and exposes ambiguity

- Requirement: `cli/knowledge/concepts/resolve/requires-explicit-fuzzy-resolution`
- Statement: When resolving text that is not an exact Knowledge reference, AXM shall require explicit fuzzy resolution and return at most ten deterministic candidates without choosing among ambiguous matches.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/knowledge-query/src/knowledge-graph.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/resolve/requires-explicit-fuzzy-resolution.spec.ts`](../specifications/cli/knowledge/concepts/resolve/requires-explicit-fuzzy-resolution.spec.ts)

##### Exact concept references resolve to installed identity

- Requirement: `cli/knowledge/concepts/resolve/resolves-exact-reference`
- Statement: When given a compact or canonical HTTPS reference to an installed Knowledge concept, AXM shall resolve the exact concept to its installed bundle version and source revision.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/knowledge-query/src/knowledge-graph.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/resolve/resolves-exact-reference.spec.ts`](../specifications/cli/knowledge/concepts/resolve/resolves-exact-reference.spec.ts)

##### Search matches the requested lexical expression

- Requirement: `cli/knowledge/concepts/search/matches-lexical-query`
- Statement: When searching installed Knowledge, AXM shall match all normalized whole-token terms across searchable fields, contiguous phrases within one field, and exact literals within one field.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/search/matches-lexical-query.spec.ts`](../specifications/cli/knowledge/concepts/search/matches-lexical-query.spec.ts)

##### Invalid search expressions fail validation

- Requirement: `cli/knowledge/concepts/search/rejects-invalid-query`
- Statement: When a Knowledge search expression is empty, has no searchable tokens, or contains an invalid phrase or literal, AXM shall reject it as a validation failure.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/cli-e2e/src/knowledge.e2e.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/search/rejects-invalid-query.spec.ts`](../specifications/cli/knowledge/concepts/search/rejects-invalid-query.spec.ts)

##### Status distinguishes a ready corpus from unstable and unavailable sources

- Requirement: `cli/knowledge/concepts/status/reports-current-corpus-health`
- Statement: When reporting Knowledge discovery status, AXM shall distinguish a ready captured corpus, source bytes that keep changing, and stable capture failures, with current counts and identity for readiness or an actionable diagnostic for failure.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/knowledge/concepts/status.ts`, `packages/cli/src/root/knowledge/concepts/schemas.ts`, `packages/cli/src/root/knowledge/json-output.internal.test.ts`
- Open questions: When source capture succeeds but OKF inspection contains error findings, should discovery report a ready but unhealthy corpus or refuse that corpus as unavailable?
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/status/reports-current-corpus-health.spec.ts`](../specifications/cli/knowledge/concepts/status/reports-current-corpus-health.spec.ts)

##### Knowledge disable preview describes the exclusion without changing any state

- Requirement: `cli/knowledge/disable/preview-is-pure`
- Statement: When knowledge disable runs in preview mode against an enabled Knowledge bundle, it shall report the exclusion it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/knowledge/disable/preview-is-pure.spec.ts`](../specifications/cli/knowledge/disable/preview-is-pure.spec.ts)

##### Knowledge enable preview describes the activation without changing any state

- Requirement: `cli/knowledge/enable/preview-is-pure`
- Statement: When knowledge enable runs in preview mode against a disabled Knowledge bundle, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/knowledge/enable/preview-is-pure.spec.ts`](../specifications/cli/knowledge/enable/preview-is-pure.spec.ts)

##### Knowledge install preview describes the acquisition without changing any state

- Requirement: `cli/knowledge/install/preview-is-pure`
- Statement: When knowledge install runs in preview mode against an installable Knowledge source, it shall report the bundle it would install with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`specifications/cli/knowledge/install/preview-is-pure.spec.ts`](../specifications/cli/knowledge/install/preview-is-pure.spec.ts)

##### Knowledge lint reports source findings without changing content

- Requirement: `cli/knowledge/lint/reports-validation-without-mutation`
- Statement: When validating installed or explicitly selected authored Knowledge, AXM shall report source-located findings without changing workspace content, returning failure for errors and success for warnings alone.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/knowledge/json-output.internal.test.ts`, `packages/cli-e2e/src/knowledge.e2e.test.ts`, `cli/lint/catalog-is-complete`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/lint/reports-validation-without-mutation.spec.ts`](../specifications/cli/knowledge/lint/reports-validation-without-mutation.spec.ts)

##### Knowledge list explains instruction entry inclusion

- Requirement: `cli/knowledge/list/explains-instruction-entry-inclusion`
- Statement: When listing an installed or explicitly disabled Knowledge bundle, AXM shall report whether its entry is included in agent instructions and the effective reason for that decision.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/knowledge/list.ts`, `packages/cli/help/topics/knowledge.md`, `packages/extension-workspace/src/knowledge/instruction-entry.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/list/explains-instruction-entry-inclusion.spec.ts`](../specifications/cli/knowledge/list/explains-instruction-entry-inclusion.spec.ts)

##### Knowledge list reports the inspected bundle content

- Requirement: `cli/knowledge/list/reports-bundle-inspection`
- Statement: When listing Knowledge bundles, AXM shall identify locally available bundles with their source paths, inspected concept counts, and diagnostic counts.
- Class: functional
- Role: experience
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/knowledge/list.ts`, `packages/cli-e2e/src/knowledge.e2e.test.ts`
- Source: [`specifications/cli/knowledge/list/reports-bundle-inspection.spec.ts`](../specifications/cli/knowledge/list/reports-bundle-inspection.spec.ts)

##### Creating a knowledge bundle records editable workspace content

- Requirement: `cli/knowledge/new/creates-enabled-workspace-content`
- Statement: When a person creates a knowledge bundle, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/knowledge/new.ts`
- Source: [`specifications/cli/knowledge/new/creates-enabled-workspace-content.spec.ts`](../specifications/cli/knowledge/new/creates-enabled-workspace-content.spec.ts)

##### Knowledge new preview describes the scaffold without creating any state

- Requirement: `cli/knowledge/new/preview-is-pure`
- Statement: When knowledge new runs in preview mode for a bundle name the workspace does not yet author, it shall report the bundle it would create with a previewed outcome and shall not write the authored package, settings, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/new/scaffolds-for-every-configured-agent`
- Source: [`specifications/cli/knowledge/new/preview-is-pure.spec.ts`](../specifications/cli/knowledge/new/preview-is-pure.spec.ts)

##### Knowledge publish preview reports the admitted bundles without distributing anything

- Requirement: `cli/knowledge/publish/preview-is-pure`
- Statement: When knowledge publish runs in preview mode, it shall report the admitted workspace-authored knowledge bundles with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure`
- Source: [`specifications/cli/knowledge/publish/preview-is-pure.spec.ts`](../specifications/cli/knowledge/publish/preview-is-pure.spec.ts)

##### Knowledge uninstall preview describes the removal without changing any state

- Requirement: `cli/knowledge/uninstall/preview-is-pure`
- Statement: When knowledge uninstall runs in preview mode against an installed Knowledge bundle, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`specifications/cli/knowledge/uninstall/preview-is-pure.spec.ts`](../specifications/cli/knowledge/uninstall/preview-is-pure.spec.ts)

##### Knowledge update preview describes the newer release without changing any state

- Requirement: `cli/knowledge/update/preview-is-pure`
- Statement: When knowledge update runs in preview mode against a configured Registry bundle with a newer eligible release, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/update/advances-resolution-within-intent`
- Source: [`specifications/cli/knowledge/update/preview-is-pure.spec.ts`](../specifications/cli/knowledge/update/preview-is-pure.spec.ts)

#### Lint

##### Lint holds a declared official AXM skill to compatibility

- Requirement: `cli/lint/declared-official-skill-must-be-compatible`
- Statement: When the workspace declares the official AXM skill, lint shall report a compatibility error and fail when the declared skill is missing, incompatible, skewed, authored, or unreadable, and shall report clean and succeed when the skill and CLI satisfy the declared bounded compatibility range, including prerelease versions within that range.
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

##### Git-index lint requires a repository with no unresolved index entries

- Requirement: `cli/lint/git-index-requires-a-resolved-index`
- Statement: When lint selects the Git index outside a Git repository or while its index contains unresolved merge entries, AXM shall report why that view cannot be evaluated without changing the index or working tree.
- Class: constraint
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: Real Git repositories supply unresolved index stages, and the built CLI exposes the refusal and selected-view explanation while real index and file observations establish preservation.
- Methods: example
- Derived from: `cli/lint/observes-selected-filesystem-view`, `packages/workspace-lint/src/run/staged-workspace.internal.test.ts`
- Source: [`specifications/cli/lint/git-index-requires-a-resolved-index.spec.ts`](../specifications/cli/lint/git-index-requires-a-resolved-index.spec.ts)

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
- Statement: When a lint view is selected, lint shall evaluate only that view, reporting the staged content and its fingerprint for git-index and the working tree for workspace with diagnostic paths in the selected workspace, and shall change neither the Git index nor the working tree.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `workspace-intent-fidelity`, `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Only a real Git index and working tree, driven through the git executable, can hold staged content that differs from the working tree, yield the index fingerprint, and show afterwards that the index, status, and files were left untouched; an in-memory run has no Git index to observe.
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/observes-selected-filesystem-view.spec.ts`](../specifications/cli/lint/observes-selected-filesystem-view.spec.ts)

##### Lint preserves workspace files whether the run succeeds or fails

- Requirement: `cli/lint/reports-facts-without-mutation`
- Statement: When lint runs without --fix, it shall preserve every workspace file, directory, symbolic link, and file's contents whether the run succeeds or fails.
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
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/undeclared-official-skill-is-informational.spec.ts`](../specifications/cli/lint/undeclared-official-skill-is-informational.spec.ts)

#### List

##### Update listings use each installation’s recorded Registry

- Requirement: `cli/list/assesses-updates-through-recorded-registry`
- Statement: When listing outdated extensions, AXM shall assess installed extensions, including disabled installations, against their recorded Registry source and return those with a newer version that satisfies the recorded version constraint.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/list/command.internal.test.ts`, `packages/cli/src/root/list/command.ts`
- Open questions: Should Git update assessment treat a changed commit with an unchanged extension tree as an available update? Current code compares both identities; Registry version eligibility is the accepted scope of this requirement.
- Source: [`specifications/cli/list/assesses-updates-through-recorded-registry.spec.ts`](../specifications/cli/list/assesses-updates-through-recorded-registry.spec.ts)

##### List exposes failed Registry assessment

- Requirement: `cli/list/fails-when-registry-assessment-fails`
- Statement: When a requested Registry assessment fails, AXM shall fail the list command without presenting a successful empty or current assessment.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/list/command.internal.test.ts`, `packages/workspace-inspection/src/extension-list.ts`
- Source: [`specifications/cli/list/fails-when-registry-assessment-fails.spec.ts`](../specifications/cli/list/fails-when-registry-assessment-fails.spec.ts)

##### Ordinary listings identify deprecated installations

- Requirement: `cli/list/ordinary-inventory-identifies-deprecation`
- Statement: When an ordinary inventory includes a deprecated installation, AXM shall identify its deprecation status and direct human readers to the command for full guidance.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/list/command.internal.test.ts`, `packages/cli/src/root/list/command.ts`
- Source: [`specifications/cli/list/ordinary-inventory-identifies-deprecation.spec.ts`](../specifications/cli/list/ordinary-inventory-identifies-deprecation.spec.ts)

##### List rejects incompatible remote filters

- Requirement: `cli/list/rejects-incompatible-filters`
- Statement: When both outdated and deprecated filters are requested, AXM shall reject the list invocation as a usage failure before querying Registry state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/list/command.internal.test.ts`, `packages/cli/src/root/list/command.ts`
- Source: [`specifications/cli/list/rejects-incompatible-filters.spec.ts`](../specifications/cli/list/rejects-incompatible-filters.spec.ts)

##### Deprecation listings report available replacement guidance

- Requirement: `cli/list/reports-deprecation-guidance`
- Statement: When listing deprecated installations, AXM shall return the Registry’s deprecation message and replacement availability for each matching installation.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/list/command.internal.test.ts`, `packages/workspace-inspection/src/extension-list.ts`
- Source: [`specifications/cli/list/reports-deprecation-guidance.spec.ts`](../specifications/cli/list/reports-deprecation-guidance.spec.ts)

##### List reports incomplete Registry assessment

- Requirement: `cli/list/reports-incomplete-assessment`
- Statement: When an installation’s recorded Registry source is not configured or its extension index is not found, AXM shall mark that assessment as unknown in coverage instead of treating it as a confirmed current installation.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/list/command.internal.test.ts`, `packages/workspace-inspection/src/extension-list.ts`
- Source: [`specifications/cli/list/reports-incomplete-assessment.spec.ts`](../specifications/cli/list/reports-incomplete-assessment.spec.ts)

##### List reports the current inventory across extension types

- Requirement: `cli/list/reports-the-cross-type-inventory`
- Statement: When listing extensions, AXM shall report the current local inventory across all extension types or only the explicitly selected type, including configured extensions that are disabled or missing.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/list/command.internal.test.ts`, `packages/cli/src/root/list/command.ts`
- Source: [`specifications/cli/list/reports-the-cross-type-inventory.spec.ts`](../specifications/cli/list/reports-the-cross-type-inventory.spec.ts)

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

#### Lockfile Rejections Name Recovery Routes

##### Lockfile rejections name a recovery route that re-accepts desired state

- Requirement: `cli/lockfile-rejections-name-recovery-routes`
- Statement: When a workspace lockfile is rejected as older than the supported version, following the named recovery route (preserving the file outside its authoritative path, previewing, then applying sync) shall re-accept the desired state into a lockfile at the supported version, and a workspace holding only workspace-authored content shall finish that route without a lockfile.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/workspace-lockfile-rejections-name-state-and-recovery`
- Supersedes: `cli/workspace-lockfile-rejections-name-state-and-recovery`
- Source: [`specifications/cli/lockfile-rejections-name-recovery-routes.spec.ts`](../specifications/cli/lockfile-rejections-name-recovery-routes.spec.ts)

#### Login

##### Login preapproval starts a new sign-in over a valid session in every mode

- Requirement: `cli/login/preapproval-requests-new-sign-in`
- Statement: When a valid registry session already exists, login with preapproval shall start a new sign-in without asking in interactive, machine-output, and non-interactive modes, while login without preapproval shall keep the session and name the preapproval in modes that cannot ask and shall ask before replacing it in a mode that can.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Source: [`specifications/cli/login/preapproval-requests-new-sign-in.spec.ts`](../specifications/cli/login/preapproval-requests-new-sign-in.spec.ts)

##### Sign-in rejects inconsistent flow options

- Requirement: `cli/login/rejects-inconsistent-flow-options`
- Statement: When sign-in options combine incompatible start and resume actions or supply a wait timeout without a resume action, AXM shall report usage failure before changing credentials or pending authorization.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Source: [`specifications/cli/login/rejects-inconsistent-flow-options.spec.ts`](../specifications/cli/login/rejects-inconsistent-flow-options.spec.ts)

##### Sign-in resumes only its Registry authorization

- Requirement: `cli/login/resume-requires-matching-pending-authorization`
- Statement: When login --wait has no pending authorization for the selected Registry, AXM shall report the missing or mismatched authorization without changing saved credentials or another Registry authorization.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`specifications/cli/login/resume-requires-matching-pending-authorization.spec.ts`](../specifications/cli/login/resume-requires-matching-pending-authorization.spec.ts)

##### Approved device sign-in establishes the selected Registry session

- Requirement: `cli/login/resumes-approved-authorization`
- Statement: When a pending device authorization is approved, login --wait shall save the issued credentials for its Registry, clear the pending authorization, and make that session available to subsequent commands.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`specifications/cli/login/resumes-approved-authorization.spec.ts`](../specifications/cli/login/resumes-approved-authorization.spec.ts)

##### Sign-in retains an issued session when identity lookup is unavailable

- Requirement: `cli/login/retains-issued-session-when-identity-unavailable`
- Statement: When device authorization issues a session but identity lookup is temporarily unavailable, AXM shall retain the usable session without presenting an unverified identity, allowing later identity inspection to report the canonical Registry account.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/registry-auth/src/device-login.internal.test.ts`
- Source: [`specifications/cli/login/retains-issued-session-when-identity-unavailable.spec.ts`](../specifications/cli/login/retains-issued-session-when-identity-unavailable.spec.ts)

##### Repeated sign-in preserves pending authorization

- Requirement: `cli/login/reuses-pending-authorization`
- Statement: When a device authorization is unexpired, AXM shall reuse it for the same Registry and equivalent requested scopes, refuse a conflicting request without changing it, and replace it only when restart is explicitly requested.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Source: [`specifications/cli/login/reuses-pending-authorization.spec.ts`](../specifications/cli/login/reuses-pending-authorization.spec.ts)

##### Unattended device sign-in returns the human action

- Requirement: `cli/login/starts-resumable-device-sign-in`
- Statement: When device sign-in starts unattended, AXM shall retain the pending authorization and return its verification URL, user code, expiry, requested scopes, and resume command without waiting for approval or opening a browser.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`specifications/cli/login/starts-resumable-device-sign-in.spec.ts`](../specifications/cli/login/starts-resumable-device-sign-in.spec.ts)

##### Denied and expired sign-ins leave saved sessions unchanged

- Requirement: `cli/login/terminal-authorization-failures-preserve-credentials`
- Statement: When a pending device authorization is denied or expires, login --wait shall report the corresponding failure, remove that pending authorization, and leave saved credentials unchanged.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts`](../packages/cli-e2e/src/cli-commands/auth/login/login.e2e.test.ts) — Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.
- Source: [`specifications/cli/login/terminal-authorization-failures-preserve-credentials.spec.ts`](../specifications/cli/login/terminal-authorization-failures-preserve-credentials.spec.ts)

##### A bounded wait leaves sign-in resumable

- Requirement: `cli/login/wait-timeout-preserves-authorization`
- Statement: When login --wait reaches the requested timeout before authorization completes, AXM shall report pending human approval with resume instructions and preserve the pending authorization and existing credentials.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/login.internal.test.ts`
- Source: [`specifications/cli/login/wait-timeout-preserves-authorization.spec.ts`](../specifications/cli/login/wait-timeout-preserves-authorization.spec.ts)

#### Logout

##### Sign-out removes only the selected Registry session

- Requirement: `cli/logout/erases-selected-registry-credentials`
- Statement: When logout finds saved credentials, AXM shall remove the selected Registry session even if remote revocation fails, leaving other Registry credentials available.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/logout.internal.test.ts`
- Source: [`specifications/cli/logout/erases-selected-registry-credentials.spec.ts`](../specifications/cli/logout/erases-selected-registry-credentials.spec.ts)

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

##### Inline MCP server add preview describes the configuration without changing any state

- Requirement: `cli/mcps/add/preview-is-pure`
- Statement: When mcps add runs in preview mode with a new inline server definition, it shall report the configuration and agent realization it would apply with a previewed outcome and shall not change settings, the lockfile, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/add/records-and-realizes-inline-configuration`
- Source: [`specifications/cli/mcps/add/preview-is-pure.spec.ts`](../specifications/cli/mcps/add/preview-is-pure.spec.ts)

##### Adding an inline MCP server records it as authored configuration and realizes it

- Requirement: `cli/mcps/add/records-and-realizes-inline-configuration`
- Statement: When an inline MCP server is added by command or url, AXM shall record it in axm.json as authored configuration, realize it in the native configuration of configured agents, report the applied change, and shall record no accepted resolution.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
- Source: [`specifications/cli/mcps/add/records-and-realizes-inline-configuration.spec.ts`](../specifications/cli/mcps/add/records-and-realizes-inline-configuration.spec.ts)

##### MCP server disable preview describes the deactivation without changing any state

- Requirement: `cli/mcps/disable/preview-is-pure`
- Statement: When mcps disable runs in preview mode against an enabled MCP server, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/mcps/disable/preview-is-pure.spec.ts`](../specifications/cli/mcps/disable/preview-is-pure.spec.ts)

##### MCP server enable preview describes the activation without changing any state

- Requirement: `cli/mcps/enable/preview-is-pure`
- Statement: When mcps enable runs in preview mode against a disabled MCP server, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`, `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/mcps/enable/preview-is-pure.spec.ts`](../specifications/cli/mcps/enable/preview-is-pure.spec.ts)

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

##### MCP server import preview describes the adoption without changing any state

- Requirement: `cli/mcps/import/preview-is-pure`
- Statement: When mcps import runs in preview mode against an unmanaged native MCP server, it shall report the adoption it would apply with a previewed outcome and shall not change settings, the lockfile, or any native agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/import/adoption-reaches-every-configured-agent`
- Source: [`specifications/cli/mcps/import/preview-is-pure.spec.ts`](../specifications/cli/mcps/import/preview-is-pure.spec.ts)

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
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
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

##### MCP server install preview describes the installation without changing any state

- Requirement: `cli/mcps/install/preview-is-pure`
- Statement: When mcps install runs in preview mode against a Registry MCP server that is not yet installed, it shall report the installation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/install/local-connection-names-share-source-resolution`
- Source: [`specifications/cli/mcps/install/preview-is-pure.spec.ts`](../specifications/cli/mcps/install/preview-is-pure.spec.ts)

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

##### Creating an MCP server records editable workspace content

- Requirement: `cli/mcps/new/creates-enabled-workspace-content`
- Statement: When a person creates an MCP server, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/mcps/new.internal.test.ts`
- Source: [`specifications/cli/mcps/new/creates-enabled-workspace-content.spec.ts`](../specifications/cli/mcps/new/creates-enabled-workspace-content.spec.ts)

##### New MCP server preview describes the scaffold without changing any state

- Requirement: `cli/mcps/new/preview-is-pure`
- Statement: When mcps new runs in preview mode for a name that is not yet authored, it shall report the package it would create with a previewed outcome and shall not change settings, the authored source root, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/mcps/new.internal.test.ts`
- Source: [`specifications/cli/mcps/new/preview-is-pure.spec.ts`](../specifications/cli/mcps/new/preview-is-pure.spec.ts)

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

##### MCP server publish preview reports the admitted servers without distributing anything

- Requirement: `cli/mcps/publish/preview-is-pure`
- Statement: When mcps publish runs in preview mode, it shall report the admitted workspace-authored MCP servers with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure`
- Source: [`specifications/cli/mcps/publish/preview-is-pure.spec.ts`](../specifications/cli/mcps/publish/preview-is-pure.spec.ts)

##### Uninstalling an MCP server preserves native entries AXM does not own

- Requirement: `cli/mcps/uninstall/preserves-unowned-native-entries`
- Statement: When an MCP server is uninstalled, AXM shall remove that server's configuration from axm.json and its projection from every agent's native configuration, and shall preserve every native entry it does not own.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/inline-lifecycle-is-idempotent`
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI to observe inline MCP lifecycle argv, exit codes, JSON envelopes, and native files, and invokes the built error runtime with a synthetic secret to establish redaction in human verbose, debug, and quiet-precedence modes.
- Source: [`specifications/cli/mcps/uninstall/preserves-unowned-native-entries.spec.ts`](../specifications/cli/mcps/uninstall/preserves-unowned-native-entries.spec.ts)

##### MCP server uninstall preview describes the removal without changing any state

- Requirement: `cli/mcps/uninstall/preview-is-pure`
- Statement: When mcps uninstall runs in preview mode against an installed MCP server, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/uninstall/removes-one-local-connection-at-a-time`
- Source: [`specifications/cli/mcps/uninstall/preview-is-pure.spec.ts`](../specifications/cli/mcps/uninstall/preview-is-pure.spec.ts)

##### Uninstall removes one local MCP connection and retains shared source state

- Requirement: `cli/mcps/uninstall/removes-one-local-connection-at-a-time`
- Statement: When a locally named MCP connection is uninstalled, AXM shall remove only that connection from axm.json and agent configuration, and shall retain the shared source's package content and accepted resolution until no connection to that source remains.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts`](../specifications/cli/mcps/uninstall/removes-one-local-connection-at-a-time.spec.ts)

##### MCP server update preview describes the update without changing any state

- Requirement: `cli/mcps/update/preview-is-pure`
- Statement: When mcps update runs in preview mode against an installed MCP server whose source publishes a newer eligible version, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent MCP configuration.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/mcps/update/shared-source-update-is-closure-wide`
- Source: [`specifications/cli/mcps/update/preview-is-pure.spec.ts`](../specifications/cli/mcps/update/preview-is-pure.spec.ts)

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
- Open questions: Does failure in one dependency group roll back the entire command, or may successful independent groups in the same invocation remain committed?; Must failure after writes begin use a typed command error without a result document, or may the command report a failed operation result? Existing examples establish preflight refusal only.
- Source: [`specifications/cli/mutations-are-closure-atomic.spec.ts`](../specifications/cli/mutations-are-closure-atomic.spec.ts)

#### Native Imports Preserve Content And Source

##### Native imports create workspace packages without changing original content

- Requirement: `cli/native-imports-preserve-content-and-source`
- Statement: When a person imports native Skill or Subagent content, AXM shall preserve the original source and its instructions while creating the requested workspace package, disabled unless activation is requested or already configured, and shall reject a managed package or mismatched target type.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/extension-authoring/src/import-native-package.internal.test.ts`, `packages/cli/src/root/import/command.ts`
- Source: [`specifications/cli/native-imports-preserve-content-and-source.spec.ts`](../specifications/cli/native-imports-preserve-content-and-source.spec.ts)

#### Native Projections Compare By Decoded Value

##### Structured native projections are compared by decoded value

- Requirement: `cli/native-projections-compare-by-decoded-value`
- Statement: When a structured native projection is re-serialized with an equivalent decoded value, reconciliation shall report it current and preserve the file, and when its decoded value diverges from the desired configuration, reconciliation shall report the divergence in preview and restore the desired value on apply.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/projection-currency-follows-state-authority`
- Source: [`specifications/cli/native-projections-compare-by-decoded-value.spec.ts`](../specifications/cli/native-projections-compare-by-decoded-value.spec.ts)

#### Packs

##### Pack add preview describes the new member without changing the manifest

- Requirement: `cli/packs/add/preview-is-pure`
- Statement: When packs add previews an installed extension’s dependency in a workspace-authored pack, it shall report a previewed change when that dependency would change or a no-op when it already matches, and shall not change the pack manifest, settings, the lockfile, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/packs/add/records-member-as-pack-dependency`
- Source: [`specifications/cli/packs/add/preview-is-pure.spec.ts`](../specifications/cli/packs/add/preview-is-pure.spec.ts)

##### Adding an installed extension to an authored pack records it as a pack dependency

- Requirement: `cli/packs/add/records-member-as-pack-dependency`
- Statement: When a person adds a versioned installed extension to a workspace-authored pack, AXM shall record a dependency whose lower bound is the member’s accepted installed version, or its manifest version when workspace authored.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/packs/authored-packs-expand-membership`
- Supersedes: `cli/packs/authored-packs-expand-membership`
- Additional evidence: process via [`packages/cli-e2e/src/packs.e2e.test.ts`](../packages/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/packs/add/records-member-as-pack-dependency.spec.ts`](../specifications/cli/packs/add/records-member-as-pack-dependency.spec.ts)

##### Pack add selects the requested members without confusing shared names

- Requirement: `cli/packs/add/selects-members-without-ambiguity`
- Statement: When adding dependencies to an authored pack, AXM shall resolve the configured pack by its local name or unique full identity, add only members selected by full identity or an unambiguous name or name pattern, and refuse ambiguous or unmatched selections without editing the pack.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/packs/add.ts`, `packages/cli/src/root/packs/configured-pack-selector.ts`
- Source: [`specifications/cli/packs/add/selects-members-without-ambiguity.spec.ts`](../specifications/cli/packs/add/selects-members-without-ambiguity.spec.ts)

##### Pack disable preview describes the deactivation without changing any state

- Requirement: `cli/packs/disable/preview-is-pure`
- Statement: When packs disable runs in preview mode against an enabled pack, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/packs/disable/preview-is-pure.spec.ts`](../specifications/cli/packs/disable/preview-is-pure.spec.ts)

##### Pack enable preview describes the activation without changing any state

- Requirement: `cli/packs/enable/preview-is-pure`
- Statement: When packs enable runs in preview mode against a disabled pack, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/packs/enable/preview-is-pure.spec.ts`](../specifications/cli/packs/enable/preview-is-pure.spec.ts)

##### Pack install preview describes the pack closure without changing any state

- Requirement: `cli/packs/install/preview-is-pure`
- Statement: When packs install runs in preview mode against a Registry pack, it shall report the pack and members it would install with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`specifications/cli/packs/install/preview-is-pure.spec.ts`](../specifications/cli/packs/install/preview-is-pure.spec.ts)

##### Pack new preview describes the scaffold without creating any state

- Requirement: `cli/packs/new/preview-is-pure`
- Statement: When packs new runs in preview mode for a pack name the workspace does not yet author, it shall report the pack it would create with a previewed outcome and shall not write the authored package, settings, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/packs/new/records-workspace-authorship`
- Source: [`specifications/cli/packs/new/preview-is-pure.spec.ts`](../specifications/cli/packs/new/preview-is-pure.spec.ts)

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

##### Pack publish preview reports the admitted packs without distributing anything

- Requirement: `cli/packs/publish/preview-is-pure`
- Statement: When packs publish runs in preview mode, it shall report the admitted workspace-authored packs with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure`
- Source: [`specifications/cli/packs/publish/preview-is-pure.spec.ts`](../specifications/cli/packs/publish/preview-is-pure.spec.ts)

##### Pack remove preview describes the departing member without changing the manifest

- Requirement: `cli/packs/remove/preview-is-pure`
- Statement: When packs remove runs in preview mode for a member of a workspace-authored pack, it shall report the dependency it would remove with a previewed outcome and shall not change the pack manifest, settings, the lockfile, or any other workspace state.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/packs/add/records-member-as-pack-dependency`
- Source: [`specifications/cli/packs/remove/preview-is-pure.spec.ts`](../specifications/cli/packs/remove/preview-is-pure.spec.ts)

##### Pack remove changes only the selected dependency declarations

- Requirement: `cli/packs/remove/removes-only-selected-dependencies`
- Statement: When a person removes matching dependencies from a workspace-authored pack, AXM shall remove only those manifest entries while preserving installed member content and direct workspace declarations, and shall refuse an unmatched selector or an externally sourced pack without changing the manifest.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/extension-authoring/src/packs/remove-from-pack.internal.test.ts`, `packages/cli/src/root/packs/remove.ts`
- Source: [`specifications/cli/packs/remove/removes-only-selected-dependencies.spec.ts`](../specifications/cli/packs/remove/removes-only-selected-dependencies.spec.ts)

##### Pack inspection refuses mismatched and unavailable targets

- Requirement: `cli/packs/show/rejects-mismatched-and-unavailable-packs`
- Statement: When a requested pack identity conflicts with the configured pack or its canonical manifest is unavailable or invalid, AXM shall fail the inspection without presenting a pack-state result.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/packs/show.ts`
- Source: [`specifications/cli/packs/show/rejects-mismatched-and-unavailable-packs.spec.ts`](../specifications/cli/packs/show/rejects-mismatched-and-unavailable-packs.spec.ts)

##### Pack inspection reports declared members and observed state

- Requirement: `cli/packs/show/reports-authored-membership-and-observed-state`
- Statement: When inspecting a configured pack, AXM shall report the pack’s source authority, canonical manifest, declared member constraints, and desired dependency reachability.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/packs/show.ts`, `packages/cli-e2e/src/scope-consistency.e2e.test.ts`
- Open questions: The current pack result reports member version as null and derives reachability from desired graph presence. Should future inspection distinguish desired membership from verified installed member resolution and exclusions?
- Source: [`specifications/cli/packs/show/reports-authored-membership-and-observed-state.spec.ts`](../specifications/cli/packs/show/reports-authored-membership-and-observed-state.spec.ts)

##### Pack uninstall preview describes the removal without changing any state

- Requirement: `cli/packs/uninstall/preview-is-pure`
- Statement: When packs uninstall runs in preview mode against an installed pack, it shall report the pack and orphaned members it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`specifications/cli/packs/uninstall/preview-is-pure.spec.ts`](../specifications/cli/packs/uninstall/preview-is-pure.spec.ts)

##### Pack unpack preview describes the promotions without changing any state

- Requirement: `cli/packs/unpack/preview-is-pure`
- Statement: When packs unpack runs in preview mode against an installed pack, it shall report the members it would promote to direct entries and the pack it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`specifications/cli/packs/unpack/preview-is-pure.spec.ts`](../specifications/cli/packs/unpack/preview-is-pure.spec.ts)

##### Unpack keeps members installed as direct declarations

- Requirement: `cli/packs/unpack/promotes-members-without-overwriting-direct-intent`
- Statement: When a person unpacks a configured pack with complete member resolutions, AXM shall preserve its installed leaf members as direct workspace declarations, retain existing direct declarations unchanged, and remove the pack declaration.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/packs/unpack/handler.internal.test.ts`, `packages/cli/src/root/packs/unpack/handler.ts`
- Source: [`specifications/cli/packs/unpack/promotes-members-without-overwriting-direct-intent.spec.ts`](../specifications/cli/packs/unpack/promotes-members-without-overwriting-direct-intent.spec.ts)

##### Unpack refuses missing packs and members without usable resolutions

- Requirement: `cli/packs/unpack/refuses-incomplete-membership`
- Statement: When a requested pack is absent or its membership and accepted member identities cannot be established, AXM shall refuse unpacking without changing workspace declarations, installed content, or accepted resolutions.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/packs/unpack/handler.internal.test.ts`, `packages/cli/src/root/packs/unpack/handler.ts`
- Source: [`specifications/cli/packs/unpack/refuses-incomplete-membership.spec.ts`](../specifications/cli/packs/unpack/refuses-incomplete-membership.spec.ts)

##### Pack update preview describes the reconciliation without changing any state

- Requirement: `cli/packs/update/preview-is-pure`
- Statement: When packs update runs in preview mode against a configured pack whose closure is not yet accepted, it shall report the pack and members it would resolve with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`specifications/cli/packs/update/preview-is-pure.spec.ts`](../specifications/cli/packs/update/preview-is-pure.spec.ts)

#### Policy Overrides Reach Every Blocked Command

##### The one-shot release-age override reaches every command the gate can block

- Requirement: `cli/policy-overrides-reach-every-blocked-command`
- Statement: Every command whose outcome the minimum release age can change shall accept --ignore-release-age; that flag shall carry the same one-shot meaning on every command that accepts it; and no other flag shall grant that bypass.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table, static
- Derived from: `cli/force-bypasses-only-named-policies`
- Open questions: Whether enabling an already-installed extension should resolve from source at all, or should read only the accepted resolution and never reach the gate. Activation accepts the override today because the gate can block it today; deciding that question may remove activation from the gated inventory instead.
- Limitation: The one-shot meaning is exercised through each handler the flag reaches — root install, root update, sync, the shared workspace install, and the shared workspace update — rather than once per registered command path. Commands routing into the same handler share its behavior by construction, and the registration and parser checks below do cover every path. Retires when: The specification harness exports a driver for every gate-blockable command path, letting the decision table run per path.
- Source: [`specifications/cli/policy-overrides-reach-every-blocked-command.spec.ts`](../specifications/cli/policy-overrides-reach-every-blocked-command.spec.ts)

#### Preview Does Not Consume Approval

##### A preview reads the same with or without advance approval and spends none of it

- Requirement: `cli/preview-does-not-consume-approval`
- Statement: When a command that offers both assessment and advance approval runs in preview mode, it shall render the same candidate whether or not approval accompanies the request, shall ask for no confirmation, and a later unattended apply without approval shall still stop as approval required with nothing changed.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/demote/preview-is-pure`, `cli/setup/preview-is-pure`
- Source: [`specifications/cli/preview-does-not-consume-approval.spec.ts`](../specifications/cli/preview-does-not-consume-approval.spec.ts)

#### Projection Currency Follows State Authority

##### Generated document currency follows authoritative inputs, not rendered bytes

- Requirement: `cli/projection-currency-follows-state-authority`
- Statement: Reconciliation shall judge a generated document current by its authoritative inputs and generation record rather than its rendered bytes, preserving body rewrites while inputs are unchanged and regenerating when inputs change or the generated document is missing.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/projection-currency.e2e.test.ts`](../packages/cli-e2e/src/projection-currency.e2e.test.ts) — Runs a real Markdown formatter between projection and the packaged CLI, then proves both lint views, preview, sync, and reinstall preserve the formatted bytes.
- Source: [`specifications/cli/projection-currency-follows-state-authority.spec.ts`](../specifications/cli/projection-currency-follows-state-authority.spec.ts)

#### Publish

##### Publication refuses incomplete or unsafe archives

- Requirement: `cli/publish/archives-satisfy-distribution-contract`
- Statement: Before uploading an extension, publish shall reject an archive that omits a required package file or includes a node_modules entry or .env file, identify the invalid path, and give removal guidance for unsafe entries.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/publish/command.internal.test.ts`, `packages/cli/src/root/publish/command.ts`
- Source: [`specifications/cli/publish/archives-satisfy-distribution-contract.spec.ts`](../specifications/cli/publish/archives-satisfy-distribution-contract.spec.ts)

##### Pack dependency inclusion adds only workspace-authored members

- Requirement: `cli/publish/dependency-inclusion-adds-only-authored-pack-members`
- Statement: For a selected pack, publish shall add its workspace-authored dependencies only when dependency inclusion is explicitly requested, retain external dependencies as Registry references, and leave unrelated authored extensions outside the selection.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `packages/cli/help/topics/publish.md`, `packages/cli/src/root/publish/command.ts`
- Source: [`specifications/cli/publish/dependency-inclusion-adds-only-authored-pack-members.spec.ts`](../specifications/cli/publish/dependency-inclusion-adds-only-authored-pack-members.spec.ts)

##### Existing publications are verified or rejected without being overwritten

- Requirement: `cli/publish/existing-versions-require-explicit-policy`
- Statement: For an already published version, publish shall reject the error policy, treat the verify policy as a successful no-op only when the newly built archive's SHA-512 integrity matches the published integrity, and reject differing content as integrity drift, with an explicit single selector defaulting to error and bulk selection defaulting to verify.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `packages/cli/help/topics/publish.md`, `packages/cli/src/root/publish/command.internal.test.ts`
- Source: [`specifications/cli/publish/existing-versions-require-explicit-policy.spec.ts`](../specifications/cli/publish/existing-versions-require-explicit-policy.spec.ts)

##### Publication exclusions use explicit case-sensitive package paths

- Requirement: `cli/publish/ignore-patterns-have-declared-path-semantics`
- Statement: Publish shall match ignore patterns against case-sensitive archive-relative POSIX paths with only the asterisk acting as a wildcard across directory separators and with question marks, brackets, and negation characters treated literally.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `packages/cli/help/topics/publish.md`
- Source: [`specifications/cli/publish/ignore-patterns-have-declared-path-semantics.spec.ts`](../specifications/cli/publish/ignore-patterns-have-declared-path-semantics.spec.ts)

##### Older unpublished versions require explicit backfill

- Requirement: `cli/publish/older-unpublished-versions-require-backfill`
- Statement: Publish shall reject an unpublished version below the highest published semantic version unless backfill is explicitly requested, and the refusal shall offer a version bump or intentional backfill, and backfill shall permit only an unpublished version without authorizing replacement of an existing release.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/publish/command.ts`, `packages/cli/src/root/publish/command.internal.test.ts`
- Source: [`specifications/cli/publish/older-unpublished-versions-require-backfill.spec.ts`](../specifications/cli/publish/older-unpublished-versions-require-backfill.spec.ts)

##### Publication results distinguish confirmed, failed, blocked, pending and unresolved work

- Requirement: `cli/publish/outcomes-distinguish-unresolved-uploads`
- Statement: When publication partially fails or is interrupted, AXM shall report each candidate according to the available evidence, retain acknowledged independent successes, block dependents of failed uploads, distinguish unattempted work from dispatched uploads with unknown outcomes, and provide credential-free recovery for the unfinished selection.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `machine-automation`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/publish/command.internal.test.ts`, `packages/extension-publish/src/settlement.internal.test.ts`
- Source: [`specifications/cli/publish/outcomes-distinguish-unresolved-uploads.spec.ts`](../specifications/cli/publish/outcomes-distinguish-unresolved-uploads.spec.ts)

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

##### Publishing preserves established extension visibility

- Requirement: `cli/publish/preserves-established-visibility`
- Statement: Publish shall apply an explicit visibility request only when establishing a new extension, preserve existing extension visibility when adding or verifying a version, and report which visibility was established or preserved.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/publish/command.internal.test.ts`, `packages/cli/src/root/publish/command.ts`
- Source: [`specifications/cli/publish/preserves-established-visibility.spec.ts`](../specifications/cli/publish/preserves-established-visibility.spec.ts)

##### Publish preview reports the admitted publication set without distributing anything

- Requirement: `cli/publish/preview-is-pure`
- Statement: When publish runs in preview mode, it shall report the admitted publication set with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
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

##### Publication reports differing workspace and consumer versions

- Requirement: `cli/publish/reports-pack-resolution-differences`
- Statement: When an admitted authored pack has a dependency whose effective Registry version differs from the satisfying version in this workspace, publish shall report both versions and the dependency constraint as a warning with guidance for reconciling the difference, without treating that warning as a publication failure.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/publish/command.internal.test.ts`, `packages/cli/src/root/publish/command.ts`
- Source: [`specifications/cli/publish/reports-pack-resolution-differences.spec.ts`](../specifications/cli/publish/reports-pack-resolution-differences.spec.ts)

##### Publish refuses extensions the workspace does not author

- Requirement: `cli/publish/requires-established-authorship`
- Statement: Publish shall distribute only extensions the workspace authors: an explicitly selected acquired extension shall fail with a conflict that suggests adopting it and upload nothing, while bulk publication shall report acquired entries as not authored and may publish eligible authored entries without uploading acquired entries.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/publish/requires-established-authorship.spec.ts`](../specifications/cli/publish/requires-established-authorship.spec.ts)

##### Publication requires an existing owner

- Requirement: `cli/publish/requires-existing-publish-owners`
- Statement: Before remotely publishing a selected extension, AXM shall require its owner to exist and, when an owner is absent, reject publication without uploading and provide the organization creation route.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/publish/command.internal.test.ts`, `packages/cli/src/root/publish/command.ts`
- Source: [`specifications/cli/publish/requires-existing-publish-owners.spec.ts`](../specifications/cli/publish/requires-existing-publish-owners.spec.ts)

##### Publish requires explicit acceptance when archive content differs from Git HEAD

- Requirement: `cli/publish/requires-explicit-acceptance-for-non-head-source`
- Statement: When an extension's archive differs from Git HEAD or the repository has no HEAD, publish shall block that extension and name --accept-warnings as the required override until it is given, while an archive matching HEAD, outside Git, or differing only in excluded paths shall publish without acceptance.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Assumptions: The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; every scenario substitutes the comparison outcome rather than running Git.
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`specifications/cli/publish/requires-explicit-acceptance-for-non-head-source.spec.ts`](../specifications/cli/publish/requires-explicit-acceptance-for-non-head-source.spec.ts)

##### Publication respects workspace pack constraints

- Requirement: `cli/publish/respects-local-pack-constraints`
- Statement: When an authored member selected for publication is excluded by a workspace pack constraint, publish shall reject it in preview and apply, including existing-version verification, name the member and conflicting pack constraint, and offer a repair appropriate to the pack authority.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/publish/command.internal.test.ts`, `packages/cli/src/root/publish/command.ts`
- Source: [`specifications/cli/publish/respects-local-pack-constraints.spec.ts`](../specifications/cli/publish/respects-local-pack-constraints.spec.ts)

##### Publication selectors and filters narrow the workspace-authored set

- Requirement: `cli/publish/selectors-and-filters-narrow-authored-candidates`
- Statement: Root publish shall select the workspace-authored candidates matching either explicit fully qualified or type-qualified selectors and globs, or the owner, type and exclusion filters on an argument-free selection, defaulting to all authored candidates and never adding unrelated candidates.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `packages/cli/help/topics/publish.md`, `packages/cli/src/root/publish/command.ts`
- Source: [`specifications/cli/publish/selectors-and-filters-narrow-authored-candidates.spec.ts`](../specifications/cli/publish/selectors-and-filters-narrow-authored-candidates.spec.ts)

#### Publisher Changes Require Interactive Approval

##### Accepting a Registry extension from a different publisher needs a person's approval

- Requirement: `cli/publisher-changes-require-interactive-approval`
- Statement: When an apply would replace an accepted Registry binding with one published under a different publisher for the same extension, every route that can make that acceptance shall report the change in preview without changing anything, shall stop as approval required naming interactive approval when no prompt can open, and shall record the new binding only after a person approves it at a prompt; an acceptance under the same publisher, or a first acceptance, shall not be treated as such a change.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/update/preview-is-pure`, `cli/install/preview-is-pure`, `cli/skills/update/preview-is-pure`, `packages/cli/src/root/skills/update/handler.internal.test.ts`
- Source: [`specifications/cli/publisher-changes-require-interactive-approval.spec.ts`](../specifications/cli/publisher-changes-require-interactive-approval.spec.ts)

#### Registry Management Preserves Authentication Failures

##### Registry management preserves authentication failures without reporting success

- Requirement: `cli/registry-management-preserves-authentication-failures`
- Statement: When a Registry lifecycle or visibility command receives an authentication rejection, AXM shall preserve the authentication failure, stop the operation without replaying the rejected request, and emit no successful result.
- Class: functional
- Role: experience
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Derived from: `AgentXM Registry API 0.1.0`, `packages/cli/src/root/lifecycle/command.internal.test.ts`
- Source: [`specifications/cli/registry-management-preserves-authentication-failures.spec.ts`](../specifications/cli/registry-management-preserves-authentication-failures.spec.ts)

#### Registry Writes Complete Required Verification

##### Challenged Registry writes complete the required verification before retrying

- Requirement: `cli/registry-writes-complete-required-verification`
- Statement: When yank, unyank, visibility set, or visibility reconcile receives a human-verification challenge, AXM shall present the action, target and verification URL, wait for that challenge's completion, retry the same mutation at most once with its verification identifier while preserving any observed revision, and report no success if verification or the retry fails.
- Class: functional
- Role: experience
- Product goals: `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `AgentXM Registry API 0.1.0`, `packages/cli/src/root/step-up.ts`, `packages/cli/src/root/lifecycle/command.internal.test.ts`
- Source: [`specifications/cli/registry-writes-complete-required-verification.spec.ts`](../specifications/cli/registry-writes-complete-required-verification.spec.ts)

#### Relative Paths Start In Selected Directory

##### Relative paths start in the selected directory

- Requirement: `cli/relative-paths-start-in-selected-directory`
- Statement: AXM shall resolve relative command paths and configured local sources from the selected workspace directory.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI parses global arguments and selects its execution directory before composing workspace services; a real process establishes the selected filesystem boundary.
- Methods: example, decision-table
- Derived from: `packages/cli-e2e/src/directory.e2e.test.ts`, `packages/cli/help/topics/basic-usage.md`
- Source: [`specifications/cli/relative-paths-start-in-selected-directory.spec.ts`](../specifications/cli/relative-paths-start-in-selected-directory.spec.ts)

#### Rules

##### Rule disable preview describes the deactivation without changing any state

- Requirement: `cli/rules/disable/preview-is-pure`
- Statement: When rules disable runs in preview mode against an enabled rule, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/activation-follows-desired-state`, `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/rules/disable/preview-is-pure.spec.ts`](../specifications/cli/rules/disable/preview-is-pure.spec.ts)

##### Rule enable preview describes the activation without changing any state

- Requirement: `cli/rules/enable/preview-is-pure`
- Statement: When rules enable runs in preview mode against a disabled rule, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/activation-follows-desired-state`, `cli/skills/enable/preview-is-pure`
- Source: [`specifications/cli/rules/enable/preview-is-pure.spec.ts`](../specifications/cli/rules/enable/preview-is-pure.spec.ts)

##### Rule install preview describes the installation without changing any state

- Requirement: `cli/rules/install/preview-is-pure`
- Statement: When rules install runs in preview mode against a local rule package that is not yet installed, it shall report the installation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`, `cli/install/preview-is-pure`
- Source: [`specifications/cli/rules/install/preview-is-pure.spec.ts`](../specifications/cli/rules/install/preview-is-pure.spec.ts)

##### Creating a rule records editable workspace content

- Requirement: `cli/rules/new/creates-enabled-workspace-content`
- Statement: When a person creates a rule, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/rules/new.ts`
- Source: [`specifications/cli/rules/new/creates-enabled-workspace-content.spec.ts`](../specifications/cli/rules/new/creates-enabled-workspace-content.spec.ts)

##### New rule preview describes the scaffold without changing any state

- Requirement: `cli/rules/new/preview-is-pure`
- Statement: When rules new runs in preview mode for a name that is not yet authored, it shall report the package it would create with a previewed outcome and shall not change settings, the authored source root, or agent instruction files.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/hooks/new/preview-is-pure`
- Source: [`specifications/cli/rules/new/preview-is-pure.spec.ts`](../specifications/cli/rules/new/preview-is-pure.spec.ts)

##### Rule publish preview reports the admitted rules without distributing anything

- Requirement: `cli/rules/publish/preview-is-pure`
- Statement: When rules publish runs in preview mode, it shall report the admitted workspace-authored rules with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure`
- Source: [`specifications/cli/rules/publish/preview-is-pure.spec.ts`](../specifications/cli/rules/publish/preview-is-pure.spec.ts)

##### Rule uninstall preview describes the removal without changing any state

- Requirement: `cli/rules/uninstall/preview-is-pure`
- Statement: When rules uninstall runs in preview mode against an installed rule, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`
- Source: [`specifications/cli/rules/uninstall/preview-is-pure.spec.ts`](../specifications/cli/rules/uninstall/preview-is-pure.spec.ts)

##### Rule update preview describes the update without changing any state

- Requirement: `cli/rules/update/preview-is-pure`
- Statement: When rules update runs in preview mode against an installed rule whose source has changed, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`
- Source: [`specifications/cli/rules/update/preview-is-pure.spec.ts`](../specifications/cli/rules/update/preview-is-pure.spec.ts)

#### Setup

##### Setup initializes the selected workspace

- Requirement: `cli/setup/initializes-selected-workspace`
- Statement: When setup is approved with explicit scope and agents for an uninitialized directory, AXM shall create the selected workspace settings, lockfile, and bundled AXM skill for those agents while preserving other scopes.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/setup.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/init.e2e.test.ts`](../packages/cli-e2e/src/init.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/setup/command.e2e.ts scenarios through real CLI processes. They observe selected-directory argv, bundled files, unattended setup prerequisites, and repeat setup preserving declared configuration. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`specifications/cli/setup/initializes-selected-workspace.spec.ts`](../specifications/cli/setup/initializes-selected-workspace.spec.ts)

##### Setup preview describes the workspace it would create without creating it

- Requirement: `cli/setup/preview-is-pure`
- Statement: When setup runs in preview mode against an uninitialized directory, it shall report the setup candidate it would apply with a previewed outcome and shall not create workspace settings, the lockfile, the runtime directory, instruction files, or agent projections, whether or not preapproval accompanies the preview.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/setup/preview-is-pure.spec.ts`](../specifications/cli/setup/preview-is-pure.spec.ts)

##### Setup preview resolves its inputs from documented defaults without asking

- Requirement: `cli/setup/preview-resolves-inputs-without-prompts`
- Statement: When setup runs in preview mode, it shall resolve coding-agent membership and instruction configuration from the explicit request or the documented defaults, shall raise no prompt even in an interactive session, shall resolve the same candidate with or without preapproval, and shall disclose which defaults it used.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/setup/preview-resolves-inputs-without-prompts.spec.ts`](../specifications/cli/setup/preview-resolves-inputs-without-prompts.spec.ts)

##### Repeated setup preserves the existing workspace

- Requirement: `cli/setup/rerun-preserves-existing-configuration`
- Statement: When setup runs against an initialized workspace, AXM shall preserve its settings, lockfile, authored content, and agent outputs even if different agents are supplied, directing membership changes to the agent commands.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/setup.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/init.e2e.test.ts`](../packages/cli-e2e/src/init.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/setup/command.e2e.ts scenarios through real CLI processes. They observe selected-directory argv, bundled files, unattended setup prerequisites, and repeat setup preserving declared configuration. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`specifications/cli/setup/rerun-preserves-existing-configuration.spec.ts`](../specifications/cli/setup/rerun-preserves-existing-configuration.spec.ts)

##### Unattended setup applies only a fully explicit request

- Requirement: `cli/setup/unattended-apply-requires-explicit-intent`
- Statement: When setup runs unattended against an uninitialized directory, it shall apply only when preapproval, an explicit scope, and at least one explicit coding agent are all present, and a request missing any of them shall terminate with approval required and shall change no state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/machine-mode-never-prompts`, `packages/cli/src/root/setup.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/init.e2e.test.ts`](../packages/cli-e2e/src/init.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/setup/command.e2e.ts scenarios through real CLI processes. They observe selected-directory argv, bundled files, unattended setup prerequisites, and repeat setup preserving declared configuration. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`specifications/cli/setup/unattended-apply-requires-explicit-intent.spec.ts`](../specifications/cli/setup/unattended-apply-requires-explicit-intent.spec.ts)

#### Skills

##### Skill disable preview describes the deactivation without changing any state

- Requirement: `cli/skills/disable/preview-is-pure`
- Statement: When skills disable runs in preview mode against an enabled skill, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/enable/preview-is-pure`, `cli/activation-follows-desired-state`
- Source: [`specifications/cli/skills/disable/preview-is-pure.spec.ts`](../specifications/cli/skills/disable/preview-is-pure.spec.ts)

##### Skill enable preview describes the activation without changing any state

- Requirement: `cli/skills/enable/preview-is-pure`
- Statement: When skills enable runs in preview mode against a disabled skill, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/activation-follows-desired-state`
- Source: [`specifications/cli/skills/enable/preview-is-pure.spec.ts`](../specifications/cli/skills/enable/preview-is-pure.spec.ts)

##### Skill import preview describes the conversion without changing any state

- Requirement: `cli/skills/import/preview-is-pure`
- Statement: When skills import runs in preview mode against a native skill, it shall report the managed package it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, agent projections, or the native source.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli-e2e/src/fork-import.e2e.test.ts`
- Source: [`specifications/cli/skills/import/preview-is-pure.spec.ts`](../specifications/cli/skills/import/preview-is-pure.spec.ts)

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

##### Skill install preview describes the acquisition without changing any state

- Requirement: `cli/skills/install/preview-is-pure`
- Statement: When skills install runs in preview mode against an installable source, it shall report the skills it would install with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`
- Source: [`specifications/cli/skills/install/preview-is-pure.spec.ts`](../specifications/cli/skills/install/preview-is-pure.spec.ts)

##### Skill creation preview describes the scaffold without creating any state

- Requirement: `cli/skills/new/preview-is-pure`
- Statement: When skills new runs in preview mode with an owner the workspace authors, it shall report the manifest, content, settings entry, and agent locations it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/new/scaffolds-for-every-configured-agent`
- Source: [`specifications/cli/skills/new/preview-is-pure.spec.ts`](../specifications/cli/skills/new/preview-is-pure.spec.ts)

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

##### Skill publish preview reports the admitted skills without distributing anything

- Requirement: `cli/skills/publish/preview-is-pure`
- Statement: When skills publish runs in preview mode, it shall report the admitted workspace-authored skills with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure`
- Source: [`specifications/cli/skills/publish/preview-is-pure.spec.ts`](../specifications/cli/skills/publish/preview-is-pure.spec.ts)

##### Skill uninstall preview describes the removal without changing any state

- Requirement: `cli/skills/uninstall/preview-is-pure`
- Statement: When skills uninstall runs in preview mode against an installed skill, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`, `packages/cli/src/root/skills/uninstall/handler.internal.test.ts`
- Source: [`specifications/cli/skills/uninstall/preview-is-pure.spec.ts`](../specifications/cli/skills/uninstall/preview-is-pure.spec.ts)

##### Skill update preview describes the available update without changing any state

- Requirement: `cli/skills/update/preview-is-pure`
- Statement: When skills update runs in preview mode while the Registry serves a newer version of an accepted skill, it shall report the update it would apply with a previewed outcome, shall report a changed publisher binding as a condition that only interactive approval satisfies, and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/update/advances-resolution-within-intent`, `packages/cli/src/root/skills/update/handler.internal.test.ts`
- Source: [`specifications/cli/skills/update/preview-is-pure.spec.ts`](../specifications/cli/skills/update/preview-is-pure.spec.ts)

#### Subagents

##### Subagent disable preview describes the deactivation without changing any state

- Requirement: `cli/subagents/disable/preview-is-pure`
- Statement: When subagents disable runs in preview mode against an enabled subagent, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/disable/preview-is-pure`, `cli/activation-follows-desired-state`
- Source: [`specifications/cli/subagents/disable/preview-is-pure.spec.ts`](../specifications/cli/subagents/disable/preview-is-pure.spec.ts)

##### Subagent enable preview describes the activation without changing any state

- Requirement: `cli/subagents/enable/preview-is-pure`
- Statement: When subagents enable runs in preview mode against a disabled subagent, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/enable/preview-is-pure`, `cli/activation-follows-desired-state`
- Source: [`specifications/cli/subagents/enable/preview-is-pure.spec.ts`](../specifications/cli/subagents/enable/preview-is-pure.spec.ts)

##### Subagent import preview describes the conversion without changing any state

- Requirement: `cli/subagents/import/preview-is-pure`
- Statement: When subagents import runs in preview mode against a native subagent, it shall report the managed package it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, agent projections, or the native source.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/import/preview-is-pure`, `packages/cli-e2e/src/fork-import.e2e.test.ts`
- Source: [`specifications/cli/subagents/import/preview-is-pure.spec.ts`](../specifications/cli/subagents/import/preview-is-pure.spec.ts)

##### Subagent install preview describes the acquisition without changing any state

- Requirement: `cli/subagents/install/preview-is-pure`
- Statement: When subagents install runs in preview mode against an installable source, it shall report the subagents it would install with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/install/preview-is-pure`, `cli/skills/install/preview-is-pure`
- Source: [`specifications/cli/subagents/install/preview-is-pure.spec.ts`](../specifications/cli/subagents/install/preview-is-pure.spec.ts)

##### Subagent creation preview describes the scaffold without creating any state

- Requirement: `cli/subagents/new/preview-is-pure`
- Statement: When subagents new runs in preview mode with an owner the workspace authors, it shall report the manifest, content, and settings entry it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/subagents/new/scaffolds-for-every-configured-agent`
- Source: [`specifications/cli/subagents/new/preview-is-pure.spec.ts`](../specifications/cli/subagents/new/preview-is-pure.spec.ts)

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

##### Subagent publish preview reports the admitted subagents without distributing anything

- Requirement: `cli/subagents/publish/preview-is-pure`
- Statement: When subagents publish runs in preview mode, it shall report the admitted workspace-authored subagents with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/publish/preview-is-pure`
- Source: [`specifications/cli/subagents/publish/preview-is-pure.spec.ts`](../specifications/cli/subagents/publish/preview-is-pure.spec.ts)

##### Subagent uninstall preview describes the removal without changing any state

- Requirement: `cli/subagents/uninstall/preview-is-pure`
- Statement: When subagents uninstall runs in preview mode against an installed subagent, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/uninstall/preview-is-pure`, `packages/cli/src/root/subagents/uninstall/handler.internal.test.ts`
- Source: [`specifications/cli/subagents/uninstall/preview-is-pure.spec.ts`](../specifications/cli/subagents/uninstall/preview-is-pure.spec.ts)

##### Subagent update preview describes the available update without changing any state

- Requirement: `cli/subagents/update/preview-is-pure`
- Statement: When subagents update runs in preview mode while the Registry serves a newer version of an accepted subagent, it shall report the update it would apply with a previewed outcome, shall report a changed publisher binding as a condition that only interactive approval satisfies, and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/skills/update/preview-is-pure`, `packages/cli/src/root/subagents/update/handler.internal.test.ts`
- Source: [`specifications/cli/subagents/update/preview-is-pure.spec.ts`](../specifications/cli/subagents/update/preview-is-pure.spec.ts)

#### Sync

##### A sync check requires preview mode

- Requirement: `cli/sync/check-requires-preview`
- Statement: When sync is invoked with --fail-on-change without --preview, AXM shall reject the invocation as a usage error before applying workspace changes.
- Class: constraint
- Role: experience
- Product goals: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI establishes the actual parser combination, usage error, process exit status, and persisted state after refusal.
- Methods: example
- Derived from: `packages/cli/src/root/sync/handler.internal.test.ts`
- Source: [`specifications/cli/sync/check-requires-preview.spec.ts`](../specifications/cli/sync/check-requires-preview.spec.ts)

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

##### Sync preview describes the reconciliation without changing any state

- Requirement: `cli/sync/preview-is-pure`
- Statement: When sync runs in preview mode against a workspace whose managed state has drifted from desired state, it shall report the reconciliation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/sync/realizes-desired-state`
- Source: [`specifications/cli/sync/preview-is-pure.spec.ts`](../specifications/cli/sync/preview-is-pure.spec.ts)

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

#### Token

##### Token administration waits for required human verification

- Requirement: `cli/token/completes-required-human-verification`
- Statement: When the Registry requires human verification for token creation or revocation, AXM shall present the verification action, wait for its approval, and retry the unchanged request with that verification identifier only after approval, without opening a browser in machine mode.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/token.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/auth.e2e.test.ts`](../packages/cli-e2e/src/auth.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/auth/token/token.e2e.ts scenarios through real CLI processes. They observe raw/JSON token stdout and HTTP verification followed by token creation. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`specifications/cli/token/completes-required-human-verification.spec.ts`](../specifications/cli/token/completes-required-human-verification.spec.ts)

##### Token creation requests the selected authority

- Requirement: `cli/token/create/submits-requested-authority`
- Statement: When creating a token, AXM shall submit the requested name, lifetime, and permission restrictions using the effective credential and report the issued token without replacing the current session.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/token.internal.test.ts`
- Open questions: Which token-lifetime input forms, omitted-input default, and valid range should the CLI guarantee? Command help and parser tests are witnesses for the current forms and default; this requirement allocates submission of the selected lifetime, not an undecided lifetime-input policy.
- Source: [`specifications/cli/token/create/submits-requested-authority.spec.ts`](../specifications/cli/token/create/submits-requested-authority.spec.ts)

##### Token listing reports Registry inventory and completeness

- Requirement: `cli/token/list/reports-token-inventory`
- Statement: When token list succeeds, AXM shall report the Registry token metadata and pagination state without including token secrets.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/token.internal.test.ts`
- Source: [`specifications/cli/token/list/reports-token-inventory.spec.ts`](../specifications/cli/token/list/reports-token-inventory.spec.ts)

##### Token revocation names the selected credential

- Requirement: `cli/token/revoke/revokes-only-selected-token`
- Statement: When token revoke is requested, AXM shall request deletion of the selected token identifier using the effective credential and report success only after the Registry accepts deletion.
- Class: functional
- Role: experience
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/token.internal.test.ts`
- Source: [`specifications/cli/token/revoke/revokes-only-selected-token.spec.ts`](../specifications/cli/token/revoke/revokes-only-selected-token.spec.ts)

#### Type List Agent Filters Match Any Selected Agent

##### Agent filters match any selected agent

- Requirement: `cli/type-list-agent-filters-match-any-selected-agent`
- Statement: When filtering skill or subagent inventories by agents, AXM shall include entries observed by any selected agent and exclude entries observed by none of them.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/skills/list.internal.test.ts`, `packages/cli/src/root/subagents/list/handler.internal.test.ts`
- Source: [`specifications/cli/type-list-agent-filters-match-any-selected-agent.spec.ts`](../specifications/cli/type-list-agent-filters-match-any-selected-agent.spec.ts)

#### Type Shows Report Missing Entries

##### Type inspection identifies missing entries

- Requirement: `cli/type-shows-report-missing-entries`
- Statement: When a skills show, mcps show, subagents show, rules show, hooks show, or knowledge show target has no configured, installed, or detected local entry, AXM shall report that entry as not found with a command for inspecting the available entries.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/shared/extension-show.internal.test.ts`, `packages/cli/src/root/shared/extension-show.ts`
- Source: [`specifications/cli/type-shows-report-missing-entries.spec.ts`](../specifications/cli/type-shows-report-missing-entries.spec.ts)

#### Undeprecate

##### Deprecation removal uses the observed revision

- Requirement: `cli/undeprecate/removes-guidance-at-the-observed-revision`
- Statement: The undeprecate command shall read the selected extension's deprecation revision, use that exact revision as the removal precondition, and report the Registry's acknowledged transition without silently replacing a rejected precondition.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/lifecycle/command.ts`, `packages/cli/src/root/lifecycle/command.internal.test.ts`
- Source: [`specifications/cli/undeprecate/removes-guidance-at-the-observed-revision.spec.ts`](../specifications/cli/undeprecate/removes-guidance-at-the-observed-revision.spec.ts)

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

##### Uninstall preserves unrelated and unowned files

- Requirement: `cli/uninstall/preserves-unrelated-and-unowned-state`
- Statement: When an extension is uninstalled, AXM shall preserve unrelated workspace files, unowned agent configuration, and the original local source package.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Derived from: `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/every-type-completes-the-shared-lifecycle`
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/preserves-unrelated-and-unowned-state.spec.ts`](../specifications/cli/uninstall/preserves-unrelated-and-unowned-state.spec.ts)

##### Uninstall preview describes the removal without changing any state

- Requirement: `cli/uninstall/preview-is-pure`
- Statement: When uninstall runs in preview mode against a desired extension, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/uninstall/is-idempotent`
- Source: [`specifications/cli/uninstall/preview-is-pure.spec.ts`](../specifications/cli/uninstall/preview-is-pure.spec.ts)

##### Uninstall removes direct intent and keeps state another desired route still reaches

- Requirement: `cli/uninstall/removes-direct-route-and-recomputes-reachability`
- Statement: When a directly desired extension is uninstalled, AXM shall remove its direct configuration from axm.json, shall remove its resolution, canonical content, and projections only when no other desired route still reaches it, reporting retained state otherwise, and shall leave every other desired extension's state untouched.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `cli/every-type-completes-the-shared-lifecycle`
- Supersedes: `cli/every-type-completes-the-shared-lifecycle`
- Additional evidence: process via [`packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../packages/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
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

#### Unusable Directories Fail Before Command

##### Unusable directories fail before the command runs

- Requirement: `cli/unusable-directories-fail-before-command`
- Statement: When a selected directory is missing, is a file, or cannot be traversed, AXM shall report a usage failure before executing the command or changing workspace state.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI parses global arguments and selects its execution directory before composing workspace services; a real process establishes the selected filesystem boundary.
- Methods: example, decision-table
- Derived from: `packages/cli-e2e/src/directory.e2e.test.ts`, `packages/cli/help/topics/basic-usage.md`
- Source: [`specifications/cli/unusable-directories-fail-before-command.spec.ts`](../specifications/cli/unusable-directories-fail-before-command.spec.ts)

#### Unyank

##### Unyank restores only the explicitly identified version

- Requirement: `cli/unyank/requires-an-exact-version`
- Statement: The unyank command shall require an exact semantic version, request restoration only for that version, and report restoration only after the Registry acknowledges the request.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/lifecycle/command.ts`, `packages/cli/src/root/lifecycle/command.internal.test.ts`
- Source: [`specifications/cli/unyank/requires-an-exact-version.spec.ts`](../specifications/cli/unyank/requires-an-exact-version.spec.ts)

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
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
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

##### Update preview describes the advance without changing any state

- Requirement: `cli/update/preview-is-pure`
- Statement: When update runs in preview mode against a desired extension with a newer eligible version, it shall report the advance it would apply with a previewed outcome, including any publisher change the acceptance would make, and shall not change settings, the lockfile, canonical content, or agent projections.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/update/advances-resolution-within-intent`
- Source: [`specifications/cli/update/preview-is-pure.spec.ts`](../specifications/cli/update/preview-is-pure.spec.ts)

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

#### Upgrade

##### Availability outcomes retain the observed reason

- Requirement: `cli/upgrade/availability-failures-are-attributed`
- Statement: When installer preparation or availability blocks an upgrade, human and machine results shall agree with the recorded observation, distinguish affirmative absence from indeterminate failure and formula version mismatch, and report mutation and verification as not attempted.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/machine-result-is-upgrade-assessment`
- Source: [`specifications/cli/upgrade/availability-failures-are-attributed.spec.ts`](../specifications/cli/upgrade/availability-failures-are-attributed.spec.ts)

##### Upgrade discloses the installer it resolved and the version it selected before mutating

- Requirement: `cli/upgrade/discloses-resolved-ownership-before-mutation`
- Statement: Upgrade shall disclose the install method it detected and the version it selected before it performs the first mutation, and shall disclose both without performing any mutation when asked for a preview.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/ownership-precedes-release-selection`
- Source: [`specifications/cli/upgrade/discloses-resolved-ownership-before-mutation.spec.ts`](../specifications/cli/upgrade/discloses-resolved-ownership-before-mutation.spec.ts)

##### Exact upgrade bypasses release discovery

- Requirement: `cli/upgrade/exact-version-bypasses-discovery`
- Statement: An upgrade naming a normalized stable semantic version shall derive its immutable GitHub Release coordinate without discovery, and shall reject leading-v, prerelease, or non-normalized versions before mutation.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Source: [`specifications/cli/upgrade/exact-version-bypasses-discovery.spec.ts`](../specifications/cli/upgrade/exact-version-bypasses-discovery.spec.ts)

##### Homebrew checks selected-version availability once

- Requirement: `cli/upgrade/homebrew-checks-availability-once`
- Statement: When a Homebrew-owned installation requires mutation, upgrade shall perform at most one explicit metadata refresh and one formula query with their own command timeouts, then either proceed on an exact match or stop without publication polling.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/installer-availability-gates-mutation`
- Source: [`specifications/cli/upgrade/homebrew-checks-availability-once.spec.ts`](../specifications/cli/upgrade/homebrew-checks-availability-once.spec.ts)

##### Installer availability gates upgrade mutation

- Requirement: `cli/upgrade/installer-availability-gates-mutation`
- Statement: Before mutating an npm-, pnpm-, Yarn-, or Homebrew-owned installation, upgrade shall establish that the selected exact version is available through that installer; lagging, leading, unavailable, or indeterminate publication state shall leave the installation unchanged and report recovery guidance.
- Class: constraint
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/upgrade/installer-availability-gates-mutation.spec.ts`](../specifications/cli/upgrade/installer-availability-gates-mutation.spec.ts)

##### Latest upgrade uses the promoted stable channel

- Requirement: `cli/upgrade/latest-uses-promoted-stable-channel`
- Statement: An upgrade without an exact version shall select only the validated release coordinate in the fixed public stable-channel document using one bounded request, and shall not enumerate GitHub releases or infer stability from package-manager publication state.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/upgrade/latest-uses-promoted-stable-channel.spec.ts`](../specifications/cli/upgrade/latest-uses-promoted-stable-channel.spec.ts)

##### Upgrade preserves current and newer installations unless equal-version reinstall is requested

- Requirement: `cli/upgrade/preserves-current-or-newer-installations`
- Statement: AXM shall leave an equal or newer installation unchanged unless equal-version reinstallation is explicitly requested, and shall refuse a downgrade even when reinstallation is requested.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/upgrade/upgrade.ts`, `packages/cli/src/root/upgrade/handler.internal.test.ts`
- Source: [`specifications/cli/upgrade/preserves-current-or-newer-installations.spec.ts`](../specifications/cli/upgrade/preserves-current-or-newer-installations.spec.ts)

##### Upgrade preview resolves the installation change without performing it

- Requirement: `cli/upgrade/preview-is-pure`
- Statement: When upgrade runs in preview mode against an installation with a newer promoted release, it shall report the installer, the target, and the command it would run with a previewed outcome and shall invoke no installer command, persist no install metadata, and write no update-check cache.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `cli/upgrade/discloses-resolved-ownership-before-mutation`
- Source: [`specifications/cli/upgrade/preview-is-pure.spec.ts`](../specifications/cli/upgrade/preview-is-pure.spec.ts)

##### Unsupported upgrade routes require explicit recovery

- Requirement: `cli/upgrade/requires-a-supported-upgrade-route`
- Statement: When an installation is owned by a manager that AXM cannot use for in-place upgrade, AXM shall leave that installation unchanged and report an explicit recovery route without silently delegating to another manager.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/upgrade/handler.internal.test.ts`
- Source: [`specifications/cli/upgrade/requires-a-supported-upgrade-route.spec.ts`](../specifications/cli/upgrade/requires-a-supported-upgrade-route.spec.ts)

##### Script upgrade restores the original after replacement fails verification

- Requirement: `cli/upgrade/restores-original-after-failed-replacement`
- Statement: When a script-owned executable has been replaced but cannot be verified as the selected version, or the operation is interrupted before completion, AXM shall restore the original executable and shall not report a successful upgrade.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/upgrade/handler.internal.test.ts`
- Assumptions: Filesystem restoration remains available; operating-system or storage failures that also prevent rollback require separate recovery evidence.
- Source: [`specifications/cli/upgrade/restores-original-after-failed-replacement.spec.ts`](../specifications/cli/upgrade/restores-original-after-failed-replacement.spec.ts)

##### Script upgrade verifies a download before replacing the installed executable

- Requirement: `cli/upgrade/verifies-download-before-replacement`
- Statement: For a script-owned installation, AXM shall preserve the installed executable unless the selected download has exactly one valid matching checksum and reports the selected version.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/upgrade/handler.internal.test.ts`
- Assumptions: The controlled process port reports executable versions; native binary viability is established by installed-boundary evidence.
- Source: [`specifications/cli/upgrade/verifies-download-before-replacement.spec.ts`](../specifications/cli/upgrade/verifies-download-before-replacement.spec.ts)

##### Package-manager upgrade success requires observed installation evidence

- Requirement: `cli/upgrade/verifies-package-manager-upgrades`
- Statement: When an owning package manager performs an upgrade, AXM shall delegate the selected version to that owner and report success only after the owning installation and the executable selected by command lookup report that version, distinguishing failed commands, unchanged versions and unavailable verification.
- Class: functional
- Role: experience
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/upgrade/handler.internal.test.ts`
- Open questions: The automatic Homebrew reinstall used after a successful but unchanged upgrade remains subordinate recovery logic; its exact retry policy is not an independently accepted experience obligation.
- Source: [`specifications/cli/upgrade/verifies-package-manager-upgrades.spec.ts`](../specifications/cli/upgrade/verifies-package-manager-upgrades.spec.ts)

#### Version

##### Version changes the selected authored manifest while preserving other content

- Requirement: `cli/version/changes-only-the-authored-manifest-version`
- Statement: When a person requests a supported version change for a workspace-authored extension, AXM shall update only that package manifest version to the requested semantic version, preserve other manifest fields and files, and leave bytes unchanged when the requested version is already current.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/shared/version-command.internal.test.ts`, `packages/cli/src/root/shared/extension-version.ts`
- Source: [`specifications/cli/version/changes-only-the-authored-manifest-version.spec.ts`](../specifications/cli/version/changes-only-the-authored-manifest-version.spec.ts)

##### Version preview describes the manifest bump without changing any state

- Requirement: `cli/version/preview-is-pure`
- Statement: When version runs in preview mode against a workspace-authored extension, it shall report the version it would record with a previewed outcome and shall not change the manifest, settings, the lockfile, or any other authored content.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`, `authoring-and-creation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/version/preview-is-pure.spec.ts`](../specifications/cli/version/preview-is-pure.spec.ts)

##### Version refuses invalid versions and packages outside workspace authorship

- Requirement: `cli/version/refuses-invalid-or-unowned-targets`
- Statement: When a version request has an invalid target identity or version, or does not identify a matching workspace-authored package, AXM shall refuse it without changing package content or workspace declarations.
- Class: functional
- Role: experience
- Product goals: `authoring-and-creation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/shared/version-command.internal.test.ts`, `packages/cli/src/root/shared/extension-version.ts`
- Source: [`specifications/cli/version/refuses-invalid-or-unowned-targets.spec.ts`](../specifications/cli/version/refuses-invalid-or-unowned-targets.spec.ts)

#### View

##### View uses the selected type to resolve a local name

- Requirement: `cli/view/explicit-type-selects-the-local-identity`
- Statement: When viewing a configured Registry extension by local name with an explicit type, AXM shall retrieve metadata for the Registry identity configured for that name and type.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/view/command.ts`, `packages/cli/src/root/view/handler.ts`
- Open questions: Without --type, the current local-name fallback searches only skills and subagents. Whether bare-name lookup should search every non-container type is undecided; this requirement covers the explicit public type selector.
- Source: [`specifications/cli/view/explicit-type-selects-the-local-identity.spec.ts`](../specifications/cli/view/explicit-type-selects-the-local-identity.spec.ts)

##### View offers the extension type’s install command

- Requirement: `cli/view/offers-the-type-install-command`
- Statement: When viewing an installable extension, AXM shall offer an install command registered by that extension’s CLI command group.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/view/handler.internal.test.ts`, `packages/cli/src/root/shared/per-type-install.ts`
- Source: [`specifications/cli/view/offers-the-type-install-command.spec.ts`](../specifications/cli/view/offers-the-type-install-command.spec.ts)

##### Public metadata can be viewed without management access

- Requirement: `cli/view/public-metadata-requires-no-management-access`
- Statement: When viewing public extension metadata through the default Registry, AXM shall complete the read without a workspace, credentials, or a protected visibility-management request.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/view/handler.internal.test.ts`, `packages/cli/src/root/view/handler.ts`
- Source: [`specifications/cli/view/public-metadata-requires-no-management-access.spec.ts`](../specifications/cli/view/public-metadata-requires-no-management-access.spec.ts)

##### View retrieves metadata from the selected Registry

- Requirement: `cli/view/reads-the-selected-registry`
- Statement: When viewing an extension, AXM shall retrieve its metadata from the explicitly named Registry or the configured default Registry when no name is supplied.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/view/handler.internal.test.ts`, `packages/cli/src/root/view/handler.ts`
- Source: [`specifications/cli/view/reads-the-selected-registry.spec.ts`](../specifications/cli/view/reads-the-selected-registry.spec.ts)

##### View reports deprecation and replacement availability

- Requirement: `cli/view/reports-deprecation-and-replacement-availability`
- Statement: When viewing a deprecated extension, AXM shall report its deprecation guidance while identifying an unavailable replacement without inventing a replacement identity.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/view/handler.internal.test.ts`, `packages/cli/src/root/view/handler.ts`
- Source: [`specifications/cli/view/reports-deprecation-and-replacement-availability.spec.ts`](../specifications/cli/view/reports-deprecation-and-replacement-availability.spec.ts)

##### View reports missing metadata without a success result

- Requirement: `cli/view/reports-missing-targets-and-fields`
- Statement: When an extension or requested metadata field is unavailable, AXM shall report the missing target or field without emitting a successful metadata result.
- Class: functional
- Role: experience
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/view/handler.internal.test.ts`, `packages/cli/src/root/view/handler.ts`
- Source: [`specifications/cli/view/reports-missing-targets-and-fields.spec.ts`](../specifications/cli/view/reports-missing-targets-and-fields.spec.ts)

#### Visibility

##### Visibility reconciliation applies declared repository intent conditionally

- Requirement: `cli/visibility/reconcile/applies-declared-repository-intent`
- Statement: The visibility reconcile command shall require project-scoped manifest or workspace visibility intent and established Registry visibility, submit the effective intent with its source fingerprint as repository authority conditional on the observed revision, and report only the acknowledged transition.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/visibility/handler.ts`, `AgentXM Registry API 0.1.0`
- Source: [`specifications/cli/visibility/reconcile/applies-declared-repository-intent.spec.ts`](../specifications/cli/visibility/reconcile/applies-declared-repository-intent.spec.ts)

##### Explicit visibility changes carry operator intent and the observed revision

- Requirement: `cli/visibility/set/uses-explicit-intent-and-observed-revision`
- Statement: The visibility set command shall require established Registry visibility, submit the requested value as operator intent conditional on the observed revision, and report the acknowledged change without silently replacing a rejected precondition.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/visibility/handler.ts`, `AgentXM Registry API 0.1.0`
- Source: [`specifications/cli/visibility/set/uses-explicit-intent-and-observed-revision.spec.ts`](../specifications/cli/visibility/set/uses-explicit-intent-and-observed-revision.spec.ts)

#### Whoami

##### Identity inspection recovers an expired stored session

- Requirement: `cli/whoami/refreshes-rejected-stored-credentials`
- Statement: When the Registry rejects identity credentials with HTTP 401, whoami shall recover a stored session by refreshing and persisting its replacement credentials and retrying once, report authentication required when rejection remains, and leave ambient credentials and other failures without refresh retries.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/whoami/refreshes-rejected-stored-credentials.spec.ts`](../specifications/cli/whoami/refreshes-rejected-stored-credentials.spec.ts)

##### Identity inspection reports safe effective authority

- Requirement: `cli/whoami/reports-safe-effective-identity`
- Statement: When authenticated, whoami shall report the handle, Registry, credential type, effective scopes, enforced extension restrictions, and source-backed or unavailable expiry from the canonical Registry identity operation in human and machine output, excluding email, credential identifiers, token material, and internal permission markers.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Source: [`specifications/cli/whoami/reports-safe-effective-identity.spec.ts`](../specifications/cli/whoami/reports-safe-effective-identity.spec.ts)

#### Withheld Releases Name Recovery From The Emitting Command

##### A withheld release names recovery from the command that withheld it

- Requirement: `cli/withheld-releases-name-recovery-from-the-emitting-command`
- Statement: When a command withholds or refuses a release under the minimum release age, its diagnostic shall name the recovery routes reachable from that command, including the override flag that command accepts and the declared-exemption route, and shall not name a command the operator did not run.
- Class: functional
- Role: experience
- Product goals: `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/withheld-releases-name-recovery-from-the-emitting-command.spec.ts`](../specifications/cli/withheld-releases-name-recovery-from-the-emitting-command.spec.ts)

#### Yank

##### Yank submits the explicit version selection and publisher guidance

- Requirement: `cli/yank/submits-the-requested-version-selection`
- Statement: The yank command shall require an exact version unless all available versions are explicitly selected, submit only that selection with the supplied category and notice, and report the acknowledged selection without claiming that future versions were yanked.
- Class: functional
- Role: experience
- Product goals: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/lifecycle/command.ts`, `packages/cli/src/root/lifecycle/command.internal.test.ts`
- Source: [`specifications/cli/yank/submits-the-requested-version-selection.spec.ts`](../specifications/cli/yank/submits-the-requested-version-selection.spec.ts)

### Source resolution

#### Minimum Release Age Withholds Unaged Releases

##### Resolution withholds a release that has not aged, unless it is exempt

- Requirement: `source-resolution/minimum-release-age-withholds-unaged-releases`
- Statement: When a resolution selects a release without an explicit version request, the resolution shall withhold a candidate that has not reached the configured minimum release age unless that candidate's identity matches a declared exemption, and every withheld and every exempted candidate shall be reported with its eligibility time and, when exempted, its exemption cause and scope.
- Class: functional
- Role: experience
- Product goals: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/source-resolution/minimum-release-age-withholds-unaged-releases.spec.ts`](../specifications/source-resolution/minimum-release-age-withholds-unaged-releases.spec.ts)

### System

#### Installability

##### Native installers explain how to invoke the installed executable

- Requirement: `system/installability/native-installers-explain-shell-access`
- Statement: When PATH does not select the newly installed AXM executable, the native installer shall print commands appropriate to its shell for adding the resolved installation directory to PATH and verifying that executable through its absolute path.
- Class: human-factors
- Role: experience
- Product goals: `platform-reach`
- Boundary: process; selection: per-change
- Boundary rationale: The primary examples execute the actual shell installer and then execute its printed commands against a version-answering fixture; bound installed evidence exercises the commands with real AXM on each supported installer shell.
- Methods: example
- Derived from: `install.md`, `packages/cli/site-content/docs/quickstart.md`, `packages/cli-e2e/src/install-verification.e2e.test.ts`
- Open questions: Must native installers preserve existing shell profile files and persistent user PATH, leaving those edits to explicit user action? The current profile-preservation witness does not itself establish that obligation.
- Limitation: Primary examples exercise POSIX shell commands with a version-answering fixture, not AXM functionality. PowerShell and cmd command behavior remains in the existing real Windows installed-product matrix. Retires when: Retain successful installed-boundary execution of the printed commands against real AXM for every supported shell.
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
- Source: [`specifications/system/installability/native-installers-explain-shell-access.spec.ts`](../specifications/system/installability/native-installers-explain-shell-access.spec.ts)

##### AXM installs through its supported channels with integrity verification

- Requirement: `system/installability/product-installs-through-supported-channels`
- Statement: AXM shall install through its supported bash, PowerShell, and cmd installers, each verifying artifact integrity by checksum.
- Class: quality (installability)
- Role: experience
- Product goals: `platform-reach`, `trustworthy-distribution`
- Boundary: process; selection: per-change
- Boundary rationale: Primary examples execute the actual shell installer with matching and mismatching download bytes. Bound installed-product evidence executes every supported installer shell with real AXM, including checksum rejection on Windows.
- Methods: example
- Open questions: Must a direct native installer preserve an existing working executable when download verification fails? Existing process observations support that behavior, but this installation requirement only states installation with checksum verification; cli/upgrade/verifies-download-before-replacement separately owns the CLI upgrade promise.
- Limitation: Primary examples use a version-answering fixture on macOS/Linux, proving installer acceptance and refusal without claiming AXM functionality. Real AXM startup and PowerShell/cmd behavior require the complementary installed-product matrix. Retires when: Retain successful real AXM installation and checksum rejection evidence for every supported installer shell and platform.
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
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

#### Cache

##### Cache status reports archive usage and effective limits

- Requirement: `cli/cache/status/reports-usage-and-effective-limits`
- Statement: The cache status command shall report the number and total bytes of cached archives together with the effective size and age limits in its machine result.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/src/root/cache/command.ts`, `packages/cli/src/root/cache/command.internal.test.ts`
- Open questions: Is the current 90-day age limit a product commitment or an implementation default that may change?
- Source: [`specifications/cli/cache/status/reports-usage-and-effective-limits.spec.ts`](../specifications/cli/cache/status/reports-usage-and-effective-limits.spec.ts)

#### Exit Codes Match Published Reference

##### The published exit-code reference matches the runtime exit codes

- Requirement: `cli/exit-codes-match-published-reference`
- Statement: The served exit-codes help topic shall list exactly the exit codes and meanings the command line returns at runtime, with no missing, extra, or differing rows, and an invocation the parser rejects or an apply stopped as approval required shall exit with the code whose published meaning names that outcome.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model, example
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

#### Knowledge

##### Query and search accept the published result limits

- Requirement: `cli/knowledge/concepts/enforces-published-result-limits`
- Statement: When a Knowledge query or search selects a result limit, AXM shall accept only whole-number limits from 1 through 100 and return no more than that many concepts on a page.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: The built command parser establishes whole-number input rejection; production handlers over an inspected corpus establish advertised range validation and page size.
- Methods: decision-table, example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/cli/src/root/knowledge/concepts/query.ts`, `packages/cli/src/root/knowledge/concepts/search.ts`
- Source: [`specifications/cli/knowledge/concepts/enforces-published-result-limits.spec.ts`](../specifications/cli/knowledge/concepts/enforces-published-result-limits.spec.ts)

##### Get preserves source content and revision identity

- Requirement: `cli/knowledge/concepts/get/returns-source-backed-document`
- Statement: When retrieving an installed Knowledge concept, AXM shall return its complete frontmatter and body with source-backed bundle, content, and projection revision identity, including the exact source document when raw output is requested.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/help/topics/knowledge.md`, `packages/cli-e2e/src/knowledge.e2e.test.ts`, `packages/knowledge-query/src/knowledge-index.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/get/returns-source-backed-document.spec.ts`](../specifications/cli/knowledge/concepts/get/returns-source-backed-document.spec.ts)

##### Query passage bounds follow the published discovery limits

- Requirement: `cli/knowledge/concepts/query/enforces-published-query-bounds`
- Statement: When a Knowledge query selects passage bounds, AXM shall accept only whole-number passage limits from 0 through 10 and passage lengths from 1 through 2000.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/knowledge-query/src/knowledge-capabilities.ts`, `packages/cli/help/topics/knowledge.md`
- Source: [`specifications/cli/knowledge/concepts/query/enforces-published-query-bounds.spec.ts`](../specifications/cli/knowledge/concepts/query/enforces-published-query-bounds.spec.ts)

##### Related traversal validates its depth limit

- Requirement: `cli/knowledge/concepts/related/enforces-published-depth-bounds`
- Statement: When a caller selects a Knowledge relationship traversal depth, AXM shall accept only whole-number depths from one through three.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/knowledge-query/src/knowledge-capabilities.ts`, `packages/cli/src/root/knowledge/concepts/related.ts`
- Source: [`specifications/cli/knowledge/concepts/related/enforces-published-depth-bounds.spec.ts`](../specifications/cli/knowledge/concepts/related/enforces-published-depth-bounds.spec.ts)

##### Discovery status describes the supported query contract

- Requirement: `cli/knowledge/concepts/status/publishes-discovery-capabilities`
- Statement: When reporting Knowledge discovery capabilities, AXM shall identify its query grammar, supported operations and fields, output contract, cursor validity, and output limits consistently with the discovery commands.
- Class: functional
- Role: interface
- Product goals: `knowledge-access`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/knowledge-query/src/knowledge-capabilities.ts`, `packages/cli/help/topics/knowledge.md`
- Additional evidence: process via [`packages/cli-e2e/src/knowledge.e2e.test.ts`](../packages/cli-e2e/src/knowledge.e2e.test.ts) — Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.
- Source: [`specifications/cli/knowledge/concepts/status/publishes-discovery-capabilities.spec.ts`](../specifications/cli/knowledge/concepts/status/publishes-discovery-capabilities.spec.ts)

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

#### Long Running Operations Emit Lifecycle Events

##### A plan-family operation publishes its lifecycle as typed events

- Requirement: `cli/long-running-operations-emit-lifecycle-events`
- Statement: A plan-family operation shall publish an operation-started event, a phase-started event for each phase it enters, a unit-started and a unit-resolved event for every unit it attempts, and exactly one settled event whose outcome equals the outcome of its result document.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `cli/machine-progress-events-follow-the-lifecycle-schema`
- Assumptions: Source resolution, lockfile reconciliation, and the plan's units are the only units a local install attempts, so units that do not appear in the result document belong to the resolution or planning phase.
- Source: [`specifications/cli/long-running-operations-emit-lifecycle-events.spec.ts`](../specifications/cli/long-running-operations-emit-lifecycle-events.spec.ts)

#### Machine Errors Use The Stable Envelope

##### A failed machine invocation still emits the stable error envelope

- Requirement: `cli/machine-errors-use-the-stable-envelope`
- Statement: When a machine-output invocation fails, it shall exit non-zero and write exactly one schema-valid error document to standard output that carries any structured problem the failure names, keeping every diagnostic line on standard error as a structured event; when it stops as approval required, it shall write exactly one schema-valid result document that names the block and its recovery.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Derived from: `cli/lockfile-version-errors-expose-structured-problem`
- Additional evidence: process via [`packages/cli-e2e/src/smoke.e2e.test.ts`](../packages/cli-e2e/src/smoke.e2e.test.ts) — Observes the shipped process streams under --json: exactly one stdout document per invocation, NDJSON diagnostics on stderr, and the redacted error envelope for failing and defect invocations — channel separation the in-memory renderer capture cannot prove.
- Additional evidence: process via [`packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts`](../packages/cli-e2e/src/workspace-lockfile-rejections.e2e.test.ts) — Proves the shipped command wiring emits exit 9 and one structured error document, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, and uses the shared schema diagnosis for a Knowledge command.
- Source: [`specifications/cli/machine-errors-use-the-stable-envelope.spec.ts`](../specifications/cli/machine-errors-use-the-stable-envelope.spec.ts)

#### Machine Mode Never Prompts

##### Machine output mode terminates deterministically instead of prompting

- Requirement: `cli/machine-mode-never-prompts`
- Statement: When machine output mode is on, a command that needs interactive input or interactive approval shall terminate with a usage failure naming what it needs, shall raise no prompt even from an interactive terminal, and shall change no workspace state, while the same request with machine output off shall prompt and honor the answer.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Limitation: The skill-selection prompt has no in-memory interaction port, so the evidence that the same request prompts and honors the answer when machine output is off is carried by the setup command only. Retires when: An in-memory interaction port for the skill-selection prompt lets the harness record that prompt and its answer for install.
- Source: [`specifications/cli/machine-mode-never-prompts.spec.ts`](../specifications/cli/machine-mode-never-prompts.spec.ts)

#### Machine Progress Events Follow The Lifecycle Schema

##### Machine progress events are the published lifecycle events, in order, before the result

- Requirement: `cli/machine-progress-events-follow-the-lifecycle-schema`
- Statement: When machine output mode is on and progress is enabled, every progress event written to standard error shall decode as one lifecycle event of the published schema whose sequence number strictly increases within its operation, and the operation shall write exactly one settled event before its result document.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Derived from: `cli/machine-errors-use-the-stable-envelope`
- Source: [`specifications/cli/machine-progress-events-follow-the-lifecycle-schema.spec.ts`](../specifications/cli/machine-progress-events-follow-the-lifecycle-schema.spec.ts)

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

#### Non Tty Output Is Plain And Unpadded

##### A stream that is not a terminal receives plain, unbounded human output

- Requirement: `cli/non-tty-output-is-plain-and-unpadded`
- Statement: When a standard stream receiving human output is not a terminal, AXM shall write no ANSI escape sequence to it and shall not wrap, truncate, or pad any line to a terminal width.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/non-tty-output-is-plain-and-unpadded.spec.ts`](../specifications/cli/non-tty-output-is-plain-and-unpadded.spec.ts)

#### Preview Uses The Canonical Flag

##### Assessment is spelled --preview everywhere it exists and nowhere else

- Requirement: `cli/preview-uses-the-canonical-flag`
- Statement: Every command that assesses its change without applying it shall accept --preview and no alternative spelling, every command without an assessment shall reject --preview, and rendered help shall list --preview and --yes on exactly the commands whose capabilities declare them.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Derived from: `cli/command-help-is-complete`
- Source: [`specifications/cli/preview-uses-the-canonical-flag.spec.ts`](../specifications/cli/preview-uses-the-canonical-flag.spec.ts)

#### Publish

##### The publication archive matches its complete reported inventory

- Requirement: `cli/publish/archive-inventory-matches-published-bytes`
- Statement: Publish shall include every regular package-root file unless explicitly ignored and report the effective included and excluded paths, byte sizes, matching patterns, pattern counts and warnings, total source and ZIP bytes, and SRI SHA-512 integrity that describe the archive it publishes.
- Class: functional
- Role: interface
- Product goals: `trustworthy-distribution`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `packages/cli/help/topics/publish.md`, `packages/cli/src/root/publish/command.internal.test.ts`
- Source: [`specifications/cli/publish/archive-inventory-matches-published-bytes.spec.ts`](../specifications/cli/publish/archive-inventory-matches-published-bytes.spec.ts)

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
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`specifications/cli/publish/outcomes-report-source-state.spec.ts`](../specifications/cli/publish/outcomes-report-source-state.spec.ts)

##### Publication uploads are bound to the reviewed source and visibility

- Requirement: `cli/publish/uploads-the-reviewed-publication-set`
- Statement: For a remotely authorized publication, AXM shall bind each actual archive upload to its reviewed publication-set-v2 candidate using the granted capability, condition, publication-set digest, descriptor digest, and resolved visibility, and report the Registry's acknowledged outcome.
- Class: external-conformance
- Role: interface
- Product goals: `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, contract
- Derived from: `AgentXM Registry API 0.1.0`, `packages/cli/src/root/publish/command.internal.test.ts`
- Open questions: If local source changes after publication review, must AXM abort and revoke unused grants, or may it upload the frozen reviewed archive? The current implementation aborts; the accepted requirement binds actual upload bytes to the reviewed set without choosing an enforcement strategy.
- Source: [`specifications/cli/publish/uploads-the-reviewed-publication-set.spec.ts`](../specifications/cli/publish/uploads-the-reviewed-publication-set.spec.ts)

#### Quiet Preserves Machine Diagnostics

##### Quiet machine output preserves results and diagnostics

- Requirement: `cli/quiet-preserves-machine-diagnostics`
- Statement: When quiet mode is used with machine output, AXM shall suppress progress events while preserving result documents and non-progress diagnostic events.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: Built CLI invocations establish both quiet flag spellings and actual result/error streams; application examples exercise non-progress diagnostics on the production machine screen.
- Methods: decision-table, example
- Derived from: `cli/machine-progress-events-follow-the-lifecycle-schema`, `packages/cli/help/topics/machine-output.md`, `packages/cli/src/screen/screen-machine.internal.test.ts`
- Source: [`specifications/cli/quiet-preserves-machine-diagnostics.spec.ts`](../specifications/cli/quiet-preserves-machine-diagnostics.spec.ts)

#### Sync

##### A sync check reports whether reconciliation is needed

- Requirement: `cli/sync/check-reports-convergence`
- Statement: When sync --preview --fail-on-change can assess workspace reconciliation, AXM shall return exit status 0 with a no-op result when no reconciliation is needed and exit status 1 with divergence and the complete preview plan when changes are needed.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: process; selection: per-change
- Boundary rationale: Separate invocations of the built CLI expose the exit status and machine result consumed by automation, including the distinction between an ordinary preview and a convergence check against the same persisted workspace.
- Methods: example
- Derived from: `cli/sync/preview-is-pure`, `packages/cli/src/root/sync/handler.internal.test.ts`, `packages/cli/help/topics/workspace-state.md`
- Source: [`specifications/cli/sync/check-reports-convergence.spec.ts`](../specifications/cli/sync/check-reports-convergence.spec.ts)

##### Sync reports aggregate projection drift at ownership-unit precision

- Requirement: `cli/sync/reports-aggregate-projection-drift-at-unit-precision`
- Statement: When an aggregate projection like an instruction file's rules or knowledge region drifts, a sync preview shall report it as stale or missing at the owning managed unit and region, and shall not attribute the cause to any individual contributing extension.
- Class: functional
- Role: interface
- Product goals: `actionable-diagnostics`, `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract, example
- Source: [`specifications/cli/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts`](../specifications/cli/sync/reports-aggregate-projection-drift-at-unit-precision.spec.ts)

#### Token

##### Token output exposes the effective credential on request

- Requirement: `cli/token/returns-effective-token`
- Statement: When a credential is available, axm token shall return that credential alone as text by default or as a structured token value when JSON output is requested.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/auth/token.internal.test.ts`
- Additional evidence: process via [`packages/cli-e2e/src/auth.e2e.test.ts`](../packages/cli-e2e/src/auth.e2e.test.ts) — This Vitest entrypoint executes the imported cli-commands/auth/token/token.e2e.ts scenarios through real CLI processes. They observe raw/JSON token stdout and HTTP verification followed by token creation. Imported source bytes remain part of the repository execution inputs; this binding attributes evidence to the selected entrypoint, not to an import alone.
- Source: [`specifications/cli/token/returns-effective-token.spec.ts`](../specifications/cli/token/returns-effective-token.spec.ts)

#### Type Lists Report Local State

##### Type inventories report local extension state

- Requirement: `cli/type-lists-report-local-state`
- Statement: When listing skills, subagents, rules, hooks, or packs, AXM shall report the selected type’s current local entries with their management classification, installation state, and source observation.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/skills/list.internal.test.ts`, `packages/cli/src/root/subagents/list/handler.internal.test.ts`, `packages/cli/src/root/packs/list.internal.test.ts`, `packages/cli/src/root/hooks/list.ts`, `packages/cli/src/root/rules/list.ts`
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs real skills update and publish commands, proving local-source advancement plus Git HEAD source review, explicit warning acceptance, process exit codes, machine output, and Registry effects; its imported cli-commands/skills/list/command.e2e.ts scenarios additionally observe inventory before setup, user-scope discovery, malformed settings and lockfiles, and install/uninstall/read journeys. Execution is attributed to this Vitest entrypoint, with imported source bytes included in the repository execution inputs.
- Source: [`specifications/cli/type-lists-report-local-state.spec.ts`](../specifications/cli/type-lists-report-local-state.spec.ts)

#### Type Shows Report Source And Version

##### Type inspection distinguishes source and observed version

- Requirement: `cli/type-shows-report-source-and-version`
- Statement: When emitting machine output from skills show, mcps show, subagents show, rules show, hooks show, or knowledge show for a configured extension, AXM shall report its local identity, activation, source, and version from the accepted resolution or the matching authored manifest when no resolution exists.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/shared/extension-show.internal.test.ts`, `packages/cli/src/root/shared/extension-show.ts`
- Source: [`specifications/cli/type-shows-report-source-and-version.spec.ts`](../specifications/cli/type-shows-report-source-and-version.spec.ts)

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

#### Upgrade

##### Machine upgrade emits one complete assessment

- Requirement: `cli/upgrade/machine-result-is-upgrade-assessment`
- Statement: When upgrade reports an assessment in machine mode, AXM shall emit exactly one axm.upgrade-assessment/v1 result that separately records intent, platform, ownership, canonical selection, installer availability, target, mutation, verification, recovery, command evidence, and disposition.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Source: [`specifications/cli/upgrade/machine-result-is-upgrade-assessment.spec.ts`](../specifications/cli/upgrade/machine-result-is-upgrade-assessment.spec.ts)

#### Version

##### Machine version output identifies the manifest and before and after versions

- Requirement: `cli/version/machine-result-identifies-manifest-change`
- Statement: When a version change runs in machine mode, AXM shall emit one plan-result document identifying the selected extension, manifest path, previous and resulting versions, and whether a change was applied or unnecessary.
- Class: functional
- Role: interface
- Product goals: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Derived from: `packages/cli/src/root/shared/version-command.internal.test.ts`
- Source: [`specifications/cli/version/machine-result-identifies-manifest-change.spec.ts`](../specifications/cli/version/machine-result-identifies-manifest-change.spec.ts)

#### Version Output Identifies Running Release

##### Version output identifies the running release

- Requirement: `cli/version-output-identifies-running-release`
- Statement: When the version flag is requested, AXM shall report the running CLI release version, using a structured version document when machine output is selected.
- Class: functional
- Role: interface
- Product goals: `machine-automation`, `actionable-diagnostics`
- Boundary: process; selection: per-change
- Boundary rationale: The built CLI process must report its package release identity through the actual global formatter in both human and machine modes.
- Methods: contract, example
- Derived from: `packages/cli/help/topics/machine-output.md`, `packages/cli-e2e/src/smoke.e2e.test.ts`, `packages/cli-e2e/src/binary-smoke.e2e.test.ts`
- Limitation: These examples exercise the built Node entrypoint. Compiled and externally installed release identities require evidence for those exact artifacts. Retires when: Bind exact version readback to identified compiled and installed release artifacts.
- Source: [`specifications/cli/version-output-identifies-running-release.spec.ts`](../specifications/cli/version-output-identifies-running-release.spec.ts)

#### View

##### View can return one selected metadata field

- Requirement: `cli/view/returns-the-selected-field`
- Statement: When a caller selects a supported extension metadata field, AXM shall return that field alone in its machine result.
- Class: functional
- Role: interface
- Product goals: `extension-adoption`, `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Derived from: `packages/cli/src/root/view/handler.internal.test.ts`, `packages/cli/src/root/view/handler.ts`
- Source: [`specifications/cli/view/returns-the-selected-field.spec.ts`](../specifications/cli/view/returns-the-selected-field.spec.ts)

#### Visibility

##### Visibility status supplies repository intent and reports the Registry evaluation

- Requirement: `cli/visibility/status/reports-repository-intent-and-registry-evaluation`
- Statement: For a project-scoped visibility status request, AXM shall submit the manifest visibility intent when present, otherwise the workspace default when present, otherwise no intent, and report the selected extension's Registry evaluation through the AgentXM Registry API 0.1.0 contract.
- Class: functional
- Role: interface
- Product goals: `workspace-intent-fidelity`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Derived from: `packages/cli/src/root/visibility/handler.ts`, `packages/registry-protocol/src/unstable/publish/visibility.ts`
- Source: [`specifications/cli/visibility/status/reports-repository-intent-and-registry-evaluation.spec.ts`](../specifications/cli/visibility/status/reports-repository-intent-and-registry-evaluation.spec.ts)

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

#### Installability

##### Native installers use the selected destination directory

- Requirement: `system/installability/native-installers-use-selected-directory`
- Statement: When AXM_INSTALL_DIR selects an absolute directory, AXM's bash, PowerShell, and cmd installers shall install the executable in that directory.
- Class: functional
- Role: interface
- Product goals: `platform-reach`
- Boundary: process; selection: per-change
- Boundary rationale: The primary example executes the actual shell installer against a local download fixture and observes the installed bytes; the existing installed-product suite binds real AXM execution for every supported installer shell.
- Methods: example
- Derived from: `packages/cli/help/topics/environment.md`, `packages/cli-e2e/src/install-verification.e2e.test.ts`
- Limitation: The primary macOS/Linux example installs a version-answering fixture and does not establish AXM startup or Windows installer behavior. Those observations remain in the bound real-binary installed suite and its Windows shell matrix. Retires when: Retain successful real AXM installation evidence for the selected directory on every supported installer shell and platform.
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
- Source: [`specifications/system/installability/native-installers-use-selected-directory.spec.ts`](../specifications/system/installability/native-installers-use-selected-directory.spec.ts)

#### Security

##### Telemetry excludes extension content and secrets

- Requirement: `system/security/telemetry-payloads-respect-data-boundary`
- Statement: Every telemetry event and error report AXM sends shall conform to AgentXM Telemetry Ingest API 0.1.0 and contain only identity, timing, and command-observation data, excluding extension content, authored instructions and knowledge, credentials, and resolved secret values.
- Class: quality (privacy)
- Role: interface
- Product goals: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: contract, example
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
- Open questions: When a required secret cannot be persisted in the system keychain, must installation fail, or may it complete with a warning and require the secret to be supplied later? The current statement promises storage; the controlled unavailable-keychain case establishes disclosure safety, not satisfaction of storage.
- Limitation: Default scenarios control the native keyring Entry boundary. The separately selected platform execution exercises the actual keychain only on its recorded host and access context; other operating systems and access policies remain unverified. Retires when: Run the same credential lifecycle against disposable keychain entries on each supported operating system.
- Additional evidence: platform via [`packages/cli-e2e/src/mcp-secrets.keychain.e2e.test.ts`](../packages/cli-e2e/src/mcp-secrets.keychain.e2e.test.ts) — Runs the built CLI's real MCP install, stored-input reload and secret replacement in its declared Node runtime against the host OS keychain, preserving host HOME for native access while isolating AXM_USER_HOME and project state. A subprocess uses the shipped CLI harness artifact only to derive disposable cleanup identities, without a product source dependency in the test project. Producer and observer use the same runtime application identity across separate processes. Workspace/local/source/input namespaces are isolated and read back natively; a finally block deletes exactly the known disposable entries, requires affirmative deletion for every attempted write, and retains an independent cleanup journal on failure. This establishes only the recorded host and access context, not cross-application access, unavailable-keychain policy or every supported operating system.
- Source: [`specifications/cli/mcps/secret-namespaces-include-local-and-source-identity.spec.ts`](../specifications/cli/mcps/secret-namespaces-include-local-and-source-identity.spec.ts)

#### Upgrade

##### Upgrade establishes ownership before release selection

- Requirement: `cli/upgrade/ownership-precedes-release-selection`
- Statement: Upgrade shall identify the installation owner before performing canonical release selection so unresolved ownership fails without an unnecessary release-authority request and every later availability and mutation decision is installer-specific.
- Class: constraint
- Role: supporting
- Product goals: `trustworthy-distribution`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/upgrade/ownership-precedes-release-selection.spec.ts`](../specifications/cli/upgrade/ownership-precedes-release-selection.spec.ts)

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

##### Every registered command declares interaction capabilities its flags and evidence agree with

- Requirement: `system/architecture/every-command-declares-interaction-capabilities`
- Statement: Every registered command node shall declare its interaction capabilities; the declared routes shall be exactly the accepted allocation, each declaration shall agree with its allocation row and with the flags its rendered help lists, every assessment route shall own a preview-purity specification, and every advance-approval route shall have a purpose fixture in the confirmation-flag specification.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Only the registered command tree, the accepted allocation table, the rendered help, and the specification files on disk, compared together, can show that every route's declaration, grammar, and evidence correspond.
- Methods: contract, static
- Derived from: `system/architecture/specification-folders-mirror-command-tree`, `cli/confirmation-flags-have-a-supported-purpose`, `cli/preview-uses-the-canonical-flag`
- Source: [`specifications/system/architecture/every-command-declares-interaction-capabilities.spec.ts`](../specifications/system/architecture/every-command-declares-interaction-capabilities.spec.ts)

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
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout on the selected installer shell, proving checksum-specific rejection, custom destination placement, executable PATH and absolute-path guidance, and a working installed product on that shell. Profile and prior-binary preservation remain observations beyond the installation owner's current meaning.
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

##### Dependency installation defers the compiled CLI bin to package creation

- Requirement: `system/process/dependency-installation-defers-cli-bin`
- Statement: Workspace dependency installation shall not advertise the unbuilt CLI executable for bin linking, while release package creation shall expose axm at its compiled entry point.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Boundary rationale: The source and publication manifest fields establish when the executable is advertised; actual clean-install and packed-artifact checks provide additional release evidence.
- Methods: static
- Assumptions: The pinned pnpm package manager applies publishConfig.bin during packing.
- Source: [`specifications/system/process/dependency-installation-defers-cli-bin.spec.ts`](../specifications/system/process/dependency-installation-defers-cli-bin.spec.ts)

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

##### Evidence reports distinguish current execution from incomplete or absent verification

- Requirement: `system/process/evidence-reports-match-executed-inputs`
- Statement: When reporting requirement evidence, AXM's repository tools shall identify the executed source and built runtime inputs, observation boundary and selection, distinguishing current complete outcomes from stale, partial, missing, and unverified evidence.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The repository verdict is the review boundary for native test results and separately bound evidence.
- Methods: example
- Derived from: `scripts/specification-verdict-lib.ts`
- Assumptions: Installed dependencies match the committed lockfile; repository-wide input matching conservatively invalidates unrelated changes.
- Limitation: Recorded host context establishes only the actual test environment; this report does not infer unobserved platform, human review, external service, or static gate outcomes. Retires when: Each such boundary supplies separately attributable execution or assessment evidence.
- Source: [`specifications/system/process/evidence-reports-match-executed-inputs.spec.ts`](../specifications/system/process/evidence-reports-match-executed-inputs.spec.ts)

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

##### Release promotion checks public validators before conditional updates

- Requirement: `system/process/release-promotion-validates-public-validators`
- Statement: Before conditionally updating an existing stable channel, release promotion shall verify that public reads negotiating identity, gzip, Brotli, and Zstandard return the same strong ETag and untransformed document, and shall perform no mutation if any read fails or disagrees.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The committed promotion entry point owns this release gate; bound tooling tests drive its network boundary with controlled responses without publishing a release.
- Methods: contract
- Derived from: `system/process/release-promotion-precedes-independent-distribution`
- Assumptions: A concurrent channel change may invalidate the preflight and requires a new invocation.
- Bound evidence: `test: axm:test (scripts/release-channel-promotion.tooling.test.ts)` — Exercises identity, gzip, Brotli, and Zstandard public reads before the Control PUT, rejects weak or absent validators, transformation, inconsistent validators or documents, and failed reads without mutation, and preserves conditional creation and newer-channel retention.
- Source: [`specifications/system/process/release-promotion-validates-public-validators.spec.ts`](../specifications/system/process/release-promotion-validates-public-validators.spec.ts)

##### Release publication preserves newer distribution versions

- Requirement: `system/process/release-publication-preserves-newer-versions`
- Statement: The canonical release workflow shall serialize active release publications across tags and stop an older candidate as superseded when a newer npm latest, Homebrew formula or stable version is observed, without moving those publications backward or attempting historical distribution repair.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Canonical publication adapters and bound failure-injection tooling provide evidence without publishing a real release.
- Methods: contract
- Bound evidence: `test: axm:test (scripts/release-publication.tooling.test.ts, scripts/release-channel-promotion.tooling.test.ts, scripts/update-homebrew-formula.tooling.test.ts)` — Exercises older candidates before publication and at owner write boundaries, equal-version formula conflicts and newer-channel retention.
- Source: [`specifications/system/process/release-publication-preserves-newer-versions.spec.ts`](../specifications/system/process/release-publication-preserves-newer-versions.spec.ts)

##### Release reruns reuse only identical published content

- Requirement: `system/process/release-publication-reuses-identical-content`
- Statement: A rerun of one release coordinate shall verify and reuse identical published content, publish missing outputs and reject conflicting bytes or failed existence queries without overwriting published outputs or requiring a promotion bypass.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Canonical publication adapters and bound failure-injection tooling provide evidence without publishing a real release.
- Methods: contract
- Bound evidence: `test: axm:test (scripts/release-publication.tooling.test.ts, scripts/release-channel-promotion.tooling.test.ts, scripts/update-homebrew-formula.tooling.test.ts)` — Exercises absent and identical outputs, integrity conflicts, failed existence reads, partial publication reruns, and identical-coordinate promotion without credentials.
- Source: [`specifications/system/process/release-publication-reuses-identical-content.spec.ts`](../specifications/system/process/release-publication-reuses-identical-content.spec.ts)

##### Release results distinguish distribution and promotion state

- Requirement: `system/process/release-workflow-reports-publication-state`
- Statement: The canonical release workflow shall report the exact candidate and every publication and verification result separately from confirmed, incomplete or uncertain promotion and superseded candidates, retaining uncertain submission evidence until bounded readback confirms channel state.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: Canonical publication adapters and bound failure-injection tooling provide evidence without publishing a real release.
- Methods: contract
- Bound evidence: `test: axm:test (scripts/release-publication.tooling.test.ts, scripts/release-channel-promotion.tooling.test.ts, scripts/update-homebrew-formula.tooling.test.ts)` — Exercises publication boundary outcomes, one readback after a lost promotion response, uncertain readback failures, and no repeated conditional mutation.
- Source: [`specifications/system/process/release-workflow-reports-publication-state.spec.ts`](../specifications/system/process/release-workflow-reports-publication-state.spec.ts)

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

##### Requirement reports separate changed promises from evidence affected by implementation

- Requirement: `system/process/requirement-diffs-separate-evidence-impact`
- Statement: When reporting a change, AXM's repository tools shall distinguish added, removed, and revised requirement contracts from changed verification or implementation inputs, including affected evidence for requirements whose contracts remain unchanged.
- Class: process
- Role: supporting
- Product goals: `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The verdict compares the selected Git baseline to the working tree and presents the distinct review questions.
- Methods: example
- Derived from: `scripts/specification-verdict-lib.ts`
- Source: [`specifications/system/process/requirement-diffs-separate-evidence-impact.spec.ts`](../specifications/system/process/requirement-diffs-separate-evidence-impact.spec.ts)

##### Stable promotion follows verified candidate distribution

- Requirement: `system/process/stable-promotion-follows-verified-distribution`
- Statement: The canonical release workflow shall attempt stable promotion only after publication of the candidate binary/checksum assets, fixed npm cohort, Homebrew formula and official skill, and successful exact-candidate script, published-package, Homebrew and official-skill installation verification; promotion failures shall not prevent that preceding distribution.
- Class: process
- Role: supporting
- Product goals: `trustworthy-distribution`, `dependable-change-process`
- Boundary: repository; selection: per-change
- Boundary rationale: The canonical workflow graph defines required release readiness and exact-candidate job inputs.
- Methods: contract
- Derived from: `system/process/release-promotion-precedes-independent-distribution`
- Supersedes: `system/process/release-promotion-precedes-independent-distribution`
- Assumptions: The release coordinate is immutable and each required verifier reports truthful evidence about its named candidate.
- Limitation: Repository evidence checks the workflow graph; it does not execute the published installer platform matrix. Retires when: An authorized release supplies successful exact-candidate matrix results and promotion readback.
- Bound evidence: `test: specifications:test` — Parses actual job dependencies and required success conditions, exercises each failed/skipped/canceled gate, and checks exact candidate inputs and the declared installer matrix.
- Bound evidence: `test: axm:test (scripts/verify-installed-package.tooling.test.ts)` — Runs the published-package verifier through a package-manager launcher with sibling entrypoints from an unrelated directory, including paths with spaces, and rejects wrong installed versions and unexpected stderr; Windows CI executes the batch-launcher cases.
- Source: [`specifications/system/process/stable-promotion-follows-verified-distribution.spec.ts`](../specifications/system/process/stable-promotion-follows-verified-distribution.spec.ts)

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
