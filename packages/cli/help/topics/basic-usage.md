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

## How AXM works

_Extensions_ are agent extensions managed by AXM: skills, MCP servers, subagents, rules, hooks, knowledge bundles, and extension packs.

After running `axm setup`, AXM configures a workspace settings file at [`.axm/settings.json`](https://axm.sh/schemas/settings.schema.json). Installed extensions are listed there, sometimes with extended metadata. Management operations apply to every coding agent configured in `$.agents`.

Use `axm agents list` to inspect configured and detected coding agents. Use
`axm agents add <id>` or `axm agents remove <id>` for day-2 agent changes so
AXM also creates or removes the per-agent managed artifacts for installed
extensions. `axm setup` only initializes an absent scope; rerunning it never
changes existing agent membership.

Extensions are typically referenced by their full name: `<@owner>/<skills|subagents|...>/<name>` and vendored under `.axm/extensions/<@owner>/<type>/<name>`. Non-registry sourced extensions are vendored under `.axm/extensions/external/<type>/<name>`. `.axm` should not be ignored by source control. `.axm/settings.json` declares intent, `.axm/trust.json` preserves security-critical source identity, and the v3 `.axm/axm-lock.yaml` file records optional resolution and materialization receipt history. Agent-specific paths and render state are derived from settings, manifests, AXM ownership markers, and the local workspace.

### Authoring and editing extensions

Authorship derives from a `workspace:@owner/<plural-type>/<name>` source. Commands
such as `axm <type> new` and `axm adopt <fqn>` create this relationship; there is
no separate authored flag. Edit the canonical package under
`.axm/extensions/<@owner>/<type>/<name>`, then run `axm sync` to refresh rendered
agent artifacts.

### Publishing extensions

Use `axm publish` to publish all extensions authored in the selected workspace,
or pass explicit selectors. AXM preflights the full selection before uploading
anything. Bare and filter-only bulk selections verify byte-identical published
versions and skip them as successful no-ops; an integrity mismatch blocks every
upload. Explicit names, FQNs, globs, and multiple selectors remain strict unless
`--on-existing verify` is supplied. Use `--on-existing error` to make a bulk
selection strict, and `--backfill` only for an unpublished version below the
highest published SemVer. `axm version` only changes workspace-sourced manifests.

Use `axm list` for the fast, local inventory across all extension types.
`axm list --outdated` and `axm list --deprecated` perform remote checks against
each installed extension's recorded source and report incomplete coverage.

### Project and user scope

Installed-state commands accept `--scope project|user`; project is the default.
The selected scope is isolated for setup, install, update, activation, listing,
status, sync, lint, pruning, agent membership, and pack lifecycle operations.
Runnable recovery suggestions retain a non-default user scope.

Authoring commands are project-workspace only: `new`, `fork`, `import`, adopt,
demote, version, pack authoring, and publish do not accept `--scope`. Create authored
packages in the project workspace, then install published versions into user
scope when user-level availability is needed.

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

AXM stores env and header secrets as `${VAR}` references in `.axm/settings.json`
and syncs the configured MCP servers into each configured agent.

## Where to go next

**Use `axm help` to see a list of topics and select the one relevant to your task.**

- `axm help getting-started` — first-time setup for a workspace that has never used AXM
- `axm help settings` — `.axm/settings.json` fields
- `axm help workspace-state` — desired, observed, trust, and receipt semantics
- `axm help settings-schema` — `.axm/settings.json` raw JSON Schema
- `axm agents list` — configured, detected, and supported coding-agent IDs
- `axm help skills` — working with skills
- `axm help subagents` — working with subagents
- `axm help rules` — instruction-file propagation and installable rule extensions
- `axm help packs` — working with packs
- `axm view <fqn> [version|versions]` — inspect published extension metadata
- `axm help exit-codes` — process exit codes and their meaning
- `axm <command> --help` — flags and examples for any command
