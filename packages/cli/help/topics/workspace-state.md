# Workspace state

AXM separates three state families:

- **Desired** — project `axm.json` and workspace-authored pack manifests say
  what the workspace wants.
- **Accepted resolution** — project `axm-lock.yaml` records the exact immutable
  identity and provenance accepted for each desired external extension.
- **Observed** — canonical packages, managed agent artifacts and instruction
  regions, native config, and ownership markers say what actually exists.

Settings and authored manifests are the only desired-state authority. A lock
row never declares an extension by itself. Canonical packages and agent-native
outputs never reconstruct missing settings or lock authority.

`axm sync` reconciles desired, accepted, and observed state. Use `axm sync
<extension>` for one root and its required pack members, or `axm sync --type <type>`
to limit reconciliation by directly materialized extension type. Pack is
intentionally absent from `--type` because it coordinates member extensions
instead of materializing directly; pass the pack's fully qualified
`<extension>` to sync that pack and its complete member closure. Run `axm sync
--preview` to inspect the same semantic candidate that apply will execute. In CI, run `axm sync
--preview --fail-on-change`; it exits 1 with a `reconciliation-required`
result when that candidate contains changes and exits 0 when the workspace is
already converged. Both preview forms are read-only.

## Managed ownership versions

Comment-bearing managed units use `axm:start`, `axm:end`, `axm:file`, or
`axm:point` with an explicit `v=1`. JSON and YAML keyed entries carry the same
version in `x-axm.v`. The version tells AXM which ownership grammar is safe to
interpret; it is not an extension version.

An unknown marker version is reported as `unsupported-version`. `axm lint` and
`axm sync --preview` instruct you to upgrade AXM, and sync performs no writes
for the affected closure. Do not hand-edit the version or marker boundaries.
After upgrading, preview again before applying reconciliation.

Machine previews expose an `owner` for every managed-region unit so callers
can distinguish unit identity from extension provenance.

`axm lint` reports `workspace/managed-file-unowned` when an artifact in a
configured agent directory has neither a structured file marker nor a managed
symlink proof. Inspect and preserve unfamiliar content; AXM does not claim or
delete it automatically.

User scope uses `~/.axm/workspace/axm.json`,
`~/.axm/workspace/axm-lock.yaml`, and the same source-qualified acquired
package scheme under `~/.axm/workspace/agent_extensions/`; the authority
relationships are otherwise the same. Its runtime state is the inner
`~/.axm/workspace/.axm/` directory. User scope has no authored type roots.

## Accepted external resolution

Lockfile v6 contains only external resolutions. Every row records the source
type and exact source name, accepted endpoint or local coordinate, original
intent, immutable resolution, package format, workspace name, extension type,
and strict integrity of the complete materialized package tree. Registry rows
also pin version, archive integrity, and publisher binding. Git-hosted rows pin
their host coordinates, selected subpath, commit, and tree; local rows pin a
workspace-relative path. Workspace-authored, bundled, inline, projected, and
command-history state does not belong in the lockfile.

Source names are durable identity. The built-in names are `agentxm` for the
AgentXM Registry and `github`, `gitlab`, and `bitbucket` for those hosts.
Unqualified Registry identifiers resolve through `agentxm`; alternate
registries must use their configured source name. `git`, `local`, and
`workspace` are reserved coordinate kinds, and `default` has no special
meaning. Changing the endpoint behind an accepted source name is drift: lint
and sync block until an explicit lifecycle operation accepts the transition.

Acquired canonical packages use
`agent_extensions/<source-name>/<source-full-name>/` in project scope and
`~/.axm/workspace/agent_extensions/<source-name>/<source-full-name>/` in user scope. Registry
full names are `<@owner>/<plural-type>/<name>`; hosted Git full names preserve
the repository owner or namespace, repository, and selected subpath. Azure
Repos additionally preserves organization and project, generic Git preserves
host and repository path, and local sources preserve their workspace-relative
selected path.

Registry `integrity` is the SRI SHA-512 digest of the published archive. AXM
verifies downloaded archive bytes before extraction, then records
`treeIntegrity` over every regular-file path and byte in the extracted package.
Any later edit, addition, removal, symlink, unsafe path, or case-fold collision
is canonical drift. Drift blocks the affected desired-state closure, lint,
sync, inspection, projection, and lifecycle preflight until the package is
reinstalled, updated, or explicitly forked into authored source. Publish
independently rebuilds only workspace-authored packages; installed external
trees are never publication inputs.

AXM does not create or modify `.gitattributes`, formatter configuration, or
editor policy. The consuming repository owns those choices; AXM keeps package
identity strict and reports any resulting byte drift. Exclude
`agent_extensions/` from mutating formatters, lint fixes, and save-time rewrites.
If a repository needs protection from ordinary Git line-ending conversion, it
may add `/agent_extensions/** -text` to its own `.gitattributes`, but that rule
does not prevent other tools from changing acquired files and is not an
integrity guarantee.

Sync may resolve a desired external extension once when no accepted row exists.
After acceptance, reinstall and sync use that exact identity; only update may
advance it. If the source can no longer reproduce the locked identity, AXM
blocks that affected work instead of substituting current bytes.

## Unsupported lockfile versions

AXM reads only lockfile v6. Every ordinary workspace-loading command checks a
present lockfile before command-specific work, and `--force` does not bypass
that check. The error names the lockfile path plus its observed and supported
versions.

For an older lockfile, explicitly re-accept desired intent into the current
format:

1. Preserve the incompatible lockfile outside its authoritative path.
2. Review `axm.json`, authored manifests, and the preserved lockfile to confirm
   the desired intent and prior external resolutions.
3. Remove the incompatible lockfile from the authoritative path.
4. Run `axm sync --preview` and review every proposed resolution. Use `--scope
user` for a user workspace.
5. Run `axm sync` only after accepting the preview.

This is new resolution, not migration. External versions may differ from the
preserved lockfile. If the workspace contains only workspace-authored content,
successful recovery may leave the lockfile absent.

For a newer lockfile, run `axm upgrade` before accessing the workspace again.
Do not run setup, delete or replace the lockfile, restore an older copy, or try
to downgrade its version. The newer state may contain meaning the installed
AXM does not understand.

An unreadable lockfile instead receives permission or known-good restoration
guidance. Invalid YAML names its syntax failure, and other schema failures name
the invalid fields. Those diagnoses do not claim an unsupported version.

## Safe reconciliation

AXM stops an affected semantic closure when its desired graph is incomplete,
its accepted resolution is invalid or incompatible, or a target is unowned or
ambiguously owned. Independent ready closures may still apply.

Lint reports intrinsic workspace facts without modifying state. Use `axm sync`
for reconciliation work.

Ordinary sync may apply without another approval because it realizes intent
already accepted in settings, authored Pack manifests, and the lockfile. It
does not add, remove, or revise extension intent. Commands that establish or
change intent must instead expose and approve their exact candidate. Sync keeps
this distinction only while planning and apply remain transactional,
stale-candidate protected, closure-local, rollback-safe, and truthful about
partial convergence.

Every plan-bearing mutation constructs one execution candidate before writing.
Preview, human display, JSON output, approval, and apply refer to that same
candidate ID. AXM fingerprints material desired, lock, manifest, canonical, and
target preimage state and rejects a stale candidate before its first write.

Application holds one atomic process lock per workspace at
`.axm/tmp/workspace-transition.lock`. Settings, accepted
lock state, canonical content, and owned outputs needed by one closure commit
together, and closures settle independently: a handled failure or
interruption restores the affected closure's protected targets — staged and
published by rename, never leaving a partial target — while closures that
already committed stand. The lock is refreshed while its owner runs and
reclaimed after abrupt process death; a later mutation converges surviving
authoritative and owned state.

AXM prepares and validates package content in a sibling staging directory, then
publishes it into the canonical directory by rename, so a canonical directory
only ever holds a whole tree. The next mutation removes stale staging content
and recovers a prior tree left in the sibling backup by an interrupted
replacement before reconciling again.

## Transient files and caches

Durable project authority stays in `axm.json`, `axm-lock.yaml`, authored roots,
and `agent_extensions/`. AXM uses unique children of ignored `.axm/tmp/` only
for project-local scratch and removes that directory when it becomes empty.
Invocation scratch and transaction rollback
snapshots use uniquely prefixed operating-system temporary directories.

Atomic file writes use exact `<target>.tmp.<unique>` siblings. Atomic package
publication uses only exact `<package>.axm-staging` and
`<package>.axm-backup` siblings. A later writer cleans only names it owns;
unrelated neighboring files and scratch children are preserved. AXM does not
persist command-intent journals, recovery markers, or receipts.

Registry archives and update-check state are performance-only data in the
platform cache directory. Invalid or corrupt cache data is ignored or removed
and rebuilt; it is never workspace authority.

## Workspace files

- Change project intent through AXM commands or `axm.json`.
- Treat `axm-lock.yaml` as generated accepted-resolution state; do not
  hand-edit it.
- Commit `axm.json`, `axm-lock.yaml`, authored roots, and `agent_extensions/`;
  ignore `.axm/` runtime state.
- Keep acquired `agent_extensions/` content byte-for-byte unchanged and exclude
  it from mutating repository tools.
- Use `axm lint` for read-only workspace facts.
- Use `axm sync --preview --json` to inspect reconciliation, then `axm sync` to
  apply it.
- Use `axm sync --preview --fail-on-change --json` as a read-only CI
  convergence assertion.
- Use explicit lifecycle commands when desired intent must change.

When acquired content drifts, compare the current checkout with the bytes Git
would commit:

```bash
axm lint
axm lint --view git-index
```

If workspace lint fails while Git-index lint passes, the staged package bytes
are intact and the checkout was changed by Git, an editor, a formatter, or an
unstaged edit. If both fail, the package bytes staged for commit also differ
from the accepted tree. Stage newly installed package files before using the
Git-index comparison to diagnose them.

## Extension coverage

The model covers skills, MCP servers, subagents, rules, hooks, knowledge
bundles, and packs. Packs contribute desired members only through a configured
pack and its authoritative manifest. A lock-only pack or member is not
reachable.

A direct `enabled: false` declaration wins over pack activation. Retained
canonical content and accepted resolution may remain while active projections
and Knowledge discovery are absent.

## Configured-agent outcomes

Lifecycle previews, applied results, and extension inventory use the same
configured-agent outcome vocabulary:

- `projected` — preview expects a supported agent projection.
- `current` — inspection confirms the expected projection.
- `not-applicable` — the extension is disabled, excluded by target policy, or
  workspace/container-owned and therefore intentionally has no projection for
  that agent.
- `unsupported` — the configured agent or selected scope has no supported AXM
  integration.
- `blocked` — a required behavior cannot be preserved, so AXM performs no
  writes for the affected operation.
- `failed` — a projection was expected but is missing, drifted, or could not be
  written.

Each machine-readable row includes the extension type and name, agent ID,
outcome, stable `reasonCode`, and explanatory reason. Feature-specific fields
such as hook mechanism and projection path remain additional evidence rather
than replacing the common outcome.

## Where to go next

- `axm help settings` — desired workspace configuration
- `axm help axm-lock-schema` — accepted-resolution lockfile schema
- `axm sync --help` — reconciliation flags
- `axm help packs` — pack reachability, constraints, and retention
