import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";
import { PackManagerLive } from "../../../extensions/packs/manager.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { run } from "../../../runtime/index.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";
import { InstallPackCommandWorkflowActionsLive } from "./command-actions.js";
import { handleInstallPack } from "./handler.js";

interface InstallPackCommandArgs {
  source: string;
  scope: WorkspaceScope;
}

export const installPackCommand = {
  handler: async (argv: InstallPackCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);

    const managersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      CommandManagerLive,
      McpServerManagerLive,
    );

    const program = handleInstallPack({
      source: argv.source,
      scope,
    }).pipe(
      Effect.provide(Layer.provideMerge(InstallPackCommandWorkflowActionsLive, managersLayer)),
    );

    await run(program, {
      flags: extractFlags(argv),
      workspace: {
        scope,
        agents: Option.none(),
      },
      command: "packs install",
    });
  },
};
