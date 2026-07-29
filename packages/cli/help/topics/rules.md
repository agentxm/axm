# Rules

A workspace's instruction file is the source of truth that tells every coding
agent how to work in this repo. AXM keeps one file under your control and
propagates it to each configured agent's native convention so you never have to
hand-maintain `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, and friends in parallel.

The governing standard for this extension type is
[AGENTS.md](https://agents.md), the cross-vendor convention for a single
instruction file at the root of a repository. AXM treats that file as the
source of truth and derives every agent-specific alias from it.

## Source of truth

The default source file is `AGENTS.md` at the workspace root. AXM also walks
nested directories: any subdirectory that contains its own `AGENTS.md` becomes
an additional propagation root (e.g., `packages/app/AGENTS.md`).

Pick a different name with `--file` on enable; the choice is persisted in
settings.

## Configuration

Instruction-file management is controlled by `rulesConfig.instructions` in
`.axm/settings.json`.

```jsonc
{
  "agents": ["claude-code", "codex", "gemini-cli"],
  "rulesConfig": {
    "instructions": {
      "fileName": "AGENTS.md",
      "gitignoreAliases": true,
    },
  },
}
```

Three forms:

- **Absent** — unset. AXM does not propagate or report on instruction files.
- **`false`** — explicitly disabled. AXM leaves instruction files alone and
  treats them as manually managed.
- **Object** `{ fileName?, gitignoreAliases? }` — enabled. AXM keeps each
  configured agent's instruction file in sync with the source file.

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

Run `axm rules instructions` to see the mechanism, target file, and health for
each configured agent and propagation root.

## Installable rule extensions

Rule extensions are installable guidance packages. A rule package has a
`rule.json` manifest and a `src/RULE.md` body. Installing a rule injects the
body into the managed `region=rules` block in the workspace instruction source,
then the existing instruction propagation sends that source to configured
agents.

Install, inspect, and remove rules through the `axm rules` group:

```bash
axm rules install @owner/rules/<name>
axm rules list
axm rules show <name>
axm rules uninstall <name>
```

Rules are tracked in `.axm/settings.json` under `rules` and in
`.axm/axm-lock.yaml` under `rules`. `axm rules disable <name>` keeps a rule
installed but omits it from the rendered guidance region; `axm rules enable
<name>` restores it.

Run `axm help rule-schema` to inspect the raw `rule.json` schema.

## Commands

All commands live under `axm rules` and accept `--scope project` (default) or
`--scope user`.

Rule extensions:

- `axm rules new <name>` — scaffold a rule package.
- `axm rules install [source]` — install one rule, or reinstall the configured
  set when the source is omitted.
- `axm rules list` — inventory detected rules and their lifecycle
  classification.
- `axm rules show <name>` — installed-state detail for one rule.
- `axm rules enable <name>` / `axm rules disable <name>` — activate or
  deactivate an installed rule.
- `axm rules update [source] [--name <glob>]` — update configured rules.
- `axm rules uninstall <name>` — remove a rule.

Instruction-file management:

- `axm rules instructions` — show source file, target file, mechanism, and
  health for each configured agent.
- `axm rules instructions enable [--file AGENTS.md] [--gitignore|--no-gitignore]`
  — turn management on and write the resolved config to settings.
- `axm rules instructions disable` — set `instructions: false` so AXM stops
  touching instruction files.

## Diagnosis and repair

Use `axm lint` for instruction-file diagnostics. It reports missing source
files, missing or drifted agent targets, unsupported agent conventions, and
stale managed `.gitignore` blocks.

Use `axm lint --fix` to repair autofixable instruction drift. `axm sync` also
propagates configured instruction files after materializing extension and
context files.

## Alias gitignore propagation

The `gitignoreAliases` option controls whether AXM writes managed ignore entries
for propagated alias files in `.gitignore`. AXM only manages a single block
between `# >>> axm:instructions >>>` and `# <<< axm:instructions <<<` markers,
so hand-edited entries outside the block are left untouched. The source-of-truth
file named by `fileName` is never added to the managed ignore block.

- `true` (default) — manage the block inside `.gitignore` so collaborators do
  not see propagated alias files such as `CLAUDE.md` or `GEMINI.md`.
- `false` — do not write any ignore entries.

## Authoring the source file

Edit `AGENTS.md` directly. Once enabled, `axm sync` (and any install/remove
that touches agent state) keeps each agent's instruction file aligned with the
source on every run.

## Where to go next

- `axm rules --help` — full command surface
- `axm help settings` — workspace state and `rulesConfig`
- `axm help settings-schema` — exact `rulesConfig.instructions` shape
- `axm agents list` — configured, detected, and supported coding-agent IDs
