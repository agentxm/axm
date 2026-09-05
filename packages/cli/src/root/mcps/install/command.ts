import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag, reinstallFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { handleInstallMcpServer } from "./handler.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry MCP server reference (@owner/mcps/name or bare name)"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall an MCP server that already exists")),
  preview: previewCapabilityFlag("Show what would be installed without making changes"),
  env: Flag.string("env").pipe(
    Flag.withAlias("e"),
    Flag.withDescription("Provide an MCP input value as KEY=VALUE; repeatable"),
    Flag.atLeast(0),
  ),
  as: Flag.string("as").pipe(Flag.withDescription("Install using this local name"), Flag.optional),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, force, preview, env, as, ignoreReleaseAge }) =>
    handleInstallMcpServer({ source, env, localName: as }, { force, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("mcps install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
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
