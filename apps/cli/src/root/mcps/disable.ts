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

export const handleDisableMcpServer = (args: {
  readonly name: string;
  readonly preview: boolean;
}) =>
  handleSetActivation(
    { type: "mcp-server", name: args.name, enabled: false, preview: args.preview },
    {
      command: "mcps.disable",
      commandPath: ["mcps", "disable"],
      planName: "Disable MCP server",
      suggestions: [
        { description: "Inspect MCP servers", cmd: "axm mcps list" },
        { description: "Undo", cmd: `axm mcps enable ${args.name}` },
      ],
    },
  );

const disableConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Name of the MCP server to disable")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Disable in project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag(),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const disableCommand = Command.make(
  "disable",
  disableConfig,
  ({ name, scope, preview, ignoreReleaseAge }) =>
    handleDisableMcpServer({ name, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("mcps disable"),
    ),
).pipe(
  withArgvTracking(disableConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Disable an MCP server"),
  Command.withExamples([
    { command: "axm mcps disable context", description: "Disable an MCP server" },
    {
      command: "axm mcps disable context --preview",
      description: "Preview disabling an MCP server",
    },
  ]),
);
