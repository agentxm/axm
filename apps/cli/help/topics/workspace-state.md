# Workspace state

AXM separates three state families:

- **Desired** — project `axm.json` and workspace-authored pack manifests say
  what the workspace wants.
- **Accepted resolution** — project `axm.lock` records the exact immutable
  identity and provenance accepted for each desired external extension, plus
  the generation currency of the projections AXM writes.
- **Observed** — canonical packages, managed agent artifacts and instruction
  regions, and native config say what actually exists.

Settings declare roots and activation. Authored Pack manifests and acquired
Packs' accepted dependency declarations determine their members. A lock row
never declares a root by itself. Canonical packages and agent-native outputs
never reconstruct missing settings or lock authority.

`axm sync` reconciles desired, accepted, and observed state. Use `axm sync
<extension>` for one root and its required pack members, or `axm sync --type <type>`
to limit reconciliation by directly materialized extension type. Pack is
intentionally absent from `--type` because it coordinates member extensions
instead of materializing directly; pass the pack's fully qualified
`<extension>` to sync that pack and its complete member closure. A selection
that includes a Rule or Knowledge bundle also reconciles the shared instruction
region those bundles contribute to, regenerating the whole region from every
contributor; while another contributor lacks accepted state, that region stays
blocked and unchanged. Run `axm sync
--preview` to inspect the same semantic candidate that apply will execute. In CI, run `axm sync
--preview --fail-on-change`; it exits 1 with a `reconciliation-required`
result when that candidate contains changes and exits 0 when the workspace is
already converged. Both preview forms are read-only.

## Managed regions and projection currency

AXM writes a region inside a human-authored file only where it must share that
file: the Rules and Knowledge regions of the instruction file your settings
plan, and the instruction-alias region of `.gitignore`. A region is delimited by
name-only fences in the file's own comment syntax:

```markdown
<!-- axm:rules -->

…generated body…
<!-- /axm:rules -->
```

```gitignore
# axm:instruction-aliases
CLAUDE.md
# /axm:instruction-aliases
```

The names are `rules`, `knowledge`, and `instruction-aliases`. A fence carries
no version, owner, source, or digest, and AXM replaces the whole body. In
Markdown, a fence is a whole line starting at column 0, and a fence shown inside
a fenced code block is not one. AXM writes a region only in the planned
instruction target; a same-named fence in any other file is yours. Duplicate,
nested, interleaved, or unpaired fences block the write and name the file and
region. An `axm:` fence with another name is left untouched and reported by lint
as information. Whole-file outputs, such as Subagent files and instruction
copies, carry no marker at all.

Native MCP and Hook configuration instead uses validated effective
declarations: see `axm help mcps` and `axm help hooks`. These entries require no
ownership properties or fences; absence from desired state retains their native
configuration.

The lockfile's `projections` section records, per projected file, a generation
digest of the inputs (`gen`) and a digest of the bytes AXM last wrote
(`output`). Sync compares only `gen`: a formatter or editor rewriting a current
region or file is not drift, and sync does not rewrite it. When an input
changes, sync replaces the unit, and `axm sync --preview` marks a replaced unit
"modified since last write" when its bytes differ from `output`. The rows never
grant ownership; they are deletion evidence. A recorded file AXM would delete is
deleted only while its bytes still match what AXM wrote or would write; an
edited one is kept and reported.

Two flags override these guards on the commands that can hit them:

- `--replace-unrecorded` replaces an existing whole file at a planned path that
  AXM has no record of writing and whose bytes differ from the render. Without
  it, the command refuses and names the flag. An identical file is recorded
  without a write.
- `--discard-modified` deletes a recorded whole file that was edited since AXM
  last wrote it. A file AXM never recorded is kept even with this flag.

Neither flag is implied by `--yes`.

Machine previews expose an `owner` for every managed-region unit, derived from
the desired graph, so callers can distinguish unit identity from extension
provenance.

**Merge conflicts.** When `axm.lock` or a projected file conflicts, take
either side and run `axm sync`. A stale row can only make sync rewrite a unit
once or keep a file it would otherwise delete.

**Deleting the lockfile** drops the rows. The next sync records identical whole
files without writing them, refuses differing ones until you pass
`--replace-unrecorded`, and rewrites each region once.

**Generated files in review.** AXM does not write `.gitattributes`. To collapse
projected files in GitHub diffs, add your own entries, for example
`AGENTS.md linguist-generated` or `.claude/agents/*.md linguist-generated`.

`axm lint` reports `workspace/managed-file-unowned` when an artifact in a
configured agent directory is neither a declared output at its planned path
nor a managed symlink. `workspace/projection-modified` reports a projected file
or region whose bytes differ from what AXM last wrote, and names `axm fork` for
an acquired source or the authored source to edit; the next input change
replaces those edits. Inspect and preserve unfamiliar content; AXM does not claim or
delete it automatically. A valid authored package in its authoring folder is
authored source, not an unowned artifact.

`axm lint` also warns about content desired state does not explain:
`workspace/installed-but-not-configured` for an installed package in the
install root that no desired route reaches, `workspace/authored-package-declared`
for a valid authored package in a standard authoring folder that `axm.json`
does not declare, and `workspace/install-root-entries-recognized` for an
install-root entry that is neither an installed package nor AXM staging.
`axm lint --fix` adds no declarations and removes nothing.

Agents read the user scope and the project together, so `axm lint` also
reports what the other scope contributes. `workspace/project-outputs-not-shadowed`
warns when a project skill or subagent shares its name with a user-scope output
the same agent reads; the agent decides which copy it loads.
`workspace/user-outputs-have-settings` warns when user-scope agent outputs carry
AXM ownership proof but `~/.axm/workspace/axm.json` is missing or unreadable. In
a folder without `axm.json`, lint reports `workspace/initialized` instead of
failing, and `workspace/agent-content-has-settings` warns about agent
instruction files and agent directories there. A project folder that is the
user home has no separate user scope, so these checks skip it.

User scope uses `~/.axm/workspace/axm.json`,
`~/.axm/workspace/axm.lock`, and the same source-address acquired
package scheme under `~/.axm/workspace/agent_extensions/`; the authority
relationships are otherwise the same. Its runtime state is the inner
`~/.axm/workspace/.axm/` directory. User scope has no authored type roots.

## Accepted external resolution

`axm.lock` is a TOML file at lockfile version 1 (`version = 1`). It contains
external resolutions and projection currency:

```toml
#:schema https://axm.sh/schemas/axm-lock.schema.json
# Generated by axm; do not edit by hand. See: axm help workspace-state
version = 1

[[package]]
id = "registry.agentxm.ai/@acme/skills/review"
source = { registry = "https://registry.agentxm.ai" }
version = "1.0.0"
archive = "sha512-…"
publisher = "hbnd_…"
tree = "sha256-tree-v2:…"

[skills]
review = { package = "registry.agentxm.ai/@acme/skills/review", name = "@acme/skills/review" }

[projections.rules]
contract = 1

[projections.rules.units]
"AGENTS.md" = { gen = "sha256:…", output = "sha256:…" }
```

Each `[[package]]` record describes one retained package once: its `id`, its
`source` locator, the immutable snapshot, and `tree`, the integrity of the
complete retained tree. The `id` is the package's directory under
`agent_extensions/` (see Retained package addresses below), so the record and
the directory never disagree.

The binding tables `[skills]`, `[subagents]`, `[rules]`, `[hooks]`,
`[knowledge]`, and `[packs]` are keyed by the local name in `axm.json`. Each
binding names the `package` record it selects and the declared `name`
(`@owner/<type>/<name>`, or a bare name for an identity without an owner). A Git
binding also records the `spec` revision the source asked for, and a component
of a plugin or other distribution records its `component` paths. MCP selections
are `[[mcp]]` rows identified by `package` and `name`: local connection names
belong to `axm.json`, not the lockfile. Multiple selections can share one
package record and directory, including different native kinds and multiple MCP
connections.

Registry snapshots pin `version`, `archive` integrity, and `publisher` binding.
Git snapshots pin `commit` and `git-tree`. Local snapshots pin a tree at
project-relative or absolute source coordinates. HTTP snapshots preserve the
logical source and the accepted `artifact` manifest for exact replay.
Workspace-authored, bundled, inline, and command-history state do not belong in
the lockfile; for projections it holds only the digests described above, in the
`[projections.<kind>]` tables after the bindings.

Acquired Pack records also carry their manifest version, content identity, and
complete `dependencies` declarations. Those accepted declarations preserve
membership and constraints when installed Pack files are missing or changed.
Authored Packs continue to use their current manifests. Settings determine the
roots and activation; orphan lock rows never make a package desired. Knowing the dependency graph does not establish that
its content is present or safe to project.

Configured Registry names and the built-in `agentxm` name are locator
shorthand in `axm.json`; they are not lockfile identity. Once accepted, the
record's `source` carries the resolved Registry or Git URL directly. If a named
Registry now resolves to a different URL than the accepted record, lint and sync
block until an explicit lifecycle operation accepts the transition.

AXM writes the whole file on every change, in one canonical layout: records
sorted by `id`, bindings and units by key, in code-point order, so the same
state produces the same bytes on every machine. Comments and hand formatting do
not survive the next write. `[tool.<name>]` tables are reserved for other
tools; AXM keeps their values on every write and never reads them.

### Git acquisition and revision behavior

Git locators may be a bare GitHub coordinate such as `owner/repo@v1.2.0`, a
`github:`, `gitlab:`, or `bitbucket:` shorthand, or a full `https`, `ssh`, or
`git` clone URL. `//path` selects a package directory within the repository.
AXM resolves the selected revision to a commit when it first installs the
package and records both that commit and the selected package tree.

AXM uses the Git credentials already available to the `git` process, including
configured credential helpers and SSH agents. Terminal credential prompts are
disabled. AXM does not manage, persist, forward, or print Git credentials.

`--reinstall` reacquires the commit recorded in the lockfile; it does not
resolve the branch or tag again. If the remote no longer makes that commit
reachable, reinstall fails and names both the locator and recorded commit.
`axm update` advances a branch selector. Tag and commit selectors remain pinned;
for a semantic-version tag, update reports a newer remote tag when one exists
without changing the installation. Installing the same repository with a new
tag, such as `owner/repo@v1.3.0`, is an explicit selector change and appears in
preview before AXM updates the existing desired entry.

Git submodules and Git LFS object hydration are unsupported. LFS smudging is
disabled and submodules are not initialized. Contained source symlinks retain
their meaning; links escaping the package boundary are rejected.

### Retained package addresses

Acquired canonical packages live under `agent_extensions/` in project scope
and `~/.axm/workspace/agent_extensions/` in user scope:

- Registry: `registry.agentxm.ai/@acme/skills/review/`; a custom endpoint keeps
  its actual host and full endpoint path before the published identity.
- Git: `github.com/acme/toolbox/plugins/review/` for a package rooted at
  `plugins/review` in that repository.
- HTTP: the logical host and URL path, plus the selected artifact boundary.
  Only a direct Skill URL's terminal `SKILL.md` is removed; extensionless paths
  remain intact. Index selections retain their entry identity.
- Local: `_local/project/<source-path>/` or
  `_local/absolute/<volume>/<source-path>/`. File-backed Registries likewise
  retain their local endpoint coordinates.

Reserved or unsafe characters use reversible `~hh` byte escapes. Host ports,
Unicode, Windows-reserved names, and case are accounted for; credentials and
query secrets never enter directory names. Exact, case-folded, ancestor, or
physical-path collisions block before writes. Unknown content at a destination
is preserved, even if accepted lock state was lost.

One selected plugin retains its full package payload once. Selecting another
component reuses the accepted snapshot and does not activate unselected files.
The same sharing applies to co-located native kinds. Update advances all
bindings to a shared package atomically, including disabled selections and
members reached through Packs. If a retained component disappears, the update
blocks without replacing the package. Uninstall keeps shared content and its
accepted metadata until the last consumer is removed.

A Registry record's `archive` is the SRI SHA-512 digest of the published
archive. AXM verifies downloaded archive bytes before extraction, then records
`tree` over every regular-file path and byte in the extracted package.
Later edits, additions, removals, symlinks, unsafe paths, and case-fold collisions
can make the acquired tree disagree with its accepted identity. `axm lint`
reports that disagreement as canonical drift. The lockfile continues to identify
the accepted external source; checking a file does not accept its edits.

Use `axm fork` to create a workspace-authored package under a new identity when
you want to maintain your own changes. Publish rebuilds only workspace-authored
packages; installed external trees are never publication inputs.

AXM does not create or modify `.gitattributes`, formatter configuration, or
editor policy. The consuming repository owns those choices; AXM keeps package
identity strict and reports any resulting byte drift. Exclude
`agent_extensions/` from mutating formatters, lint fixes, and save-time rewrites.
If a repository needs protection from ordinary Git line-ending conversion, it
may add `/agent_extensions/** -text` to its own `.gitattributes`, but that rule
does not prevent other tools from changing acquired files and is not an
integrity guarantee.

Sync may resolve a desired external extension once when no accepted row exists.
After acceptance, repeated install and sync use that exact identity; update may
advance it. If the source can no longer reproduce the locked identity, AXM
blocks that affected work instead of substituting current bytes.

Repeating install at the same accepted constraint restores missing or drifted
acquired content. Ordinary sync and activation refuse to overwrite present
drift. A valid, fully installed closure needs no source resolution or fetch on
repeated install; restoring missing bytes may require network access.

## Unsupported lockfile versions

AXM reads only `axm.lock` at lockfile version 1. Every ordinary
workspace-loading command checks a present lockfile before command-specific
work, and override flags do not bypass that check. The error names the lockfile
path plus its observed and supported versions.

Earlier releases wrote `axm-lock.yaml`, a YAML lockfile at version 12. AXM does
not read it and does not migrate it. While that file exists in a project or
user workspace, every workspace-loading command refuses it as an older lockfile,
naming its path and version, even when an `axm.lock` sits beside it. Follow the
recovery below; it removes the old file and accepts resolutions afresh into
`axm.lock`. The old file's projection rows are not carried over either, so the
first sync behaves as described under "Deleting the lockfile" above.

**Recovering from a rejected lockfile.** For an older lockfile, explicitly
re-accept desired intent into the current format by following the route the
error suggests:

1. Back up the incompatible lockfile outside the workspace, review axm.json,
   then remove the incompatible file. Review authored manifests and the backup
   too, to confirm the desired intent and prior external resolutions. Preserve
   acquired content lacking current ownership proof outside prospective install
   destinations; AXM will not infer ownership from those files or overwrite them.
2. Preview a new lockfile in the supported format: `axm sync --preview`. Review
   every proposed resolution. Use `--scope user` for a user workspace.
3. Apply the previewed workspace changes: `axm sync`.

A workspace containing only workspace-authored content may correctly finish
without a lockfile. `axm install <source>` adds an explicitly selected source;
`axm sync` realizes the configured workspace.

This is new resolution, not migration. External versions may differ from the
backup. Each re-accepted extension is selected within its effective constraint:
a direct pin on a Pack member holds when every Pack that requires the member
admits it. When no version satisfies the pin and every requiring Pack range,
the preview and the apply block that member and those Packs, naming every
contributor, and accept nothing for them; independent extensions still
converge. Change the pin in `axm.json` and preview again.

For a newer lockfile, run `axm upgrade` before accessing the workspace again.
Do not run setup, delete or replace the lockfile, restore an older copy, or try
to downgrade its version. The newer state may contain meaning the installed
AXM does not understand.

An unreadable lockfile instead receives permission or known-good restoration
guidance. Invalid TOML names its syntax failure, and other schema failures name
the invalid fields. Those diagnoses do not claim an unsupported version.

## Safe reconciliation

AXM stops an affected semantic closure when a configured Pack's routes are
unresolved (its authored manifest is absent, unreadable, or invalid, or its
accepted dependency declaration is unavailable), when an accepted resolution is invalid or
incompatible, or when a file-artifact target requires ownership evidence and is
unowned or ambiguously owned. A problem
confined to one identified extension stops that extension's closure alone;
independent ready closures still apply. Nothing is removed on the strength of
an unresolved Pack: an unknown membership never proves an extension absent.

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

Durable project authority stays in `axm.json`, `axm.lock`, authored roots,
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
- Treat `axm.lock` as generated accepted-resolution and projection-currency
  state; do not hand-edit it. AXM rewrites it whole, so edits and comments do
  not survive. Other tools may keep their own data under `[tool.<name>]`.
- Commit `axm.json`, `axm.lock`, authored roots, and `agent_extensions/`;
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
axm lint --staged
```

If workspace lint fails while Git-index lint passes, the staged package bytes
are intact and the checkout was changed by Git, an editor, a formatter, or an
unstaged edit. If both fail, the package bytes staged for commit also differ
from the accepted tree. Stage newly installed package files before using the
Git-index comparison to diagnose them.

## Extension coverage

The model covers skills, MCP servers, subagents, rules, hooks, knowledge
bundles, and packs. Packs contribute desired members only through a configured
Pack and its authoritative dependency declaration. A lock-only Pack or member
is not reachable.

A direct `enabled: false` declaration wins over pack activation. Retained
canonical content and accepted resolution may remain while active projections
and Knowledge discovery are absent.

## Configured-agent outcomes

Lifecycle previews, applied results, and extension inventory use the same
configured-agent outcome vocabulary:

- `projected` — preview expects a supported agent projection.
- `current` — inspection confirms the expected projection.
- `not-applicable` — the extension is disabled or workspace/container-owned and
  therefore intentionally has no projection for that agent.
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
