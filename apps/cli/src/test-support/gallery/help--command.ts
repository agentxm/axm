import { formatLearnMore } from "../../formatter.js";
import { commandHelpDoc } from "../../root/help/command-help-view.js";

/**
 * `axm install --help`: the command-help view as the Screen paints it. The
 * sections are the machine help document's, and the painter decides the
 * value column, wraps the descriptions to the width, and keeps every usage
 * pattern and example invocation whole.
 */
export const helpCommand = commandHelpDoc({
  type: "help",
  description:
    "Install extensions from Registry, Git, or path sources, or reinstall configured sources",
  usage: "axm install [flags] [<source>]",
  args: [
    {
      name: "source",
      type: "string",
      required: false,
      variadic: false,
      description:
        "Registry FQN (@owner/<plural-type>/<name>[@version]), self-describing Git locator, or path locator",
    },
  ],
  flags: [
    {
      name: "scope",
      aliases: [],
      type: "choice",
      required: false,
      description:
        "Install to project (default) or user-level configuration (choices: project, user)",
    },
    {
      name: "all",
      aliases: [],
      type: "boolean",
      required: false,
      description: "Install every matching extension without prompting",
    },
    {
      name: "ignore-release-age",
      aliases: [],
      type: "boolean",
      required: false,
      description:
        "Take a release younger than the configured minimum release age, for this run only",
    },
    {
      name: "env",
      aliases: ["e"],
      type: "string",
      required: false,
      description: "Provide an MCP input value as KEY=VALUE; repeatable",
    },
  ],
  globalFlags: [
    {
      name: "json",
      aliases: ["j"],
      type: "boolean",
      required: false,
      description: "Output machine-readable JSON",
    },
    {
      name: "directory",
      aliases: ["C"],
      type: "directory",
      required: false,
      description:
        "Run as if AXM was started in this directory (relative paths resolve from there)",
    },
  ],
  examples: [
    { command: "axm install", description: "Reinstall all configured extensions" },
    {
      command: "axm install @acme/skills/code-review",
      description: "Install a skill by registry FQN",
    },
  ],
  learnMore: formatLearnMore([
    ["axm help basic-usage", "Managing extensions and agents for an AXM workspace"],
    ["axm help skills", "How skill extensions work"],
  ]),
});
