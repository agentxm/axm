# Instructions

A workspace's instruction file is the source of truth that tells every coding
agent how to work in this repo. AXM keeps one file under your control and
propagates it to each configured agent's native convention so you never have to
hand-maintain `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, and friends in parallel.

## Source of truth

The default source file is `AGENTS.md` at the workspace root. AXM also walks
nested directories: any subdirectory that contains its own `AGENTS.md` becomes
an additional propagation root (e.g., `packages/app/AGENTS.md`).

Pick a different name with `--file` on enable; the choice is persisted in
settings.

## Configuration

Instruction-file management is controlled by `agentsConfig.instructions` in
`.axm/settings.json`.

```jsonc
{
  "agents": ["claude-code", "codex", "gemini-cli"],
  "agentsConfig": {
    "instructions": {
      "fileName": "AGENTS.md",
      "gitignore": true,
    },
  },
}
```

Three forms:

- **Absent** — unset. AXM does not propagate or report on instruction files.
- **`false`** — explicitly disabled. AXM leaves instruction files alone and
  treats them as manually managed.
- **Object** `{ fileName?, gitignore? }` — enabled. AXM keeps each configured
  agent's instruction file in sync with the source file.

Prefer the CLI over hand-editing — it normalizes the shape and reconciles
existing on-disk files through `axm lint --fix` or `axm sync`.

## Per-agent propagation

Each agent declares how it consumes instructions. AXM picks the mechanism
automatically:

- **Native `AGENTS.md`** — the agent reads `AGENTS.md` directly. No
  propagation needed.
- **Own file** — the agent expects its own filename (e.g., `CLAUDE.md`,
  `GEMINI.md`). AXM symlinks that file to the source `AGENTS.md`, falling back
  to a copy when the filesystem does not support symlinks (e.g., Windows
  without developer mode).
- **Rules directory** — agents that only read a `rules/` directory (e.g., some
  Cursor setups) are currently reported as `unsupported`; manage those files
  manually.

Run `axm agents instructions` to see the mechanism, target file, and health
for each configured agent and propagation root.

## Commands

All commands live under `axm agents instructions` and accept `--scope project`
(default) or `--scope user`.

- `axm agents instructions enable [--file AGENTS.md] [--gitignore|--no-gitignore]`
  — turn management on and write the resolved config to settings.
- `axm agents instructions disable` — set `instructions: false` so AXM stops
  touching instruction files.
- `axm agents instructions` — show source file, target file, mechanism, and
  health for each configured agent (default action with no subcommand).

## Diagnosis and repair

Use `axm lint` for instruction-file diagnostics. It reports missing source
files, missing or drifted agent targets, unsupported agent conventions, and
stale managed `.gitignore` blocks.

Use `axm lint --fix` to repair autofixable instruction drift. `axm sync` also
propagates configured instruction files after materializing extension and
context files.

## gitignore propagation

The `gitignore` option controls whether AXM also writes managed ignore entries
for propagated files in `.gitignore`. AXM only manages a single block between
`# >>> axm:instructions >>>` and `# <<< axm:instructions <<<` markers, so
hand-edited entries outside the block are left untouched.

- `true` (default) — manage the block inside `.gitignore` so collaborators do
  not see propagated `CLAUDE.md` or `GEMINI.md` files.
- `false` — do not write any ignore entries.

## Authoring the source file

Edit `AGENTS.md` directly. Once enabled, `axm sync` (and any install/remove
that touches agent state) keeps each agent's instruction file aligned with the
source on every run.

## Where to go next

- `axm agents instructions --help` — full subcommand surface
- `axm help settings` — workspace state and `agentsConfig`
- `axm help settings-schema` — exact `agentsConfig.instructions` shape
- `axm agents list` — configured, detected, and supported coding-agent IDs
