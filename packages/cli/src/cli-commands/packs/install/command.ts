/**
 * Packs install command yargs definition - wires handler to `axm packs install`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleInstallPack } from "./handler.js";
import { InstallPackCommandWorkflowActionsLive } from "./command-actions.js";
import { PackManagerLive } from "../../../extensions/packs/manager.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

interface InstallPackCommandArgs {
  source: string;
  scope: WorkspaceScope;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const installPackCommand: CommandModule<{}, InstallPackCommandArgs> = {
  command: "install <source>",
  describe: "Install a pack and its extensions from a registry",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe:
          "Registry pack reference (@namespace/packs/name, @namespace/packs/name@version, or bare pack-name)",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .example(
        "$0 packs install @acme/packs/frontend-tools",
        "Install pack and all referenced extensions",
      )
      .example(
        "$0 packs install @acme/packs/frontend-tools@^2.0.0",
        "Install specific version range",
      )
      .example("$0 packs install frontend-tools", "Install using default namespace")
      .example(
        "$0 packs install @acme/packs/frontend-tools --preview",
        "See what would be installed",
      ),
  handler: async (argv) => {
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
      flags: {
        nonInteractive: Option.fromNullable(argv["non-interactive"] as boolean | undefined),
        yes: argv["yes"] as boolean,
        force: argv["force"] as boolean,
        preview: argv["preview"] as boolean,
      },
      workspace: {
        scope,
        agents: Option.none(),
      },
      command: "packs install",
    });
  },
};
