/**
 * Root CLI application.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliOutput, Command, GlobalFlag } from "effect/unstable/cli";

import {
  InteractiveRenderer,
  MachineRenderer,
  resolveCliOutputPolicy,
} from "@agentxm/client-core/unstable/cli-renderer";
import { removeBuiltInFlag, runCliMain } from "@agentxm/client-core/unstable/cli-runtime";
import { InstallMethodLive } from "@agentxm/client-core/unstable/install-method";
import { UpdateCheckLive } from "@agentxm/client-core/unstable/update-check";

import { LearnMore, formatLearnMore, makeAxmFormatter } from "./formatter.js";
import { withUpdateCheck, resolveNonInteractiveFromArgv } from "./update-check-startup.js";

import { axmGlobalFlags, baseLayer, runtimeBaseLayer } from "./runtime.js";
import { loadVersion } from "./version.js";

import { setupCommand } from "./root/setup.js";
import { agentsCommand } from "./root/agents/_agents.js";
import { skillsCommand } from "./root/skills/_skills.js";
import { packsCommand } from "./root/packs/_packs.js";
import { commandsCommand } from "./root/commands/_commands.js";
import { contextCommand } from "./root/context/_context.js";
import { mcpsCommand } from "./root/mcps/_mcps.js";
import { subagentsCommand } from "./root/subagents/_subagents.js";
import { authCommand } from "./root/auth/_auth.js";
import { loginCommand } from "./root/auth/login.js";
import { logoutCommand } from "./root/auth/logout.js";
import { whoamiCommand } from "./root/auth/whoami.js";
import { tokenCommand } from "./root/auth/token.js";
import { upgradeCommand } from "./root/upgrade/upgrade.js";
import { lintCommand } from "./root/lint/command.js";
import { discoverCommand } from "./root/discover/command.js";
import { installCommand } from "./root/install/command.js";
import { outdatedCommand } from "./root/outdated/command.js";
import { uninstallCommand } from "./root/uninstall/command.js";
import { pruneCommand } from "./root/prune/command.js";
import { syncCommand } from "./root/sync/command.js";
import { updateCommand } from "./root/update/command.js";
import { helpCommand } from "./root/help/command.js";
import { viewCommand } from "./root/view/command.js";
import { listsCommand } from "./root/lists/command.js";
import { versionCommand } from "./root/shared/version-command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();

removeBuiltInFlag(GlobalFlag.Completions);
removeBuiltInFlag(GlobalFlag.LogLevel);

export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Open extension manager for AI coding agents.\n  Manage skills, commands, context packages, MCP servers, and packs across your AI coding agents from a single CLI.",
  ),
  Command.withExamples([
    { command: "axm setup", description: "Start managing extensions in your project" },
    {
      command: "axm install @acme/skills/code-review",
      description: "Add a code review skill to your agents",
    },
    {
      command: "axm uninstall @acme/skills/code-review",
      description: "Remove an installed extension by registry FQN",
    },
    {
      command: "axm discover",
      description: "See what's available for your project",
    },
    { command: "axm whoami", description: "Check who you're authenticated as" },
  ]),
  Command.withSubcommands([
    {
      group: "EXTENSIONS",
      commands: [
        skillsCommand,
        commandsCommand,
        contextCommand,
        mcpsCommand,
        subagentsCommand,
        packsCommand,
        installCommand,
        updateCommand,
        uninstallCommand,
        outdatedCommand,
        viewCommand,
        listsCommand,
        versionCommand,
      ],
    },
    {
      group: "WORKSPACE",
      commands: [syncCommand, agentsCommand, lintCommand, pruneCommand, upgradeCommand],
    },
    {
      group: "AUTH",
      commands: [authCommand, loginCommand, logoutCommand, whoamiCommand, tokenCommand],
    },
    { group: "GETTING STARTED", commands: [setupCommand, discoverCommand, helpCommand] },
  ]),
  Command.withGlobalFlags(axmGlobalFlags),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help getting-started", "Set up AXM in a new workspace"],
      ["axm help basic-usage", "Managing extensions and agents for an AXM workspace"],
      ["axm help skills", "How skill extensions work"],
      ["axm help", "Browse all help topics"],
    ]),
  ),
);

const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");

/** Layer providing UpdateCheck and InstallMethod for the startup update check. */
const updateCheckServicesLayer = Layer.provide(
  Layer.mergeAll(UpdateCheckLive, InstallMethodLive),
  runtimeBaseLayer,
);

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) => {
      const isJson = hasExplicitJsonFlag(argv);
      const commandProgram = Command.runWith(rootCommand, { version })(argv);
      const outputPolicy = resolveCliOutputPolicy();

      const rendererLayer = isJson ? MachineRenderer() : InteractiveRenderer({ outputPolicy });

      return withUpdateCheck(commandProgram, {
        localVersion: version,
        inputs: {
          args: argv,
          isNonInteractive: resolveNonInteractiveFromArgv(argv),
          isJsonOutput: isJson,
        },
      }).pipe(
        // Built-in --help / --version output is formatter-driven, so explicit
        // --json has to be reflected here before Effect CLI starts rendering.
        Effect.provide(
          Layer.mergeAll(
            baseLayer,
            updateCheckServicesLayer,
            rendererLayer,
            CliOutput.layer(makeAxmFormatter({ json: isJson, colors: outputPolicy.colors })),
          ),
        ),
      );
    },
    { args },
  );
};
