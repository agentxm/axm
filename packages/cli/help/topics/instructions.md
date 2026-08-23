# Instruction files

Instruction-file management is a root workspace capability. AXM keeps one
canonical source, such as `AGENTS.md`, available through the filenames required
by configured coding agents. It is useful independently of whether the
workspace installs Rule extensions.

Use bare `axm instructions` to inspect the effective configuration and target
health. Use `axm instructions enable` and `axm instructions disable` to change
the capability. There is no `status` subcommand and no command under `axm
rules`.

## Configuration

The top-level `instructionFiles` setting owns the choice:

```jsonc
{
  "agents": ["claude-code", "codex", "gemini-cli"],
  "instructionFiles": {
    "fileName": "AGENTS.md",
    "gitignoreAliases": true,
  },
}
```

The supported forms are:

- absent — the workspace has not configured instruction-file management;
- `false` — propagation is explicitly disabled; or
- `{ fileName?, gitignoreAliases? }` — propagation is enabled with optional
  source and alias-ignore preferences.

AXM does not read `rulesConfig.instructions` and does not migrate that old
shape. Correct unsupported settings directly before continuing.

## Commands

All commands accept `--scope project` (default) or `--scope user`:

- `axm instructions` — show the source, target, mechanism, health, and
  ownership for each configured agent and propagation root, followed by any
  AXM-owned alias the current configuration no longer needs.
- `axm instructions enable [--file AGENTS.md]
[--gitignore|--no-gitignore]` — enable propagation and reconcile owned
  aliases and `.gitignore`. Add `--preview` to inspect the plan.
- `axm instructions disable` — remove current AXM-owned aliases and the managed
  `.gitignore` block while preserving the canonical source and authored prose,
  then set `instructionFiles: false`. Add `--preview` to inspect the plan.

## Propagation

Each coding agent declares how it consumes instructions. AXM selects the
mechanism automatically:

- Agents that read the canonical filename directly need no alias.
- Agents with their own filename receive an AXM-owned symlink, with a supported
  copy fallback where symlinks are unavailable.
- Unsupported native conventions are reported without a guessed target.

AXM also walks nested directories. A subdirectory containing the configured
canonical filename becomes an additional propagation root. Agent configuration
directories such as `.junie` are never roots; directory symlinks, nested Git
repositories, registered worktrees, and nested AXM workspaces are never
entered.

## Contributed regions

Enabled extension capabilities may contribute independently managed content:

- Rules contribute ordered behavior guidance.
- Knowledge contributes a compact discovery table for enabled bundles admitted
  by the Knowledge-wide switch and each bundle's manifest/workspace policy.
- Hooks may contribute an explicitly supported instruction fallback.

Each region remains owned by its contributor. Global instruction-file
management owns propagation and aliases; it does not own those extensions or
the surrounding authored prose.

Top-level instruction management is the outer gate. It does not replace the
Knowledge-specific precedence or affect enabled Concepts; see `axm help
knowledge` for per-bundle `instructionEntry` behavior.

## Alias `.gitignore` entries

`gitignoreAliases` controls the managed block between `# axm:start v=1
region=instruction-aliases ext=@agentxm/instructions/aliases` and `# axm:end
v=1 region=instruction-aliases` markers. The canonical source named by
`fileName` is never ignored.

- `true` (default) manages one exact workspace-relative ignore entry for each
  propagated alias target at every discovered instruction root. It does not
  reserve the alias filename elsewhere in the workspace.
- `false` omits managed alias-ignore entries.

## Diagnosis and reconciliation

Use `axm lint` for missing sources, drifted AXM-owned targets, unowned files at
target paths, stale AXM-owned aliases, unsupported agent conventions, stale
managed `.gitignore` blocks, and tracked aliases covered by managed ignore
patterns. The tracked-alias finding names `gitignoreAliases: false` as the
reconciling setting. Use `axm sync --preview` to inspect reconciliation, then
`axm sync` to restore configured state.

Ownership is inspected, not remembered. A symlink that resolves to the canonical
source or an `axm:file v=1` marker proves an alias is AXM's; the banner prose is
guidance rather than an ownership signal. Anything else at a target path is an
unowned collision: `axm instructions` reports it as `unowned`, `axm lint` names
it, and no reconciliation modifies it. An AXM-owned alias left behind by a
removed propagation root, a removed agent, or a changed canonical filename is
`stale`: `axm sync` removes it before rewriting the `.gitignore` block, and
`axm sync --preview` names every file it would remove.

A missing, drifted, or stale AXM-owned target is determined by its canonical
source and configuration, so `axm lint --fix` restores or removes just those
targets through the same reconciliation `axm sync` performs — refusing first,
exactly as `axm sync` does, when any target path holds a file AXM does not own.
A missing source is not determined — it needs an authoring decision, and
`--fix` leaves it alone.

Transitions fail closed when an alias or managed region is unowned or
ambiguous. Settings and files remain unchanged; there is no generic force flag.
AXM tolerates formatter-only changes and emits no formatter directives.

## Where to go next

- `axm instructions --help` — command flags and examples
- `axm help settings` — the `instructionFiles` settings shape
- `axm help rules` — installable Rule contributions
- `axm help knowledge` — Knowledge discovery contributions
- `axm help workspace-state` — desired, accepted, and observed state
