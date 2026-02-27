/**
 * Commands install command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleInstallCommand } from "./handler.js";
import { InstallCommandCommandWorkflowActionsLive } from "./command-actions.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

interface InstallCommandCommandArgs {
  source: string;
  scope: WorkspaceScope;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const installCommandCommand: CommandModule<{}, InstallCommandCommandArgs> = {
  command: "install <source>",
  describe: "Install a command from a registry",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "Registry command reference (@namespace/commands/name or bare name)",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .example("$0 commands install @acme/commands/my-cmd", "Install a command from registry")
      .example("$0 commands install my-cmd", "Install using default namespace"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);

    const actionsLayer = Layer.provide(
      InstallCommandCommandWorkflowActionsLive,
      CommandManagerLive,
    );

    const program = handleInstallCommand({
      source: argv.source,
      scope,
    }).pipe(Effect.provide(actionsLayer));

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
    });
  },
};
