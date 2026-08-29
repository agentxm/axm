# AXM specification catalog

Generated from `specifications/` metadata by `scripts/specification-catalog.ts`.
Do not edit by hand: run `pnpm run generate` after a specification change.
This catalog lists every authoritative requirement whether or not its
implementation currently passes; execution evidence lives in test results,
never here.

## CLI

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
- Source: [`specifications/cli/install/machine-result-contract.spec.ts`](../specifications/cli/install/machine-result-contract.spec.ts)

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
- `responsive-operation` — Common operations complete fast enough to sit inside interactive and agent workflows.
- `safe-repetition` — Every operation is safe to repeat and safe to interrupt: reruns are no-ops, failures roll back their closure, and surviving authority converges.
- `trustworthy-distribution` — Publishing and acquiring extensions preserves integrity, provenance, and immutable accepted resolutions.
- `workspace-intent-fidelity` — Workspace state always reflects explicitly expressed intent, authority, and ownership — never inference, accident, or unauthorized adoption.
