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

`axm sync` performs workspace-wide reconciliation of desired and observed state
using the trust baseline. Use `axm sync <fqn>` for one root and required pack
members, or `axm sync --type <type>` to limit reconciliation by extension type.
Run `axm sync --dry-run` before a workspace-wide apply. Sync
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
- Use `axm sync --dry-run --json` to inspect the same plan apply would run.
- Use `axm status` to inspect deterministic local blockers.
- After intentionally relocating a workspace-authored extension, use the exact
  `axm sync <fqn> --accept-authority-change` command reported by `axm status` to
  re-anchor its trust record. This never authorizes Registry or cross-authority
  transitions.
- Use `axm packs repair <name-or-fqn> --preview` for authored-pack trust drift.
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
