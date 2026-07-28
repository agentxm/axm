import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstallMcpServer } from "./handler.js";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import * as Effect from "effect/Effect";
import {
  deleteSourceFlag,
  keepSourceFlag,
  resolveSourceDisposition,
} from "../../shared/source-disposition-flags.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the MCP server to uninstall"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if agents are currently configured to use this server"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
  keepSource: keepSourceFlag,
  deleteSource: deleteSourceFlag,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, yes, force, preview, keepSource, deleteSource }) =>
    Effect.gen(function* () {
      const sourceDisposition = yield* resolveSourceDisposition(keepSource, deleteSource);
      yield* handleUninstallMcpServer(
        { serverName: name },
        { yes, force, preview, ...(sourceDisposition === undefined ? {} : { sourceDisposition }) },
      );
    }).pipe(withWorkspace(scope), withRuntime("mcps uninstall")),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall an MCP server"),
  Command.withExamples([
    {
      command: "axm mcps uninstall my-server",
      description: "Remove an MCP server you no longer need",
    },
    {
      command: "axm mcps uninstall my-server --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm mcps uninstall my-server --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
  ]),
);
