# Workspace state

AXM keeps four kinds of state separate:

- **Desired** — `.axm/settings.json` and configured pack manifests say what the
  workspace wants.
- **Observed** — canonical packages, managed agent projections, native config,
  and ownership markers say what actually exists.
- **Trust** — `.axm/trust.json` preserves source identity, immutable revisions,
  content identity, and Registry publisher epochs.
- **Receipt** — `.axm/axm-lock.yaml` records successful resolution and
  materialization history.

`axm sync` reconciles desired and observed state using the trust baseline. It
does not treat receipt rows as declarations or proof of installation. Missing,
stale, or malformed receipt history does not create install, update, uninstall,
prune, or repair work.

## Safe failure

AXM stops destructive reconciliation when a configured pack manifest is missing
or invalid, constraints conflict, or the trust baseline cannot prove that
same-name canonical content belongs to the configured source.

A Registry publisher-epoch change is never crossed unattended. Local and
`workspace:` content is not treated as remotely recoverable. Inline MCP servers
are observed through settings and managed native configuration without a fake
canonical package.

## Workspace files

- Edit desired intent through AXM commands or `.axm/settings.json`.
- Do not hand-edit `.axm/trust.json` or `.axm/axm-lock.yaml`.
- Check `.axm/` into source control.
- Use `axm sync --preview --json` to inspect the same plan apply would run.
- Use `axm lint` for read-only diagnostics and `axm lint --fix` to reconcile.

If a v3 workspace has no `trust.json`, AXM migrates available security fields
from a valid receipt. Invalid trust state fails closed. Receipt-only maintenance
does not erase the trust baseline.

## Extension coverage

The model covers skills, commands, MCP servers, subagents, context files, rules,
hooks, knowledge bundles, and packs. Packs are containers with authoritative
dependency manifests; they do not have ordinary activation or per-agent
projection behavior.

## Where to go next

- `axm help settings` — desired workspace configuration
- `axm help trust-schema` — raw trust-state JSON Schema
- `axm help axm-lock-schema` — raw receipt JSON Schema
- `axm sync --help` — reconciliation flags
- `axm help packs` — pack ownership, constraints, and retention
