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
  description: "Install extensions from a Registry, Git, or path source",
  usage: "axm install [flags] <source>",
  args: [
    {
      name: "source",
      type: "string",
      required: true,
      aliases: [],
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
      description: "Workspace scope",
      choices: [{ value: "project" }, { value: "user" }],
      default: "project",
    },
    {
      name: "all",
      aliases: [],
      type: "boolean",
      required: false,
      description: "Install everything the source offers without prompting",
      default: false,
    },
    {
      name: "ignore-release-age",
      aliases: [],
      type: "boolean",
      required: false,
      description:
        "Take a release younger than the configured minimum release age, for this run only",
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
      type: "path",
      required: false,
      description:
        "Run as if AXM was started in this directory (relative paths resolve from there)",
    },
  ],
  examples: [
    {
      command: "axm install @acme/skills/code-review",
      description: "Install a skill by registry FQN",
    },
    {
      command: "axm install --all github:acme/agent-extensions",
      description: "Install every extension from a Git source",
    },
  ],
  learnMore: formatLearnMore([
    ["axm help basic-usage", "Managing extensions and agents for an AXM workspace"],
    ["axm help skills", "How skill extensions work"],
  ]),
});
