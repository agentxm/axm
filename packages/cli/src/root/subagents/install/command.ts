import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, reinstallFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstall } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry reference (@owner/subagents/name), GitHub shorthand (owner/repo), local path, or URL",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  subagent: Flag.string("subagent").pipe(
    Flag.withDescription("Cherry-pick specific subagents from a multi-subagent source"),
    Flag.atLeast(0),
  ),
  all: Flag.boolean("all").pipe(
    Flag.withDescription("Install every subagent found in the source without prompting"),
    Flag.withDefault(false),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall a subagent that already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, subagent, all, yes, force, preview }) =>
    handleInstall({ source, subagents: subagent, all }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("subagents install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Reinstall configured subagents from their sources, or install subagents from a registry, GitHub, or local path",
  ),
  Command.withExamples([
    {
      command: "axm subagents install",
      description: "Reinstall all configured subagents from their sources",
    },
    {
      command: "axm subagents install @acme/subagents/researcher",
      description: "Add a researcher subagent to your agents",
    },
    {
      command: "axm subagents install @acme/subagents/researcher@^1.0.0",
      description: "Pin to a specific version range",
    },
    {
      command: "axm subagents install owner/repo",
      description: "Install from a GitHub repository",
    },
    {
      command: "axm subagents install ./path/to/subagents",
      description: "Install from a local directory during development",
    },
    {
      command: "axm subagents install owner/repo --all --yes",
      description: "CI: install all subagents without prompts",
    },
    {
      command: "axm subagents install @acme/subagents/researcher --preview",
      description: "See what would be installed before committing",
    },
  ]),
);
