import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstall } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import * as Effect from "effect/Effect";
import {
  deleteSourceFlag,
  keepSourceFlag,
  resolveSourceDisposition,
} from "../../shared/source-disposition-flags.js";

const uninstallConfig = {
  subagent: Argument.string("subagent").pipe(
    Argument.withDescription("Name of the subagent to uninstall"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if other extensions depend on this subagent"),
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
  ({ subagent, yes, force, preview, keepSource, deleteSource }) =>
    Effect.gen(function* () {
      const sourceDisposition = yield* resolveSourceDisposition(keepSource, deleteSource);
      yield* handleUninstall(
        { subagent },
        { yes, force, preview, ...(sourceDisposition === undefined ? {} : { sourceDisposition }) },
      );
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("subagents uninstall")),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a subagent from agents"),
  Command.withExamples([
    {
      command: "axm subagents uninstall my-subagent",
      description: "Remove a subagent you no longer need",
    },
    {
      command: "axm subagents uninstall my-subagent --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm subagents uninstall my-subagent --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
  ]),
);
