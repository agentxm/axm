# Workspace state

AXM keeps four kinds of state separate:

- **Desired** — `.axm/settings.json` and configured pack manifests say what the
  workspace wants.
- **Observed** — canonical packages, managed agent artifacts and instruction
  regions, native config, and ownership markers say what actually exists.
- **Trust** — `.axm/trust.json` preserves source identity, immutable revisions,
  content identity, and Registry publisher epochs.
- **Receipt** — `.axm/axm-lock.yaml` records successful resolution and
  materialization history.

`axm sync` performs workspace-wide reconciliation of desired and observed state
using the trust baseline. Use `axm sync <fqn>` for one root and required pack
members, or `axm sync --type <type>` to limit reconciliation by extension type.
Run `axm sync --preview` before a workspace-wide apply. Sync
does not treat receipt rows as declarations or proof of installation. Missing,
stale, or malformed receipt history does not create install, update, uninstall,
prune, or repair work.

## Safe failure

AXM stops destructive reconciliation when a configured pack manifest is missing
or invalid, constraints conflict, or the trust baseline cannot prove that
same-name canonical content belongs to the configured source.

Sync preflights materialization, Knowledge, generator, trust migration, cleanup,
and instruction work before applying any step. A readiness error blocks the
whole plan, and a runtime failure blocks every later job. Drifted AXM-managed
inline MCP entries are never overwritten by sync; review their exact targets
with `axm mcps repair <name> --preview` and apply that targeted recovery
explicitly.

Every plan-bearing mutation constructs one execution candidate before any
write. Preview, human display, JSON output, approval, and apply refer to that
same candidate ID. AXM fingerprints relevant desired, trust, receipt, manifest,
and source material and fails with `stale-candidate` before the first effect if
those inputs change.

Local plans execute inside one candidate-wide workspace transaction. A failed
step, failed postcondition, or SIGINT restores every protected local target;
publish is non-rollbackable and instead reports the exact completed, failed,
and unattempted remote work. `--preview`, including `--preview --yes`, never
writes. JSON and non-interactive invocations never open a prompt.

A Registry publisher-epoch change is never crossed unattended. Local and
`workspace:` content is not treated as remotely recoverable. Inline MCP servers
are observed through settings and managed native configuration without a fake
canonical package.

## Workspace files

- Edit desired intent through AXM commands or `.axm/settings.json`.
- Do not hand-edit `.axm/trust.json` or `.axm/axm-lock.yaml`.
- Do not reconstruct desired state by copying content hashes or source identities
  between those files. Hashes are verification records, not declarations.
- Check `.axm/` into source control.
- Use `axm sync --preview --json` to inspect the same plan apply would run.
- Use `axm status` to inspect deterministic local blockers.
- After intentionally relocating a workspace-authored extension, use the exact
  `axm adopt <fqn> --preview` command reported by `axm status`, review its target,
  then apply `axm adopt <fqn>`. This never authorizes an unattended Registry or
  cross-authority transition.
- Use `axm packs repair <name-or-fqn> --preview` for authored-pack trust drift.
- Use `axm lint` for read-only diagnostics and `axm lint --fix` to reconcile.

If `axm status` or `axm lint` reports a receipt-only skill, choose explicitly:
run the exact `axm skills install <source>` command in the finding to declare
and retain it, or run `axm skills uninstall <name>` to remove it. `axm lint
--fix` does not choose between those outcomes and never silently uninstalls a
receipt-only skill.

If a v3 workspace has no `trust.json`, AXM migrates available security fields
from a valid receipt. Invalid trust state fails closed. Receipt-only maintenance
does not erase the trust baseline.

## Extension coverage

The model covers skills, MCP servers, subagents, rules, hooks, knowledge
bundles, and packs. Packs are containers with authoritative
dependency manifests; they do not have ordinary activation or per-agent
projection behavior.

Active Knowledge is resolved from this desired-state graph, including enabled
pack dependencies and shared dependencies. A direct `enabled: false`
declaration wins over pack activation. Its canonical package, trust, and receipt
remain valid while its instruction-table row and active search/open discovery
are absent.

## Where to go next

- `axm help settings` — desired workspace configuration
- `axm help trust-schema` — raw trust-state JSON Schema
- `axm help axm-lock-schema` — raw receipt JSON Schema
- `axm sync --help` — reconciliation flags
- `axm help packs` — pack ownership, constraints, and retention
