# Basic usage

AXM is an agent extension manager for coding agents and AI assistants.

- One tool to manage agent skills, subagents, commands, and more across agents.
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

_Extensions_ are agent extensions managed by AXM: skills, subagents, and commands. Coding agents may have other extensibility mechanisms (e.g. hooks, plugins, etc.) that aren't managed by AXM.

After running `axm setup`, AXM configures a workspace settings file at [`.axm/settings.json`(https://axm.sh/schemas/settings.schema.json). Here the installed extensions will be listed, sometimes with extended metadata. Management operations will have an effect for any coding agent configured in `$.agents`. Extensions are typically referenced by their full name: `<@owner>/<skills|subagents...>/<name>` and vendored under `.axm/extensions/<@owner>/<type>/<name>`. Non-registry sourced extensions are vendored under `.axm/extensions/external/<type>/<name>`. `.axm` should not be ignored by source control. The `.axm/axm-lock.yaml` file serves to provide additional metadata about resolved metadata at install time.

### Updating Extensions

### Authoring and Editing Extensions

An `authored: true` flag in the settings entry for an extension indicates that it is acceptable to make changes to the extension in the workspace. This should be set to true for any workspace where you anticipate making and publishing changes for an extension.

Make any desired changes to authored extensions inside the extension's directory `.axm/extensions/<@owner>/<type>/<name>` per the apprpriate help topic for
that extension type, followed by `axm sync` to render the changes to different coding agent folders and configurations.

### Publishing Extensions

Use `axm view` to get the latest published version and use `axm version` to bump if needed.

### Enabling/Disabling Extensions

AXM makes it easy to enable or disable extensions on the fly.

- `axm skills disable doomscroll`
- `axm subagents enable karate-shihan`
-

### Ignoring Extensions

It's possible to ignore pre-existing skills and other extensions in your workspace so that AXM won't modify or prune them. This is helpful when these extensions are installed/managed by some other tool or mechanism.

## Where to go next

**Use `axm help` to see a list of topics and select the one relevant to your task.**

- `axm help getting-started` — first-time setup for a workspace that has
  never used AXM.
- `axm help skills` — working with skills
- `axm help subagents` — working with subagents
- `axm help commands` — working with slash commands
- `axm help exit-codes` — process exit codes and their meaning.
- `axm <command> --help` — flags and examples for any command.
