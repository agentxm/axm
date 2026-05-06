# Basic usage

Read this before doing anything in an axm workspace. It is the pre-req
knowledge that is not in any single `--help` page: what an axm workspace
contains, which files are managed, what must be committed, and how to act
without surprising the user. Per-command syntax lives in
`axm <command> --help` — this topic does not duplicate it.

If `.axm/` does not exist yet, read `axm help getting-started` first.

## What axm manages

axm is an extension manager for AI coding agents. Each workspace has:

- **Configured extensions** — declared in workspace settings, resolved through
  the registry, and vendored into `.axm/extensions/`.
- **Unmanaged content** — agent files on disk that axm did not place
  (hand-authored skills, files from another tool, files from a script). axm
  detects them but does not own them.
- **Agent discovery paths** — per-agent symlinks (for example
  `.claude/skills/<name>`, `.codex/skills/<name>`) that axm materializes from
  installed extensions so each agent finds what it expects.

`axm setup` produces this layout. `axm install`, `axm update`, `axm uninstall`,
and `axm prune` change it. `axm lint` and `axm <type> list --json` describe it
without changing it.

## Key files

| Path                                                    | Role                                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.axm/settings.json`                                    | Workspace config: declared extensions, agents, registry settings, ignored patterns. The intent.                                                                  |
| `axm-lock.yaml`                                         | Resolution lockfile: exact resolved versions, source URLs, integrity, plus install metadata (resolution timestamps, source kinds, registry origin). The receipt. |
| `.axm/extensions/<owner>/<type>/<name>/`                | Vendored extension source: `skill.json`, `src/SKILL.md`, etc. The payload.                                                                                       |
| `<agent-dir>/<type>/<name>` (e.g. `.claude/skills/foo`) | Agent discovery symlinks created by axm — never edit through them.                                                                                               |
| `$AXM_USER_HOME/.axm/...` or `~/.axm/...`               | User-scope mirror of the same layout. Project scope wins on conflict.                                                                                            |

User-scope settings, lockfile, and credentials apply across every project that
runs axm on the machine. Pass `--scope user` on supported commands to operate
on that scope.

## Commit policy

**Do not add `.axm/` or `axm-lock.yaml` to `.gitignore`.** Both must be
checked in.

- `.axm/settings.json` is workspace configuration — collaborators and CI need
  it to reproduce the same set of extensions.
- `.axm/extensions/` is **vendored** extension source. Committing it means the
  workspace works offline, in restricted CI, and at the exact code that was
  reviewed. It also lets agents read installed skills directly without a
  registry round-trip.
- `axm-lock.yaml` records the resolution that produced the vendored tree —
  versions, source kinds, registry origin, integrity, and timestamps. Even
  though the extension source is vendored, the lockfile carries resolution
  metadata that the extension files alone do not, and `axm update` /
  `axm outdated` rely on it.

The single thing to leave out is local credentials. `~/.config/axm/credentials.json`
already lives outside any workspace. Use `AXM_TOKEN` in CI and shared
environments — never check tokens into the repo.

## How to act in an existing workspace

1. **Look before changing.** Start with read-only commands:

   ```bash
   axm lint --json
   axm skills list --json
   axm outdated --json
   ```

   Treat `axm lint` as the workspace map — it tells you what is configured,
   what is missing, what is stale, and what is unmanaged.

2. **Discover the right command.** Use `axm --help` for the top-level surface
   and `axm <command> --help` for flags. There is no `axm search` — use
   `axm discover --json` for suggestions and `axm <type> list --json` for the
   installed inventory.

3. **Preview before any mutation.** `--preview` is supported on install,
   update, uninstall, publish, prune, unpack, and any `--force` action. Run
   it before the real command and inspect the plan.

4. **Use `--yes` and `--json` in agent or CI sessions.** `--yes` skips the
   confirmation prompt. `--json` makes output parseable. `--non-interactive`
   disables prompts but does **not** imply `--yes`.

5. **Sync, do not re-declare.** If configured extensions are missing, run
   `axm install` (or `axm <type> install`) to materialize them. Do not edit
   `settings.json` and `axm-lock.yaml` by hand to "fix" drift — let axm
   resolve and write them.

## Safety notes

- axm owns every file under `.axm/extensions/` and every agent discovery
  symlink it created. Do not hand-edit them — axm rewrites them on the next
  run. Edit the source extension instead, or run `axm <type> fork <name>` to
  get an editable local copy.
- A successful command is not a license to commit. Review the diff (including
  `axm-lock.yaml`) before committing so the change matches what you intended.
- If a command prompts and you cannot answer it (background job, agent
  session), cancel and re-run with `--yes` or `--non-interactive`. Do not
  feed unrelated input into the prompt.

## Where to go next

- `axm help getting-started` — first-time setup for a workspace that has
  never used axm.
- `axm help skills` — working with skills
- `axm help exit-codes` — process exit codes and their meaning.
- `axm <command> --help` — flags and examples for any command.
