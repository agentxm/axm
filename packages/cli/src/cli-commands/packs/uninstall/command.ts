import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";
import { PackManagerLive } from "../../../extensions/packs/manager.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { run } from "../../../runtime/index.js";
import { UninstallPackCommandWorkflowActionsLive } from "./command-actions.js";
import { handleUninstallPack } from "./handler.js";

export interface UninstallPackCommandArgs {
  name: string;
}

export const uninstallPackCommand = {
  handler: async (argv: UninstallPackCommandArgs & Record<string, unknown>) => {
    const managersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      CommandManagerLive,
      McpServerManagerLive,
    );

    const program = handleUninstallPack({
      name: argv.name,
    }).pipe(
      Effect.provide(Layer.provideMerge(UninstallPackCommandWorkflowActionsLive, managersLayer)),
    );

    await run(program, {
      flags: extractFlags(argv),
      workspace: {
        scope: "project",
        agents: Option.none(),
      },
      command: "packs uninstall",
    });
  },
};
