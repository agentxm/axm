import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstall } from "./handler.js";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import * as Effect from "effect/Effect";
import {
  deleteSourceFlag,
  keepSourceFlag,
  resolveSourceDisposition,
} from "../../shared/source-disposition-flags.js";

const uninstallConfig = {
  skill: Argument.string("skill").pipe(Argument.withDescription("Name of the skill to uninstall")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if other extensions depend on this skill"),
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
  ({ skill, scope, yes, force, preview, keepSource, deleteSource }) =>
    Effect.gen(function* () {
      const sourceDisposition = yield* resolveSourceDisposition(keepSource, deleteSource);
      yield* handleUninstall(
        { skill },
        { yes, force, preview, ...(sourceDisposition === undefined ? {} : { sourceDisposition }) },
      );
    }).pipe(withWorkspace(scope), withRuntime("skills uninstall")),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a skill from agents"),
  Command.withExamples([
    { command: "axm skills uninstall my-skill", description: "Remove a skill you no longer need" },
    {
      command: "axm skills uninstall my-skill --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm skills uninstall my-skill --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
  ]),
);
