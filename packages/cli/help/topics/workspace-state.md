# Workspace state

AXM separates three state families:

- **Desired** — `.axm/settings.json` and workspace-authored pack manifests say
  what the workspace wants.
- **Accepted resolution** — `.axm/axm-lock.yaml` records the exact immutable
  identity and provenance accepted for each desired external extension.
- **Observed** — canonical packages, managed agent artifacts and instruction
  regions, native config, and ownership markers say what actually exists.

Settings and authored manifests are the only desired-state authority. A lock
row never declares an extension by itself. Canonical packages and agent-native
outputs never reconstruct missing settings or lock authority.

`axm sync` reconciles desired, accepted, and observed state. Use `axm sync
<fqn>` for one root and its required pack members, or `axm sync --type <type>`
to limit reconciliation by extension type. Run `axm sync --preview` to inspect
the same semantic candidate that apply will execute.

## Accepted external resolution

Lockfile v4 contains only external resolutions. Registry rows pin version,
archive integrity, source name, and publisher binding. Git rows pin commit,
tree, and content identity. Local-source rows pin the relative locator and
content identity. Workspace-authored, bundled, inline, projected, and
command-history state does not belong in the lockfile.

Sync may resolve a desired external extension once when no accepted row exists.
After acceptance, reinstall and sync use that exact identity; only update may
advance it. If the source can no longer reproduce the locked identity, AXM
blocks that affected work instead of substituting current bytes.

## Safe reconciliation

AXM stops an affected semantic closure when its desired graph is incomplete,
its accepted resolution is invalid or incompatible, or a target is unowned or
ambiguously owned. Independent ready closures may still apply.

Lint reports intrinsic workspace facts. `axm lint --fix` performs only
deterministic, meaning-preserving normalization; it does not acquire sources,
write accepted lock state, replace canonical content, or repair projections.
Use `axm sync` for reconciliation work.

Every plan-bearing mutation constructs one execution candidate before writing.
Preview, human display, JSON output, approval, and apply refer to that same
candidate ID. AXM fingerprints material desired, lock, manifest, canonical, and
target preimage state and rejects a stale candidate before its first write.

Application holds one atomic process lock per workspace. Settings, accepted
lock state, canonical content, and owned outputs needed by one closure commit
together. A handled failure or interruption restores protected targets. The
lock is refreshed while its owner runs and reclaimed after abrupt process
death; a later mutation converges surviving authoritative and owned state.

## Workspace files

- Change intent through AXM commands or `.axm/settings.json`.
- Treat `.axm/axm-lock.yaml` as generated accepted-resolution state; do not
  hand-edit it.
- Check `.axm/` into source control.
- Use `axm lint` for read-only facts and `axm lint --fix` only for safe
  normalization.
- Use `axm sync --preview --json` to inspect reconciliation, then `axm sync` to
  apply it.
- Use explicit lifecycle commands when desired intent must change.

Legacy lockfile versions and `trust.json` are unsupported state. AXM does not
reconstruct current authority from them.

## Extension coverage

The model covers skills, MCP servers, subagents, rules, hooks, knowledge
bundles, and packs. Packs contribute desired members only through a configured
pack and its authoritative manifest. A lock-only pack or member is not
reachable.

A direct `enabled: false` declaration wins over pack activation. Retained
canonical content and accepted resolution may remain while active projections
and Knowledge discovery are absent.

## Where to go next

- `axm help settings` — desired workspace configuration
- `axm help axm-lock-schema` — accepted-resolution lockfile schema
- `axm sync --help` — reconciliation flags
- `axm help packs` — pack reachability, constraints, and retention
