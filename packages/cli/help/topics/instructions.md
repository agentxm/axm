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

- `axm instructions` — show the source, target, mechanism, and health for each
  configured agent and propagation root.
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
canonical filename becomes an additional propagation root.

## Contributed regions

Enabled extension capabilities may contribute independently managed content:

- Rules contribute ordered behavior guidance.
- Knowledge contributes a compact discovery table.
- Hooks may contribute an explicitly supported instruction fallback.

Each region remains owned by its contributor. Global instruction-file
management owns propagation and aliases; it does not own those extensions or
the surrounding authored prose.

## Alias `.gitignore` entries

`gitignoreAliases` controls the managed block between `# axm:start v=1
region=instruction-aliases ext=@agentxm/instructions/aliases` and `# axm:end
v=1 region=instruction-aliases` markers. The canonical source named by
`fileName` is never ignored.

- `true` (default) manages ignore entries for propagated alias files.
- `false` omits managed alias-ignore entries.

## Diagnosis and reconciliation

Use `axm lint` for missing sources, drifted targets, unsupported agent
conventions, stale managed `.gitignore` blocks, and tracked aliases covered by
managed ignore patterns. The tracked-alias finding names
`gitignoreAliases: false` as the reconciling setting. Use `axm sync --preview`
to inspect reconciliation, then `axm sync` to restore configured state.

Transitions fail closed when an alias or managed region is unowned or
ambiguous. Settings and files remain unchanged; there is no generic force flag.
Managed copies carry a structured `axm:file v=1` marker; the banner prose is
guidance rather than an ownership signal. AXM tolerates formatter-only changes
and emits no formatter directives.

## Where to go next

- `axm instructions --help` — command flags and examples
- `axm help settings` — the `instructionFiles` settings shape
- `axm help rules` — installable Rule contributions
- `axm help knowledge` — Knowledge discovery contributions
- `axm help workspace-state` — desired, accepted, and observed state
