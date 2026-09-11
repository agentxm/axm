import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { handleSetActivation } from "../activation-handler.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";

export const handleEnableMcpServer = (args: { readonly name: string; readonly preview: boolean }) =>
  handleSetActivation(
    { type: "mcp-server", name: args.name, enabled: true, preview: args.preview },
    {
      command: "mcps.enable",
      commandPath: ["mcps", "enable"],
      planName: "Enable MCP server",
      suggestions: [
        { description: "Inspect MCP servers", cmd: "axm mcps list" },
        { description: "Undo", cmd: `axm mcps disable ${args.name}` },
      ],
    },
  );

const enableConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Name of the MCP server to enable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag(),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, preview, ignoreReleaseAge }) =>
    handleEnableMcpServer({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("mcps enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Enable a disabled MCP server"),
  Command.withExamples([
    { command: "axm mcps enable context", description: "Enable an MCP server" },
    {
      command: "axm mcps enable context --preview",
      description: "Preview enabling an MCP server",
    },
  ]),
);
