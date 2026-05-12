# Getting started

Use this when the current workspace has never been managed by AXM before. It
walks through first-time setup. Once `.axm/` exists, switch to
`axm help basic-usage`.

AXM manages agent extensions for a workspace: skills, commands, MCP servers,
subagents, and packs. A workspace is the project (or user) directory whose
extensions AXM tracks.

## Confirm AXM is installed

```bash
axm --version
```

If this fails, follow the install bootstrap at `https://axm.sh/install.md`
before continuing. Do not invent a runner fallback such as `bunx`, `pnpx`, or
`npx` — they skip `axm setup` and split state across cached versions.

## Initialize the workspace

Run setup in the project you want AXM to manage:

```bash
axm setup
```

Setup is idempotent. It creates `.axm/`, detects supported coding agents,
records workspace settings, and writes the resolution lockfile. Read
`axm help basic-usage` to learn what those files do and which ones must be
checked in.

For non-interactive environments, pass `--yes`. To pin which agents AXM
configures, pass one or more `--agent <id>` flags instead of relying on
auto-detection.

## Add your first extension

Once setup is complete, install extensions in one of these ways:

```bash
axm discover --json                              # suggestions from project deps
axm install @profile/skills/<name> --yes         # install a known registry FQN
axm skills install owner/repo --yes              # install from a GitHub source
```

`axm discover` is read-only and a good starting point when you do not already
know what to install.

## Where to go next

- `axm help basic-usage` — what each workspace file is for, what is safe to inspect, what changes state, and what must be checked in
- `axm help settings` — `.axm/settings.json` fields and schema
- `axm help skills` — anatomy of a native managed skill on disk
- `axm <command> --help` — flags and examples for any command
- `axm help` — list every available help topic
