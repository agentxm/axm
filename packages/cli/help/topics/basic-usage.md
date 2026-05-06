# Basic usage

AXM is an agent extension manager for coding agents and AI assistants. With one tool,
you can manage agent skills, subagents, commands, and more across agents.

- A common toolkit fo
- Bundle skills, subagents, commands and more with extension packs
- Discover and distribute agent extensions for your platform package ecosystems, including JavaScript, Python, Rust, Java, .NET, Ruby, Go, and more

## How to use AXM

The best way to use AXM is just to ask your agent to do it:

- "Create a new skill to do <x>"
- "Update subagent to do <y>"
- "Disable the doomscroll skill"
- "Publish a new extension pack with my karate-shihan subagent, rei command, and nunchuck skill"

Use `axm help` to see a list of topics on how to use AXM for your specific use case.

You will need to have an AgentXM.ai account to publish extensions to the registry or install private extensions.

## How AXM works

After running `axm setup`, AXM configures a workspace settings file at `.axm/settings.json`. Here the installed extensions (skills, subagents, etc.) will be listed, sometimes with extended metadata Operations will have an effect for any coding agent configured in `$.agents`. Extensions are typically referenced by their full name: `<@owner>/<skills|subagents...>/<name>` and vendored under `.axm/extensions/<@owner>/<type>/<name>`. Non-registry sourced extensions are vendored under `.axm/extensions/external/<type>/<name>`. `.axm` should not be ignored by source control. The `.axm/axm-lock.yaml` file serves to provide additional metadata about resolved metadata at install time.

### Authoring Extensions

An `authored: true` flag in the settings entry for an extension indicates that it is acceptable to make changes to the extension in the workspace. It does not need to be forked or copied prior to modification. This should be set to true for any workspace where you anticpate making and publishing changes for an extension.

## Where to go next

- `axm help getting-started` — first-time setup for a workspace that has
  never used axm.
- `axm help skills` — working with skills
- `axm help exit-codes` — process exit codes and their meaning.
- `axm <command> --help` — flags and examples for any command.
