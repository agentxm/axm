import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";

import { previewFlag, reinstallFlag, yesFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { handleInstallMcpServer } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry MCP server reference (@owner/mcps/name or bare name)"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall an MCP server that already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
  env: Flag.string("env").pipe(
    Flag.withAlias("e"),
    Flag.withDescription("Provide an MCP input value as KEY=VALUE; repeatable"),
    Flag.atLeast(0),
  ),
  as: Flag.string("as").pipe(Flag.withDescription("Install using this local name"), Flag.optional),
  agent: Flag.choice("agent", CONFIGURABLE_AGENT_IDS).pipe(
    Flag.withDescription("Coding agent to target; repeatable (default: all configured agents)"),
    Flag.atLeast(1),
    Flag.optional,
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview, env, agent, as }) =>
    handleInstallMcpServer(
      {
        source,
        env,
        localName: as,
        ...Option.match(agent, {
          onNone: () => ({}),
          onSome: (value) => ({ agents: [...value] }),
        }),
      },
      { yes, force, preview },
    ).pipe(withWorkspace(scope), withRuntime("mcps install")),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Reinstall configured MCP servers from their sources, or install an MCP server from a registry",
  ),
  Command.withExamples([
    {
      command: "axm mcps install",
      description: "Reinstall all configured MCP servers from their sources",
    },
    {
      command: "axm mcps install @acme/mcps/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcps install @acme/mcps/my-server --as work-server",
      description: "Install a second connection under an explicit local name",
    },
    {
      command: "axm mcps install my-server",
      description: "Install using your default owner",
    },
    {
      command: "axm mcps install @acme/mcps/my-server --preview",
      description: "See what would be installed first",
    },
    {
      command: "axm mcps install @acme/mcps/my-server --env API_KEY=abc --env REGION=us",
      description: "Supply multiple MCP input values",
    },
  ]),
);
