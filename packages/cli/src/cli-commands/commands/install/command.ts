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
  CONFIGURATION_SCOPES,
  DEFAULT_CONFIGURATION_SCOPE,
  type ConfigurationScope,
  resolveConfigurationScope,
  toGlobalWorkspaceFlag,
} from "../../../workspace/config-scope.js";

interface InstallCommandCommandArgs {
  source: string;
  scope: ConfigurationScope;
  global?: boolean;
  yes: boolean;
  force: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
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
        choices: CONFIGURATION_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_CONFIGURATION_SCOPE,
      })
      .option("global", {
        type: "boolean",
        hidden: true,
        describe: "Deprecated alias for --scope user",
        default: false,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Force reinstall",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display installation plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 commands install @acme/commands/my-cmd", "Install a command from registry")
      .example("$0 commands install my-cmd", "Install using default namespace"),
  handler: async (argv) => {
    const scope = resolveConfigurationScope(argv.scope, argv.global);
    const global = toGlobalWorkspaceFlag(scope);

    const actionsLayer = Layer.provide(
      InstallCommandCommandWorkflowActionsLive,
      CommandManagerLive,
    );

    const program = handleInstallCommand({
      source: argv.source,
      global,
      yes: argv.yes,
      force: argv.force,
      nonInteractive: Option.fromNullable(argv["non-interactive"]),
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      workspace: {
        global,
        yes: argv.yes,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
        preview: argv.preview,
        agents: Option.none(),
      },
    });
  },
};
