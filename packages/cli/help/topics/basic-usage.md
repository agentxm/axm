# Basic usage

AXM is the agent extension manager for coding agents and AI assistants.

- One tool to manage agent skills, subagents, commands, rules, and more across agents.
- Bundle skills, subagents, commands and more with packs
- Package and publish your extensions to the AgentXM.ai registry
- Discover and distribute agent extensions for your platform package ecosystems, including JavaScript, Python, Rust, Java, .NET, Ruby, Go, and more

## How to use AXM

The best way to use AXM is just to ask your agent to do it:

- "Create a new skill to do <x>"
- "Update subagent to do <y>"
- "Disable the doomscroll skill"
- "Publish a new pack with my karate-shihan subagent, rei command, and nunchuck skill"

Use `axm help` to see a list of topics on how to use AXM for your specific use case.

You will need to have an AgentXM.ai account to publish extensions to the registry or install private extensions.

## How AXM works

_Extensions_ are agent extensions managed by AXM: skills, subagents, commands, rules, and extension packs. Coding agents may have other extensibility mechanisms (e.g. hooks, plugins, etc.) that aren't managed by AXM.

After running `axm setup`, AXM configures a workspace settings file at [`.axm/settings.json`](https://axm.sh/schemas/settings.schema.json). Installed extensions are listed there, sometimes with extended metadata. Management operations apply to every coding agent configured in `$.agents`.

Use `axm agents list` to inspect configured and detected coding agents. Use
`axm agents add <id>` or `axm agents remove <id>` for day-2 agent changes so
AXM also creates or removes the per-agent managed artifacts for installed
extensions.

Extensions are typically referenced by their full name: `<@owner>/<skills|subagents|...>/<name>` and vendored under `.axm/extensions/<@owner>/<type>/<name>`. Non-registry sourced extensions are vendored under `.axm/extensions/external/<type>/<name>`. `.axm` should not be ignored by source control. The `.axm/axm-lock.yaml` file records resolved metadata captured at install time.

### Authoring and editing extensions

Authorship derives from a `workspace:@owner/<plural-type>/<name>` source. Commands
such as `axm <type> new` and `axm adopt <fqn>` create this relationship; there is
no separate authored flag. Edit the canonical package under
`.axm/extensions/<@owner>/<type>/<name>`, then run `axm sync` to refresh rendered
agent artifacts.

### Publishing extensions

Use `axm publish` to publish all extensions authored in the selected workspace,
or pass explicit selectors. Use `--on-existing verify` for an idempotent publish
that rejects immutable-version content drift. `axm version` only changes
workspace-sourced manifests.

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

### Ignoring extensions

It's possible to ignore pre-existing skills and other extensions in your workspace so that AXM won't modify or prune them. This is helpful when these extensions are installed/managed by some other tool or mechanism.

## Where to go next

**Use `axm help` to see a list of topics and select the one relevant to your task.**

- `axm help getting-started` — first-time setup for a workspace that has never used AXM
- `axm help settings` — `.axm/settings.json` fields
- `axm help settings-schema` — `.axm/settings.json` raw JSON Schema
- `axm agents list` — configured, detected, and supported coding-agent IDs
- `axm help skills` — working with skills
- `axm help subagents` — working with subagents
- `axm help commands` — working with slash commands
- `axm help rules` — instruction-file propagation and installable rule extensions
- `axm help packs` — working with packs
- `axm view <fqn> [version|versions]` — inspect published extension metadata
- `axm help exit-codes` — process exit codes and their meaning
- `axm <command> --help` — flags and examples for any command
