/**
 * Packs uninstall command yargs definition - wires handler to `axm packs uninstall`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleUninstallPack } from "./handler.js";
import { UninstallPackCommandWorkflowActionsLive } from "./command-actions.js";
import { PackManagerLive } from "../../../extensions/packs/manager.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";

export interface UninstallPackCommandArgs {
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const uninstallPackCommand: CommandModule<{}, UninstallPackCommandArgs> = {
  command: "uninstall <name>",
  describe: "Uninstall a pack",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name or glob pattern of the pack to uninstall",
        demandOption: true,
      })
      .example("$0 packs uninstall my-pack", "Uninstall a pack and its orphaned extensions")
      .example("$0 packs uninstall my-pack --preview", "Preview what would be uninstalled")
      .example("$0 packs uninstall my-pack --yes", "Uninstall without confirmation prompt")
      .example("$0 packs uninstall acme-*", "Uninstall all packs matching a pattern"),
  handler: async (argv) => {
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
      flags: {
        nonInteractive: Option.fromNullable(argv["non-interactive"] as boolean | undefined),
        yes: argv["yes"] as boolean,
        force: argv["force"] as boolean,
        preview: argv["preview"] as boolean,
      },
      workspace: {
        scope: "project",
        agents: Option.none(),
      },
    });
  },
};
