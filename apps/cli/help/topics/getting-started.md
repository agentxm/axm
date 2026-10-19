# Getting started

Use this when the current workspace has never been managed by AXM before. It
walks through first-time setup. Finish when setup and verification succeed in the
selected scope. For later workspace operations, `axm help basic-usage` explains
its files and authority.

<!-- axm:extension-type-list -->

AXM manages skills, MCP servers, subagents, rules, hook extensions, knowledge bundles, and packs.

<!-- /axm:extension-type-list -->

A workspace is the project (or user) directory whose extensions AXM tracks.

## Confirm AXM is installed

```bash
axm --version
```

If this fails, follow the install bootstrap at `https://axm.sh/install.md`
before continuing. Do not invent a runner fallback such as `bunx`, `pnpx`, or
`npx` — they skip `axm setup` and split state across cached versions.

## If the host blocks an operation

Use the coding agent's native permission flow for the exact AXM command or
filesystem/network operation it blocked. Review that operation's scope before
allowing it; setup needs no blanket all-commands tool grant.

## Initialize the workspace

Run setup in the project you want AXM to manage:

```bash
axm setup
```

Setup is initialization-only. When the selected scope has no settings, it
detects project and workstation signals separately, presents the proposed agent
set and file plan, and asks for confirmation before it writes `axm.json` and the
initial agent membership. Ignored `.axm/` runtime state is created on demand;
its absence after setup is valid. Project signals are preselected for project setup;
when no project evidence exists, workstation detections remain visible but
unselected. Choose membership explicitly. With no evidence, setup offers all available agents with none
preselected and asks you to choose. Running setup again is a no-op, even
when different `--agent` flags are supplied, with one exception described
below. `axm help basic-usage` explains those files and their commit policy
when you need that reference.

Installing into a project that has no settings starts the same setup once you
have selected what to install, so `axm install <source>` is also a way in. An
install that cannot ask — in CI, or driven by an agent — establishes only the
agents and the selection, and records no instruction-file choice. Rules and
Knowledge reach agents through instruction files, so that install names
`axm setup` as its next step. Setup then asks the instruction questions it
would have asked, or takes the documented default under `--yes`, and leaves
agent membership and installed extensions as they are. Follow it with
`axm sync` to bring installed Rules and Knowledge into the instruction files.

Setup may add AXM runtime and package-transaction entries to `.gitignore` in a
Git-managed project. It does not edit `.gitattributes` or formatter
configuration. Exclude acquired `agent_extensions/` content from mutating
formatters, lint fixes, and save-time rewrites; `axm help workspace-state`
explains strict package integrity and how to diagnose checkout-only drift.

For automation, preview the exact candidate first:

```bash
axm setup --preview --scope project --json --non-interactive
```

Review `result.agents`, `result.agentCandidates`, `result.scopeSupport`, and
`result.steps`, then apply that exact agent set with explicit approval and
scope:

```bash
axm setup --yes --scope project --agent claude-code --non-interactive
```

Repeat `--agent <id>` for every approved agent and carry the resolved instruction
choice with `--instructions AGENTS.md` (or a custom source filename), or
`--instructions off`. Omission defaults to enabled `AGENTS.md` for preview and
unattended setup, and asks interactively. This project-only option settles an
unresolved choice; use `axm instructions enable/disable` for later changes.
A file literally named off is selected with `--instructions ./off`.

Enabled setup with no instruction content creates no empty source or aliases.
Its recorded choice is settled; lint and sync do not require scaffolding. Existing
content or the first eligible Rule/Knowledge contribution creates the required
source and aliases through reconciliation. Existing source and alias conflicts
remain protected and visible in the exact preview.

Repeat `--agent <id>` for every approved agent. An unattended first setup that
omits `--yes`, an explicit `--scope`, or all `--agent` flags exits with the
stable reason `approval-required` and writes nothing.

## Understand scope support

Setup reports the effective scope contract for every extension category and
selected agent. Each `result.scopeSupport[*].outcomes[*]` row has a stable
`status`, `reasonCode`, and human-readable `reason`:

- `supported` — AXM can operate that category at the selected scope.
- `project-only` — the surface is intentionally available only from a project
  workspace; AXM does not fall back to it during user-scope setup.
- `unsupported` — the agent or AXM integration does not provide that
  capability.
- `refused` — the agent has a native surface, but AXM has not modeled a safe
  target for the selected scope.

Skills, MCP servers, subagents, and hooks report per-agent outcomes. Rules also
report per-agent instruction-file projection alongside their workspace-owned
package outcome. Knowledge bundles and packs report workspace/container
outcomes. Preview and apply derive this matrix from the same selected agents and
scope; setup never silently reads or writes the other scope. Human output lists
only the outcomes that are not `supported`, with their reasons; the JSON matrix
carries every outcome.

Setup previews include selected and detected candidates. For the complete catalog,
use `axm agents list --available --json`; the interactive picker still offers all
valid choices.

After setup, use `axm agents list` to inspect configured and detected coding
agents. The `Configured`, `Project`, and `Workstation` columns distinguish
membership from evidence. Machine rows use `projectDetected` and `userDetected`;
`userDetected` means workstation evidence, not user-scope AXM membership or
proof of installation. `--detected` selects either kind of evidence, including
when combined with `--available`. If you adopt another coding agent later, run `axm agents add <id>`;
use `axm agents remove <id>` when retiring one. Do not rerun setup or hand-edit
`settings.agents`, because the membership commands also create or remove the
owned per-agent artifacts for installed extensions atomically.

Keep the selected scope on follow-up commands. For user scope, use `axm agents
list --scope user`, `axm sync --preview --scope user`, `axm lint --scope user`,
and `axm list --scope user`. Discovery and Git-hook setup are project-only.

## Add your first extension

Once setup is complete, install extensions in one of these ways:

```bash
axm discover --json                              # suggestions from project deps
axm install @profile/skills/<name>               # install a known registry FQN
axm skills install owner/repo                    # install from a GitHub source
```

`axm discover` is read-only and a good starting point when you do not already
know what to install.

## Where to go next

- `axm help basic-usage` — what each workspace file is for, what is safe to inspect, what changes state, and what must be checked in
- `axm help settings` — `axm.json` fields and user-scope differences
- `axm help workspace-state` — desired, accepted-resolution, and observed semantics
- `axm help settings-schema` — raw settings JSON Schema
- `axm help skills` — anatomy of a native managed skill on disk
- `axm <command> --help` — flags and examples for any command
- `axm help` — list every available help topic
