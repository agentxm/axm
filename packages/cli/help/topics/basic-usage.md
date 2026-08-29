# Basic usage

AXM is the agent extension manager for coding agents and AI assistants.

<!-- axm:generated:extension-type-list -->

AXM manages skills, MCP servers, subagents, rules, hooks, knowledge bundles, and packs.

<!-- /axm:generated -->

- One tool to manage every extension type above across every configured agent.
- Bundle compatible extension types with packs
- Package and publish your extensions to the AgentXM.ai registry
- Discover and distribute agent extensions for your platform package ecosystems, including JavaScript, Python, Rust, Java, .NET, Ruby, Go, and more

## How to use AXM

The best way to use AXM is just to ask your agent to do it:

- "Create a new skill to do <x>"
- "Update subagent to do <y>"
- "Disable the doomscroll skill"
- "Publish a new pack with my karate-shihan subagent and nunchuck skill"

Use `axm help` to see a list of topics on how to use AXM for your specific use case.

You will need to have an AgentXM.ai account to publish extensions to the registry or install private extensions.

### Management boundary

AXM owns extension packages and lifecycle: canonical and workspace state,
projection into configured agents, composition, installation, distribution,
activation, versioning, and removal. Creating or editing an extension can also
require a semantic authoring workflow; use AXM to resolve the canonical package,
then edit it only when the workspace owns that authored source. Registry, Git,
and local-source packages are immutable accepted state; use `axm fork` to create
an authored copy before customizing one. Never edit a generated agent projection.

For MCP, AXM owns connection configuration and packaging: commands, URLs,
arguments, environment-variable references, headers, installation, and
projection. Implementing or debugging the MCP server software itself is an
ordinary software-development task, not an AXM management operation.

Read the one relevant `axm help <topic>` or `axm <command> --help` entry after
identifying the extension type and operation. Live help owns current command
syntax, output fields, and recovery steps.

## How AXM works

_Extensions_ are agent extensions managed by AXM: skills, MCP servers, subagents, rules, hooks, knowledge bundles, and extension packs.

After running `axm setup`, AXM configures project desired state in
[`axm.json`](https://axm.sh/schemas/settings.schema.json) and accepted external
resolutions in `axm-lock.yaml`. Installed extensions are listed in `axm.json`,
sometimes with extended metadata. Management operations apply to every coding
agent configured in `$.agents`.

Use `axm agents list` to inspect configured and detected coding agents. Use
`axm agents add <id>` or `axm agents remove <id>` for day-2 agent changes so
AXM also creates or removes the per-agent managed artifacts for installed
extensions. `axm setup` only initializes an absent scope; rerunning it never
changes existing agent membership.

Extensions are typically referenced by their full name:
`<@owner>/<skills|subagents|...>/<name>`. Acquired project packages are committed
under `agent_extensions/<source-name>/<source-full-name>`. For example, an
AgentXM Registry package uses
`agent_extensions/agentxm/<@owner>/<type>/<name>`, while a GitHub subpath uses
`agent_extensions/github/<owner>/<repo>/<subpath>`. `axm.json` and authored pack
manifests declare intent; the v6 `axm-lock.yaml` records accepted immutable
resolutions and the exact materialized-tree integrity of desired external
extensions. Project-authored packages live directly under type roots such as
`skills/<name>`, `rules/<name>`, and `packs/<name>`; each root can be changed by
its corresponding `*Config.dir` setting. `.axm/` is ignored project runtime
state. Agent-specific paths and render state are observed or derived; they are
not authority. User scope mirrors the same installed-state contract beneath
`~/.axm/workspace/`: `axm.json`, `axm-lock.yaml`, `agent_extensions/`, and an
inner `.axm/` runtime directory. Agent-native user projections remain in each
agent's native user root.

### Authoring and editing extensions

Authorship derives from the exact `workspace` source in the map entry whose key
matches the package manifest name. Commands such as `axm <type> new` and `axm
adopt <extension>` create this relationship; there is no separate authored
flag. Edit the canonical package under its configured type root, then run `axm
sync` to refresh rendered agent artifacts.

### Publishing extensions

Use `axm publish` to publish all extensions authored in the selected workspace,
or pass explicit selectors for authored extensions. Bare, filtered, and
explicit selections never publish installed Registry, Git, or local-source
packages. Use `axm adopt <extension>` when this workspace should own retained
canonical content, or `axm fork <source> <extension>` for a separately authored
identity.

AXM preflights the full selection before uploading anything. Bare and
filter-only selections rebuild each authored archive, verify its SHA-512 digest
against an existing immutable version, and skip a match as a successful no-op;
a mismatch blocks every upload. Explicit names, FQNs, globs, and multiple
selectors remain strict unless `--on-existing verify` is supplied. Use
`--on-existing error` to make a bulk selection strict, and `--backfill` only for
an unpublished version below the highest published SemVer. `axm version` only
changes workspace-sourced manifests. Run `axm help publish` for the full
selection and integrity boundary.

Use `axm list` for the fast, local inventory across all extension types.
`axm list --outdated` and `axm list --deprecated` perform remote checks against
each installed extension's recorded source and report incomplete coverage.

### Project and user scope

Installed-state commands accept `--scope project|user`; project is the default.
The selected scope is isolated for setup, install, update, activation, listing,
sync, lint, agent membership, and pack lifecycle operations.
Runnable recovery suggestions retain a non-default user scope.

Authoring commands are project-workspace only: `new`, `fork`, `skills import`,
`subagents import`, adopt, demote, version, pack authoring, and publish do not
accept `--scope`. Create authored packages in the project workspace, then
install published versions into user scope when user-level availability is
needed.

The surrounding `~/.axm/` directory is application state, not the user
workspace. A script install places the executable in `~/.axm/bin/axm` and its
ownership record in `~/.axm/install-meta.json`. Pending login may also appear
there temporarily. Update-check state uses the platform cache directory, and
AXM does not create `trust.json`.

### Enabling and disabling extensions

AXM makes it easy to enable or disable extensions on the fly.

- `axm skills disable doomscroll`
- `axm subagents enable karate-shihan`

### MCP servers

Use `axm mcps add` to configure MCP servers you already know about without
publishing them first.

```bash
axm mcps add linear --command "npx -y linear-mcp-server" --env LINEAR_API_KEY
axm mcps add sentry --url https://mcp.sentry.dev/sse --header 'Authorization:Bearer ${SENTRY_TOKEN}'
axm mcps import
axm sync
```

AXM stores env and header secrets as `${VAR}` references in `axm.json`
and syncs the configured MCP servers into each configured agent.

### Mutation consent

An explicit, eligible mutation applies without a redundant confirmation prompt.
Use `--preview` to inspect the exact candidate without writing, including in
combination with `--yes`. AXM prompts only for a confirmable semantic risk;
`--yes` preapproves that risk for the current invocation.

Named policy overrides remain independent. `--yes` never substitutes for
`--ignore-version-constraints` or `--accept-warnings`. In non-interactive and JSON contexts,
AXM never opens a prompt: it either applies an eligible candidate or returns a
structured reason and a safe recovery action.

## Where to go next

**Use `axm help` to see a list of topics and select the one relevant to your task.**

- `axm help getting-started` — first-time setup for a workspace that has never used AXM
- `axm help settings` — `axm.json` fields and user-scope differences
- `axm help workspace-state` — desired, accepted-resolution, and observed semantics
- `axm help settings-schema` — raw settings JSON Schema
- `axm agents list` — configured, detected, and supported coding-agent IDs
- `axm help skills` — working with skills
- `axm help subagents` — working with subagents
- `axm help rules` — instruction-file propagation and installable rule extensions
- `axm help packs` — working with packs
- `axm help publish` — authored selection and immutable archive verification
- `axm view <extension> [version|versions]` — inspect published extension metadata
- `axm help exit-codes` — process exit codes and their meaning
- `axm <command> --help` — flags and examples for any command
