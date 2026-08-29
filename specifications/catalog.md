# AXM specification catalog

Generated from `specifications/` metadata by `scripts/specification-catalog.ts`.
Do not edit by hand: run `pnpm run generate` after a specification change.
This catalog lists every authoritative requirement whether or not its
implementation currently passes; execution evidence lives in test results,
never here.

## CLI

### Activation Follows Desired State

#### Activation commands change realized surfaces without touching content or resolutions

- Requirement: `cli/activation-follows-desired-state`
- Class: functional
- Intents: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../packages/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Source: [`specifications/cli/activation-follows-desired-state.spec.ts`](../specifications/cli/activation-follows-desired-state.spec.ts)
- Cases:
  - `cli/activation-follows-desired-state#suspension-changes-surfaces-only` — disabling a skill suspends its agent surfaces and preserves canonical content and the accepted resolution
  - `cli/activation-follows-desired-state#reactivation-restores-surfaces` — enabling the skill restores its agent surfaces exactly
  - `cli/activation-follows-desired-state#inline-round-trip` — disabling and enabling an inline MCP server changes only its agent projection

### Agents

#### Agent membership changes update the durable target set and its owned outputs together

- Requirement: `cli/agents/membership-changes-realize-affected-outputs`
- Class: functional
- Intents: `agent-interoperability`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/agent-membership.e2e.test.ts`](../packages/cli-e2e/src/agent-membership.e2e.test.ts) — Runs the built CLI end to end so agent membership preview, apply, and removal prove exit codes, JSON envelopes on stdout, and per-agent artifacts on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/agents/membership-changes-realize-affected-outputs.spec.ts`](../specifications/cli/agents/membership-changes-realize-affected-outputs.spec.ts)
- Cases:
  - `cli/agents/membership-changes-realize-affected-outputs#add-realizes-installed-extensions` — adding an agent records it as a durable target and realizes installed extensions for it
  - `cli/agents/membership-changes-realize-affected-outputs#repeat-add-is-a-no-op` — adding an already-configured agent changes nothing and says so
  - `cli/agents/membership-changes-realize-affected-outputs#remove-removes-owned-outputs` — removing an agent removes it from the target set together with its managed outputs
  - `cli/agents/membership-changes-realize-affected-outputs#remove-preserves-unowned-content` — removing an agent preserves native content it cannot prove it owns

### Changes Do Not Interleave

#### Concurrent changes to one workspace never interleave

- Requirement: `cli/changes-do-not-interleave`
- Class: functional
- Intents: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/changes-do-not-interleave.spec.ts`](../specifications/cli/changes-do-not-interleave.spec.ts)

### Command Help Is Complete And Alias Free

#### Every supported command presents help and no alias routes exist

- Requirement: `cli/command-help-is-complete-and-alias-free`
- Class: functional
- Intents: `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/command-help-is-complete-and-alias-free.spec.ts`](../specifications/cli/command-help-is-complete-and-alias-free.spec.ts)
- Cases:
  - `cli/command-help-is-complete-and-alias-free#every-command-renders-help` — every registered command path renders usable command help
  - `cli/command-help-is-complete-and-alias-free#listed-commands-are-discoverable` — the rendered help walk reaches exactly the listed command tree
  - `cli/command-help-is-complete-and-alias-free#tree-is-alias-free` — no registered command carries an alias route before launch

### Every Type Completes The Shared Lifecycle

#### Every extension type completes the shared install and removal lifecycle

- Requirement: `cli/every-type-completes-the-shared-lifecycle`
- Class: functional
- Intents: `extension-adoption`, `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`](../packages/cli-e2e/src/activation-lifecycle.e2e.test.ts) — Drives every catalog extension type — including the mcp-server and pack types that cannot be sourced from a local package in memory — through authored creation, update, disable, enable, and uninstall in the real CLI process, proving preview purity, apply idempotency, native agent files, and lint-clean workspace state between every transition.
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/every-type-completes-the-shared-lifecycle.spec.ts`](../specifications/cli/every-type-completes-the-shared-lifecycle.spec.ts)

### Exit Codes Match Published Reference

#### The published exit-code reference matches the runtime exit codes

- Requirement: `cli/exit-codes-match-published-reference`
- Class: functional
- Intents: `machine-automation`, `knowledge-access`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/exit-codes-match-published-reference.spec.ts`](../specifications/cli/exit-codes-match-published-reference.spec.ts)

### Force Bypasses Only Named Policies

#### Force flags exist only for explicitly named forceable policies

- Requirement: `cli/force-bypasses-only-named-policies`
- Class: functional
- Intents: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract
- Source: [`specifications/cli/force-bypasses-only-named-policies.spec.ts`](../specifications/cli/force-bypasses-only-named-policies.spec.ts)

### Install

#### Install records direct workspace intent and realizes the extension

- Requirement: `cli/install/direct-intent-recorded-and-realized`
- Class: functional
- Intents: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/direct-intent-recorded-and-realized.spec.ts`](../specifications/cli/install/direct-intent-recorded-and-realized.spec.ts)
- Cases:
  - `cli/install/direct-intent-recorded-and-realized#records-configuration` — records the extension as directly desired workspace configuration
  - `cli/install/direct-intent-recorded-and-realized#records-resolution` — records the accepted resolution in the authoritative lockfile
  - `cli/install/direct-intent-recorded-and-realized#materializes-content` — materializes canonical extension content inside the workspace
  - `cli/install/direct-intent-recorded-and-realized#realizes-projections` — realizes the extension for every configured agent

#### Workspace install treats inline MCP configuration as sync-owned, not acquirable

- Requirement: `cli/install/inline-mcp-configuration-not-acquirable`
- Class: functional
- Intents: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/inline-mcp-configuration-not-acquirable.spec.ts`](../specifications/cli/install/inline-mcp-configuration-not-acquirable.spec.ts)

#### Machine install output is one complete schema-backed plan document

- Requirement: `cli/install/machine-result-is-schema-backed`
- Class: functional
- Intents: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Additional evidence: process via [`packages/cli-e2e/src/cli-commands/skills/install/output-ux.e2e.test.ts`](../packages/cli-e2e/src/cli-commands/skills/install/output-ux.e2e.test.ts) — Observes the real process stdout document and stderr diagnostics of the shipped CLI, which the in-memory renderer capture cannot prove.
- Source: [`specifications/cli/install/machine-result-is-schema-backed.spec.ts`](../specifications/cli/install/machine-result-is-schema-backed.spec.ts)

#### Install rejects a source it cannot install without changing the workspace

- Requirement: `cli/install/non-installable-sources-do-not-mutate`
- Class: functional
- Intents: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: property
- Source: [`specifications/cli/install/non-installable-sources-do-not-mutate.spec.ts`](../specifications/cli/install/non-installable-sources-do-not-mutate.spec.ts)

#### Install leaves unrelated configuration and unowned content untouched

- Requirement: `cli/install/preserves-unrelated-and-unowned-state`
- Class: functional
- Intents: `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts`](../specifications/cli/install/preserves-unrelated-and-unowned-state.spec.ts)

#### Install preview describes the plan without changing any state

- Requirement: `cli/install/preview-is-pure`
- Class: functional
- Intents: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/install/preview-is-pure.spec.ts`](../specifications/cli/install/preview-is-pure.spec.ts)

#### Installing an already desired extension at the same constraint is a successful no-op

- Requirement: `cli/install/reinstall-is-idempotent`
- Class: functional
- Intents: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/root-install.e2e.test.ts`](../packages/cli-e2e/src/root-install.e2e.test.ts) — Runs the real CLI process against the built artifact, proving argv parsing, registry acquisition, exit codes, and on-disk workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/install/reinstall-is-idempotent.spec.ts`](../specifications/cli/install/reinstall-is-idempotent.spec.ts)

#### Root install and the type command express the same durable intent

- Requirement: `cli/install/root-and-type-forms-express-same-intent`
- Class: functional
- Intents: `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: model
- Source: [`specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts`](../specifications/cli/install/root-and-type-forms-express-same-intent.spec.ts)

### Instructions

#### Instruction-file management is inspected, enabled, and disabled explicitly

- Requirement: `cli/instructions/management-is-explicit`
- Class: functional
- Intents: `workspace-intent-fidelity`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/instructions/management-is-explicit.spec.ts`](../specifications/cli/instructions/management-is-explicit.spec.ts)
- Cases:
  - `cli/instructions/management-is-explicit#status-reports-unconfigured` — reports the capability as not configured without changing state
  - `cli/instructions/management-is-explicit#enable-records-and-reconciles` — enabling records the explicit choice and reconciles aliases as one operation
  - `cli/instructions/management-is-explicit#status-reports-managed-targets` — reports the managed target for each configured agent
  - `cli/instructions/management-is-explicit#disable-removes-only-owned` — disabling removes only owned aliases and regions while preserving authored prose
  - `cli/instructions/management-is-explicit#repeat-disable-is-a-no-op` — disabling an already-disabled capability changes nothing and says so

### Lint

#### Lint findings identify the violated invariant and affected subject as facts

- Requirement: `cli/lint/findings-name-the-violated-invariant`
- Class: functional
- Intents: `actionable-diagnostics`, `machine-automation`
- Boundary: memory; selection: per-change
- Methods: contract
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/findings-name-the-violated-invariant.spec.ts`](../specifications/cli/lint/findings-name-the-violated-invariant.spec.ts)

#### Lint reports invariant violations without changing any workspace state

- Requirement: `cli/lint/reports-facts-without-mutation`
- Class: functional
- Intents: `actionable-diagnostics`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/lint.e2e.test.ts`](../packages/cli-e2e/src/lint.e2e.test.ts) — Runs the real lint process against built workspaces and Git repositories, proving exit codes, human and machine channel output, git-index views, and untouched on-disk and staged state that the in-memory entry cannot observe.
- Source: [`specifications/cli/lint/reports-facts-without-mutation.spec.ts`](../specifications/cli/lint/reports-facts-without-mutation.spec.ts)
- Cases:
  - `cli/lint/reports-facts-without-mutation#broken-workspace-reports-read-only` — a broken invariant is reported with a failing exit while every byte of workspace state survives
  - `cli/lint/reports-facts-without-mutation#valid-workspace-reports-clean` — a valid workspace reports clean and exits successfully

### Lock State Never Creates Reachability

#### A lockfile row alone never makes an extension desired or retained

- Requirement: `cli/lock-state-never-creates-reachability`
- Class: functional
- Intents: `workspace-intent-fidelity`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Source: [`specifications/cli/lock-state-never-creates-reachability.spec.ts`](../specifications/cli/lock-state-never-creates-reachability.spec.ts)

### Machine Errors Use The Stable Envelope

#### A failed machine invocation still emits the stable error envelope

- Requirement: `cli/machine-errors-use-the-stable-envelope`
- Class: functional
- Intents: `machine-automation`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: contract, decision-table
- Additional evidence: process via [`packages/cli-e2e/src/smoke.e2e.test.ts`](../packages/cli-e2e/src/smoke.e2e.test.ts) — Observes the shipped process streams under --json: exactly one stdout document per invocation, NDJSON diagnostics on stderr, and the redacted error envelope for failing and defect invocations — channel separation the in-memory renderer capture cannot prove.
- Source: [`specifications/cli/machine-errors-use-the-stable-envelope.spec.ts`](../specifications/cli/machine-errors-use-the-stable-envelope.spec.ts)

### Machine Mode Never Prompts

#### Machine output mode terminates deterministically instead of prompting

- Requirement: `cli/machine-mode-never-prompts`
- Class: functional
- Intents: `machine-automation`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/machine-mode-never-prompts.spec.ts`](../specifications/cli/machine-mode-never-prompts.spec.ts)
- Cases:
  - `cli/machine-mode-never-prompts#machine-mode-blocks-without-prompting` — a setup that needs interactive input reports approval required without raising any prompt
  - `cli/machine-mode-never-prompts#interactive-mode-prompts-for-the-same-request` — the same request prompts and honors the answer when machine output is off

### Mcps

#### Inline MCP entries stay authoritative workspace configuration realized only by sync

- Requirement: `cli/mcps/inline-authority-is-operation-coherent`
- Class: functional
- Intents: `workspace-intent-fidelity`, `agent-interoperability`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/cli/mcps/inline-authority-is-operation-coherent.spec.ts`](../specifications/cli/mcps/inline-authority-is-operation-coherent.spec.ts)
- Cases:
  - `cli/mcps/inline-authority-is-operation-coherent#round-trip-preserves-authored-form` — a settings change preserves the authored form of untouched inline entries
  - `cli/mcps/inline-authority-is-operation-coherent#sync-projects-supported-agents` — sync reconciles inline entries into agent configuration
  - `cli/mcps/inline-authority-is-operation-coherent#no-lock-row` — inline entries never gain a lock row
  - `cli/mcps/inline-authority-is-operation-coherent#disabled-not-projected` — a disabled inline entry is not projected into agent configuration

#### The inline MCP server lifecycle is explicit and safe to repeat

- Requirement: `cli/mcps/inline-lifecycle-is-idempotent`
- Class: functional
- Intents: `safe-repetition`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/command.e2e.test.ts`](../packages/cli-e2e/src/command.e2e.test.ts) — Runs the built CLI end to end so the inline MCP add/uninstall cycle proves argv parsing, exit codes, JSON envelopes on stdout, and native agent config files on disk that in-memory execution cannot observe.
- Source: [`specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts`](../specifications/cli/mcps/inline-lifecycle-is-idempotent.spec.ts)
- Cases:
  - `cli/mcps/inline-lifecycle-is-idempotent#add-records-configuration` — adding an inline server records authoritative configuration and projects it
  - `cli/mcps/inline-lifecycle-is-idempotent#repeat-add-is-already-configured` — repeating an identical add changes nothing and says so
  - `cli/mcps/inline-lifecycle-is-idempotent#uninstall-removes-owned-state` — uninstalling removes the configuration and its projections while preserving unowned entries
  - `cli/mcps/inline-lifecycle-is-idempotent#repeat-uninstall-is-a-no-op` — repeating the uninstall reports nothing left to do

### Mutations Are Closure Atomic

#### A failed workspace mutation leaves every authoritative state family unchanged

- Requirement: `cli/mutations-are-closure-atomic`
- Class: functional
- Intents: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/mutations-are-closure-atomic.spec.ts`](../specifications/cli/mutations-are-closure-atomic.spec.ts)

### Packs

#### Authored packs grow membership that stays reachable through the pack

- Requirement: `cli/packs/authored-packs-expand-membership`
- Class: functional
- Intents: `authoring-and-creation`, `workspace-intent-fidelity`, `extension-adoption`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/packs.e2e.test.ts`](../packages/cli-e2e/src/packs.e2e.test.ts) — Runs pack authoring, membership editing, publish, install, unpack, and uninstall through the real CLI process against a file Registry, proving argv parsing, confirmation flows, exit codes, and on-disk manifest and workspace state that in-memory execution cannot observe.
- Source: [`specifications/cli/packs/authored-packs-expand-membership.spec.ts`](../specifications/cli/packs/authored-packs-expand-membership.spec.ts)
- Cases:
  - `cli/packs/authored-packs-expand-membership#authors-the-pack` — creating a pack records workspace authorship with an empty dependency graph
  - `cli/packs/authored-packs-expand-membership#records-membership` — adding an installed extension records it as a pack dependency
  - `cli/packs/authored-packs-expand-membership#pack-route-sustains-member` — the member stays resolved and realized through the pack after its direct configuration is removed

### Publish

#### Publish preview evaluates the fixed publication gate and distributes nothing

- Requirement: `cli/publish/preview-is-pure-and-gate-is-fixed`
- Class: functional
- Intents: `trustworthy-distribution`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`specifications/cli/publish/preview-is-pure-and-gate-is-fixed.spec.ts`](../specifications/cli/publish/preview-is-pure-and-gate-is-fixed.spec.ts)
- Cases:
  - `cli/publish/preview-is-pure-and-gate-is-fixed#preview-is-pure` — a preview reports the admitted publication set without uploading or changing state

#### Publish refuses extensions the workspace does not author

- Requirement: `cli/publish/requires-established-authorship`
- Class: functional
- Intents: `trustworthy-distribution`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Source: [`specifications/cli/publish/requires-established-authorship.spec.ts`](../specifications/cli/publish/requires-established-authorship.spec.ts)
- Cases:
  - `cli/publish/requires-established-authorship#bulk-selection-excludes` — a bulk publish reports the installed extension as not authored instead of selecting it

### Settings Validity Gates Operations

#### Workspace operations begin only after both settings sources validate

- Requirement: `cli/settings-validity-gates-operations`
- Class: functional
- Intents: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, example
- Additional evidence: process via [`packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts`](../packages/cli-e2e/src/workspace-settings-validity.e2e.test.ts) — Proves at the real process boundary what the in-memory harness cannot: the shipped command wiring routes every sampled command family through the settings gate, machine stdout stays a valid document separated from stderr diagnostics, exit codes are nonzero, and version and help remain outside the gate.
- Source: [`specifications/cli/settings-validity-gates-operations.spec.ts`](../specifications/cli/settings-validity-gates-operations.spec.ts)

### Sync

#### Sync never changes configuration and never advances a satisfying resolution

- Requirement: `cli/sync/preserves-configuration-and-resolutions`
- Class: functional
- Intents: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts`](../specifications/cli/sync/preserves-configuration-and-resolutions.spec.ts)
- Cases:
  - `cli/sync/preserves-configuration-and-resolutions#no-op-after-install` — leaves a fully realized workspace byte-identical and reports no work
  - `cli/sync/preserves-configuration-and-resolutions#no-advance` — restores realized state from the accepted resolution instead of an available newer version
  - `cli/sync/preserves-configuration-and-resolutions#resolve-once` — resolves a desired extension without a resolution once, changing no configuration

#### Sync restores managed state until it agrees with desired state

- Requirement: `cli/sync/realizes-desired-state`
- Class: functional
- Intents: `safe-repetition`, `agent-interoperability`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/cli/sync/realizes-desired-state.spec.ts`](../specifications/cli/sync/realizes-desired-state.spec.ts)
- Cases:
  - `cli/sync/realizes-desired-state#restores-projection` — restores a deleted agent projection from canonical content
  - `cli/sync/realizes-desired-state#restores-canonical` — restores deleted canonical content from the exact accepted identity
  - `cli/sync/realizes-desired-state#converges` — reports an up-to-date workspace once managed state agrees with desired state

### Uninstall

#### Uninstalling an extension the workspace does not desire is a safe no-op

- Requirement: `cli/uninstall/is-idempotent`
- Class: functional
- Intents: `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: decision-table
- Additional evidence: process via [`packages/cli-e2e/src/root-uninstall.e2e.test.ts`](../packages/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/is-idempotent.spec.ts`](../specifications/cli/uninstall/is-idempotent.spec.ts)

#### Uninstall removes direct intent and keeps state another desired route still reaches

- Requirement: `cli/uninstall/removes-direct-route-and-recomputes-reachability`
- Class: functional
- Intents: `extension-adoption`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/root-uninstall.e2e.test.ts`](../packages/cli-e2e/src/root-uninstall.e2e.test.ts) — Runs the real CLI against a published file registry, proving root and type-specific uninstall parity across extension types and scopes, the machine result document, exit codes, and second-pass no-op state that in-memory execution cannot observe.
- Source: [`specifications/cli/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts`](../specifications/cli/uninstall/removes-direct-route-and-recomputes-reachability.spec.ts)
- Cases:
  - `cli/uninstall/removes-direct-route-and-recomputes-reachability#removes-direct-route` — removes the direct workspace configuration route and its resolution
  - `cli/uninstall/removes-direct-route-and-recomputes-reachability#removes-realized-state` — removes canonical content and agent projections nothing else desires
  - `cli/uninstall/removes-direct-route-and-recomputes-reachability#preserves-other-extensions` — preserves other desired extensions and their realized state
  - `cli/uninstall/removes-direct-route-and-recomputes-reachability#retains-pack-reached-state` — keeps the resolution, canonical content, and projection of a pack-reached extension

### Update

#### Update advances the accepted resolution within durable intent

- Requirement: `cli/update/advances-resolution-within-intent`
- Class: functional
- Intents: `extension-adoption`, `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Additional evidence: process via [`packages/cli-e2e/src/skills.e2e.test.ts`](../packages/cli-e2e/src/skills.e2e.test.ts) — Runs the real skills update command against a changed local source, proving the accepted content identity advances while configuration stays byte-identical, disabled entries are skipped, and preview applies nothing — local-source advancement the in-memory root update surface does not expose.
- Source: [`specifications/cli/update/advances-resolution-within-intent.spec.ts`](../specifications/cli/update/advances-resolution-within-intent.spec.ts)
- Cases:
  - `cli/update/advances-resolution-within-intent#advances-resolution` — advances the accepted resolution and realized content to a later published version
  - `cli/update/advances-resolution-within-intent#preserves-configuration` — changes no workspace configuration and no unrelated extension
  - `cli/update/advances-resolution-within-intent#repeat-is-noop` — repeating an update at the advanced resolution reports a no-op
  - `cli/update/advances-resolution-within-intent#blocks-before-lookup` — blocks an update of an extension the workspace does not desire

## Client core

### Extension Identity

#### A canonical extension name always parses back to the identity that produced it

- Requirement: `client-core/extension-identity/canonical-names-round-trip`
- Class: functional
- Intents: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`specifications/client-core/extension-identity/canonical-names-round-trip.spec.ts`](../specifications/client-core/extension-identity/canonical-names-round-trip.spec.ts)

#### A malformed extension name is rejected with a typed failure naming the input

- Requirement: `client-core/extension-identity/malformed-names-are-rejected`
- Class: functional
- Intents: `workspace-intent-fidelity`, `actionable-diagnostics`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Source: [`specifications/client-core/extension-identity/malformed-names-are-rejected.spec.ts`](../specifications/client-core/extension-identity/malformed-names-are-rejected.spec.ts)

### Package Identity

#### A companion package names an ecosystem package identity, never a pinned version

- Requirement: `client-core/package-identity/companion-packages-are-identities-not-pins`
- Class: functional
- Intents: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/client-core/package-identity/companion-packages-are-identities-not-pins.spec.ts`](../specifications/client-core/package-identity/companion-packages-are-identities-not-pins.spec.ts)

#### A companion compatibility range is a concrete ecosystem range matching its package identity

- Requirement: `client-core/package-identity/compatibility-ranges-match-the-package-ecosystem`
- Class: functional
- Intents: `authoring-and-creation`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: example, decision-table
- Source: [`specifications/client-core/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts`](../specifications/client-core/package-identity/compatibility-ranges-match-the-package-ecosystem.spec.ts)

### Settings Contract

#### The published settings and lockfile schemas describe what the product accepts

- Requirement: `client-core/settings-contract/published-schemas-agree-with-accepted-input`
- Class: functional
- Intents: `machine-automation`, `workspace-intent-fidelity`
- Boundary: memory; selection: per-change
- Methods: contract, example
- Source: [`specifications/client-core/settings-contract/published-schemas-agree-with-accepted-input.spec.ts`](../specifications/client-core/settings-contract/published-schemas-agree-with-accepted-input.spec.ts)

#### Saving settings preserves authored formatting, ordering, and unrecognized content

- Requirement: `client-core/settings-contract/saving-settings-preserves-authored-formatting`
- Class: functional
- Intents: `workspace-intent-fidelity`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: golden-output, example
- Source: [`specifications/client-core/settings-contract/saving-settings-preserves-authored-formatting.spec.ts`](../specifications/client-core/settings-contract/saving-settings-preserves-authored-formatting.spec.ts)

### Source Resolution

#### Source locators resolve through a stable grammar and configured hosts

- Requirement: `client-core/source-resolution/locator-grammar-is-stable`
- Class: functional
- Intents: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: decision-table, property, example
- Additional evidence: process via [`packages/cli-e2e/src/http-registry.e2e.test.ts`](../packages/cli-e2e/src/http-registry.e2e.test.ts) — Publishes, installs, and updates over a real HTTP registry transport — bearer-token auth headers, PUT uploads, immutable version and holdback semantics, no upload when the authoritative preview is blocked, and registry-form locator resolution with file:// parity — plus release-age-gated advancement, explicit bypass, unchanged settings, and second-run no-op exit codes that the in-memory file-registry harness cannot observe.
- Source: [`specifications/client-core/source-resolution/locator-grammar-is-stable.spec.ts`](../specifications/client-core/source-resolution/locator-grammar-is-stable.spec.ts)

### Version Constraints

#### Combining version constraints keeps every contributor's limits or reports the combination unsatisfiable

- Requirement: `client-core/version-constraints/constraint-intersection-preserves-every-limit`
- Class: functional
- Intents: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, example
- Source: [`specifications/client-core/version-constraints/constraint-intersection-preserves-every-limit.spec.ts`](../specifications/client-core/version-constraints/constraint-intersection-preserves-every-limit.spec.ts)

#### A version constraint accepts exactly the versions its semver range allows

- Requirement: `client-core/version-constraints/range-satisfaction-follows-semver`
- Class: functional
- Intents: `extension-adoption`, `trustworthy-distribution`
- Boundary: memory; selection: per-change
- Methods: property, decision-table, example
- Source: [`specifications/client-core/version-constraints/range-satisfaction-follows-semver.spec.ts`](../specifications/client-core/version-constraints/range-satisfaction-follows-semver.spec.ts)

## System

### Architecture

#### End-to-end suites reach the product only as a shipped artifact, never as imported code

- Requirement: `system/architecture/e2e-observes-only-shipped-artifacts`
- Class: architecture
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts`](../specifications/system/architecture/e2e-observes-only-shipped-artifacts.spec.ts)

#### The public system depends on private platform responsibilities only through published contracts

- Requirement: `system/architecture/public-system-depends-only-on-published-contracts`
- Class: architecture
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts`](../specifications/system/architecture/public-system-depends-only-on-published-contracts.spec.ts)

#### Specification layout mirrors the command tree and declared identities

- Requirement: `system/architecture/specification-folders-mirror-command-tree`
- Class: architecture
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts`](../specifications/system/architecture/specification-folders-mirror-command-tree.spec.ts)
- Cases:
  - `system/architecture/specification-folders-mirror-command-tree#directories-name-command-paths` — every specification directory under cli names a registered command path
  - `system/architecture/specification-folders-mirror-command-tree#no-symbolic-links` — no symbolic link hides specification content from discovery
  - `system/architecture/specification-folders-mirror-command-tree#identities-equal-paths` — every requirement identity equals its specification file path

### Compatibility

#### Every supported platform and shell receives release-blocking verification

- Requirement: `system/compatibility/supported-platform-matrix`
- Class: compatibility
- Intents: `platform-reach`
- Boundary: repository; selection: platform-matrix
- Methods: contract
- Additional evidence: binary via [`packages/cli-e2e/src/binary-smoke.e2e.test.ts`](../packages/cli-e2e/src/binary-smoke.e2e.test.ts) — Executes the compiled platform binary, proving the shipped artifact starts and answers on the target operating system and architecture.
- Additional evidence: platform via [`packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts`](../packages/cli-e2e/src/windows/workspace-mutation.windows.e2e.test.ts) — Exercises workspace mutation semantics on a real Windows filesystem, where path, symlink, and lock behavior differ from POSIX.
- Source: [`specifications/system/compatibility/supported-platform-matrix.spec.ts`](../specifications/system/compatibility/supported-platform-matrix.spec.ts)

### Installability

#### AXM installs through its supported channels with integrity verification

- Requirement: `system/installability/product-installs-through-supported-channels`
- Class: installability
- Intents: `platform-reach`, `trustworthy-distribution`
- Boundary: repository; selection: release-candidate
- Methods: contract
- Additional evidence: installed via [`packages/cli-e2e/src/install-verification.e2e.test.ts`](../packages/cli-e2e/src/install-verification.e2e.test.ts) — Runs the published installer scripts end to end against a served release layout, proving checksum verification, PATH guidance, and a working installed product.
- Source: [`specifications/system/installability/product-installs-through-supported-channels.spec.ts`](../specifications/system/installability/product-installs-through-supported-channels.spec.ts)

### Process

#### Changes land through human-reviewed pull requests, with requirements changes routed to maintainers

- Requirement: `system/process/changes-land-through-reviewed-pull-requests`
- Class: process
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/changes-land-through-reviewed-pull-requests.spec.ts`](../specifications/system/process/changes-land-through-reviewed-pull-requests.spec.ts)

#### The dual TypeScript alias stays in place until its recorded exit condition

- Requirement: `system/process/dual-typescript-alias-retained`
- Class: process
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/dual-typescript-alias-retained.spec.ts`](../specifications/system/process/dual-typescript-alias-retained.spec.ts)

#### Changes are verified by one aggregate required check before merge

- Requirement: `system/process/merges-require-aggregate-verification`
- Class: process
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/merges-require-aggregate-verification.spec.ts`](../specifications/system/process/merges-require-aggregate-verification.spec.ts)

#### Pre-launch contract changes land as one coherent break without compatibility paths

- Requirement: `system/process/pre-launch-changes-stay-coherent`
- Class: process
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/pre-launch-changes-stay-coherent.spec.ts`](../specifications/system/process/pre-launch-changes-stay-coherent.spec.ts)

#### Tracked repository content references no private coordination context

- Requirement: `system/process/public-artifacts-protect-private-context`
- Class: process
- Intents: `dependable-change-process`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/public-artifacts-protect-private-context.spec.ts`](../specifications/system/process/public-artifacts-protect-private-context.spec.ts)

#### Releases publish only through the canonical automated workflow

- Requirement: `system/process/releases-publish-through-canonical-workflow`
- Class: process
- Intents: `dependable-change-process`, `trustworthy-distribution`
- Boundary: repository; selection: per-change
- Methods: contract
- Source: [`specifications/system/process/releases-publish-through-canonical-workflow.spec.ts`](../specifications/system/process/releases-publish-through-canonical-workflow.spec.ts)

### Security

#### Telemetry collection follows only the operator's environment consent

- Requirement: `system/security/telemetry-consent-and-precedence`
- Class: security
- Intents: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: decision-table, contract
- Source: [`specifications/system/security/telemetry-consent-and-precedence.spec.ts`](../specifications/system/security/telemetry-consent-and-precedence.spec.ts)
- Cases:
  - `system/security/telemetry-consent-and-precedence#do-not-track-wins` — the do-not-track convention disables collection over every other control
  - `system/security/telemetry-consent-and-precedence#workspace-cannot-enable` — committed workspace configuration carries no telemetry control

#### Telemetry collection or delivery failure is invisible to the operation

- Requirement: `system/security/telemetry-failure-never-alters-outcomes`
- Class: functional
- Intents: `privacy-and-consent`, `safe-repetition`
- Boundary: memory; selection: per-change
- Methods: example
- Source: [`specifications/system/security/telemetry-failure-never-alters-outcomes.spec.ts`](../specifications/system/security/telemetry-failure-never-alters-outcomes.spec.ts)

#### Telemetry payloads carry only the documented observation fields

- Requirement: `system/security/telemetry-payloads-respect-data-boundary`
- Class: security
- Intents: `privacy-and-consent`
- Boundary: memory; selection: per-change
- Methods: golden-output
- Source: [`specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts`](../specifications/system/security/telemetry-payloads-respect-data-boundary.spec.ts)

## Intents

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
