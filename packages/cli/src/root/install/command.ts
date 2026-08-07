import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { scopeFlag } from "../../cli-flags.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleInstall } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      'Registry FQN (@owner/<plural-type>/<name>[@version]) or source locator; provider shorthand uses a final @ref, and shorthand refs cannot contain "/"',
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the extension already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    handleInstall({ source, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Install extensions from a registry FQN or source locator, or reinstall configured extensions",
  ),
  Command.withExamples([
    {
      command: "axm install",
      description: "Reinstall all configured extensions from their sources",
    },
    {
      command: "axm install @acme/skills/code-review",
      description: "Install a skill by fully qualified registry name",
    },
    {
      command: "axm install @acme/hooks/session-audit@^1.2.0",
      description: "Install a hook with a version constraint",
    },
    {
      command: "axm install github:acme/agent-extensions//tools@v1.0.0",
      description:
        "Discover and install skills, MCP servers, subagents, rules, hooks, and knowledge from a locator",
    },
    {
      command: "axm install @acme/packs/frontend-tools --preview",
      description: "Preview a pack install from the registry",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help getting-started", "How to set up and configure AXM"],
      ["axm help basic-usage", "How to use AXM"],
    ]),
  ),
);
