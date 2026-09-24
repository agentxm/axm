import { formatLearnMore } from "../../formatter.js";
import { commandHelpDoc } from "../../root/help/command-help-view.js";

/**
 * `axm --help`: root help as the Screen paints it — the masthead, then the
 * command groups, with an inverse command folded into the row of the command
 * it reverses and the compact groups wrapped as name lists.
 */
export const helpRoot = commandHelpDoc({
  type: "help",
  description: "Open extension manager for AI coding agents.",
  usage: "axm <subcommand> [flags]",
  flags: [],
  globalFlags: [
    { name: "help", aliases: ["-h"], type: "boolean", required: false },
    { name: "verbose", aliases: ["-v"], type: "boolean", required: false },
    { name: "quiet", aliases: ["-q"], type: "boolean", required: false },
    { name: "json", aliases: ["-j"], type: "boolean", required: false },
    { name: "directory", aliases: ["-C"], type: "directory", required: false },
  ],
  subcommands: [
    {
      group: "GETTING STARTED",
      commands: [
        { name: "setup", description: "Set up AXM in the current project" },
        { name: "help", shortDescription: "Show topic or command help" },
      ],
    },
    {
      group: "EXTENSION TYPES",
      commands: [
        { name: "skills", description: "Manage skills" },
        { name: "mcps", description: "Manage MCP servers" },
        { name: "subagents", description: "Manage subagents" },
        { name: "rules", description: "Manage rules" },
        { name: "hooks", description: "Manage hook extensions" },
        { name: "knowledge", description: "Browse Open Knowledge Format bundles" },
        { name: "packs", description: "Manage packs" },
      ],
    },
    {
      group: "PUBLISHED EXTENSIONS",
      commands: [
        { name: "yank", shortDescription: "Exclude a version from fresh resolution" },
        { name: "unyank", description: "Restore one exact version to fresh resolution" },
        {
          name: "archive",
          shortDescription: "Block new releases; history keeps resolving",
        },
        { name: "unarchive", description: "Restore publication for an archived identity" },
      ],
    },
    {
      group: "AUTH",
      commands: [
        { name: "login", description: "Sign in to a registry" },
        { name: "logout", description: "Sign out of a registry" },
        { name: "whoami", description: "Show current authenticated identity" },
      ],
    },
  ],
  learnMore: formatLearnMore([
    ["axm help getting-started", "Set up AXM in a new workspace"],
    ["axm help", "Browse all help topics"],
  ]),
});
