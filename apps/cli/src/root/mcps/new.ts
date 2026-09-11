import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { isNonInteractiveOptional } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { runCreateExtensionCommand } from "../shared/create-extension-command.js";

export interface McpServersNewHandlerArgs {
  readonly name: ExtensionName;
  readonly description: string;
  readonly owner: Option.Option<string>;
  readonly preview: boolean;
}

export const handleMcpServersNew = (args: McpServersNewHandlerArgs) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractiveOptional;
    return yield* runCreateExtensionCommand({
      command: "mcps.new",
      preview: args.preview,
      request: {
        type: "mcp-server",
        name: args.name,
        owner: args.owner,
        description: args.description.length === 0 ? Option.none() : Option.some(args.description),
        nonInteractive,
      },
      suggestions: (candidate) => [
        { description: `Edit \`${candidate.entryPath}\` to configure the MCP server` },
      ],
    });
  });

const newConfig = {
  name: Argument.String("name").pipe(Argument.withDescription("Name of the MCP server")),
  description: Flag.String("description").pipe(
    Flag.withDescription("Description for the MCP server"),
    Flag.withDefault(""),
  ),
  owner: Flag.String("owner").pipe(
    Flag.withDescription(
      "Owner to create under; recorded as the workspace owner when none is set (e.g., @acme)",
    ),
    Flag.optional,
  ),
  preview: previewCapabilityFlag(),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, description, owner, preview }) =>
  handleMcpServersNew({
    name: decodeExtensionNameSync(name),
    description,
    owner,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("mcps new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Create a new MCP server in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm mcps new context", description: "Create a new MCP server manifest" },
    {
      command: "axm mcps new context --owner @acme",
      description: "Create under a specific owner",
    },
    {
      command: "axm mcps new context --preview",
      description: "Preview the files that would be created",
    },
  ]),
);
