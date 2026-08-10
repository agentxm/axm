# Workspace State

AXM reconciles four distinct kinds of workspace state. Keep these boundaries
explicit when changing a command, manager, read model, schema, or test.

> [Workspace read model](./workspace-read-model.md) — scoped read APIs and test fixtures

## The four-state model

| State    | Authority                                                                                              | Purpose                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Desired  | `.axm/settings.json` plus manifests of configured packs                                                | Declares root intent, activation, constraints, agents, policy, and pack-derived members.                          |
| Observed | Canonical packages, native configuration, managed projections, ownership markers, and workspace inputs | Describes content and projections that actually exist and whether they are usable and aligned.                    |
| Trust    | `.axm/trust.json`                                                                                      | Preserves security-critical source identity, resolved revisions, content identity, and Registry publisher epochs. |
| Receipt  | `.axm/axm-lock.yaml`                                                                                   | Records successful resolution and materialization history for diagnostics, display, and recovery.                 |

A receipt never declares an extension, proves installation, owns an artifact, or
decides pack retention. Missing, stale, or malformed receipt history must not
change a business plan when desired, observed, trust, and source responses are
unchanged.

## Reconciliation

`axm sync` builds one plan from desired state and observations. It:

1. expands each configured pack manifest across all supported leaf types;
2. stops destructive work when a required manifest is missing, invalid, or
   conflicting;
3. validates canonical content against its per-type package contract and trust
   identity;
4. repairs missing or drifted AXM-managed projections;
5. preserves ignored and unmanaged artifacts; and
6. persists receipt results only after corresponding work succeeds.

Dry-run, JSON, and apply use the same plan. An aligned second run is a no-op.

## Trust and source changes

Registry trust records freeze the publisher-handle epoch. AXM refuses an
unattended transition when the same Registry identity resolves under a different
publisher binding. A different configured source is an explicit install
transition, not permission to reuse same-name canonical content.

Immutable Git revisions and mutable branches or tags remain distinguishable.
Local and `workspace:` sources are not treated as remotely recoverable. Inline
MCP declarations use settings plus managed native configuration and do not
invent a canonical package.

If `trust.json` is absent, AXM migrates available security fields from a valid
v3 receipt. Invalid trust state fails closed. Receipt deletion and receipt-only
maintenance do not delete an existing trust baseline.

## Packs

A pack is a desired-state container, not an enabled per-agent extension. Its
manifest is authoritative for membership and constraints. Member identity keeps
the owner and type; simple-name or last-wins flattening is invalid.

Direct and pack origins may coexist. A disabled direct declaration remains
desired when a configured pack still requires it. Removing one pack retains a
member required directly or by any other pack. Constraint intersections must be
non-empty; otherwise reconciliation reports a conflict and performs no
destructive cleanup for that graph.

## Command and read-model rules

- Planners and resolvers consume desired, observed, trust, source policy, and
  explicit command intent.
- Receipt reads on mutation paths may enrich history or artifacts only and must
  be best-effort.
- Settings-only and receipt-only rows are not reported as installed.
- Installation comes from the type's observable contract.
- Project and user scope use the same model with different workspace roots.
- Read-only commands do not repair or rewrite state.

The reconciliation parity obligation covers skills, MCP servers, subagents,
rules, hooks, knowledge, and packs, plus Registry; GitHub,
GitLab, Bitbucket, Azure Repos, and generic Git; local; `workspace:`; and inline
MCP applicability.

## Related guides

- [Workspace schema evolution](./workspace-schema-evolution.md)
- [Extension type parity](./extension-type-parity.md)
- [Feature delivery](./feature-delivery.md)
- [Testing](./testing.md)
- [Lint rule authoring](./lint-rule-authoring.md)
