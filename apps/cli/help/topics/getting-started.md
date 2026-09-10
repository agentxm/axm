# Getting started

Use this when the current workspace has never been managed by AXM before. It
walks through first-time setup. Once `.axm/` exists, switch to
`axm help basic-usage`.

<!-- axm:generated:extension-type-list -->

AXM manages skills, MCP servers, subagents, rules, hooks, knowledge bundles, and packs.

<!-- /axm:generated -->

A workspace is the project (or user) directory whose extensions AXM tracks.

## Confirm AXM is installed

```bash
axm --version
```

If this fails, follow the install bootstrap at `https://axm.sh/install.md`
before continuing. Do not invent a runner fallback such as `bunx`, `pnpx`, or
`npx` — they skip `axm setup` and split state across cached versions.

## Add AXM CLI to allowed tools

Add the `axm` CLI to the list of allowed tools for your coding agent.

## Initialize the workspace

Run setup in the project you want AXM to manage:

```bash
axm setup
```

Setup is initialization-only. When the selected scope has no settings, it
detects project and workstation signals separately, presents the proposed agent
set and file plan, and asks for confirmation before it creates `.axm/` and the
initial agent membership. Project signals are preselected for project setup;
workstation-only availability remains visible without being treated as project
intent. If no agent is detected, setup offers a small catalog-driven starter
set that you can revise before confirming. Running setup again is a no-op, even
when different `--agent` flags are supplied. Read
`axm help basic-usage` to learn what those files do and which ones must be
checked in.

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
scope; setup never silently reads or writes the other scope.

After setup, use `axm agents list` to inspect configured and detected coding
agents. If you adopt another coding agent later, run `axm agents add <id>`;
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
