/**
 * Root CLI application.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliOutput, Command, GlobalFlag } from "effect/unstable/cli";

import { InteractiveRenderer, MachineRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { removeBuiltInFlag, runCliMain } from "@axm.sh/core/unstable/cli-runtime";
import { InstallMethodLive } from "@axm.sh/core/unstable/install-method";
import { UpdateCheckLive } from "@axm.sh/core/unstable/update-check";

import { LearnMore, makeAxmFormatter } from "./formatter.js";
import { withUpdateCheck, resolveNonInteractiveFromArgv } from "./update-check-startup.js";

import { axmGlobalFlags, baseLayer, runtimeBaseLayer } from "./runtime.js";
import { loadVersion } from "./version.js";

import { initCommand } from "./root/init.js";
import { skillsCommand } from "./root/skills/_skills.js";
import { packsCommand } from "./root/packs/_packs.js";
import { commandsCommand } from "./root/commands/_commands.js";
import { mcpServersCommand } from "./root/mcp-servers/_mcp-servers.js";
import { subagentsCommand } from "./root/subagents/_subagents.js";
import { authCommand } from "./root/auth/_auth.js";
import { loginCommand } from "./root/auth/login.js";
import { logoutCommand } from "./root/auth/logout.js";
import { whoamiCommand } from "./root/auth/whoami.js";
import { tokenCommand } from "./root/auth/token.js";
import { upgradeCommand } from "./root/upgrade/upgrade.js";
import { doctorCommand } from "./root/doctor/command.js";
import { syncCommand } from "./root/sync.js";
import { discoverCommand } from "./root/discover/command.js";
import { installCommand } from "./root/install/command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();
const LEARN_MORE_FOOTER =
  "LEARN MORE\n  Use 'axm <command> --help' for more information about a command.";

removeBuiltInFlag(GlobalFlag.Completions);
removeBuiltInFlag(GlobalFlag.LogLevel);

export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Open extension manager for AI coding agents.\n  Manage skills, commands, MCP servers, and extension packs across your AI coding agents from a single CLI.",
  ),
  Command.annotate(LearnMore, LEARN_MORE_FOOTER),
  Command.withExamples([
    { command: "axm init", description: "Start managing extensions in your project" },
    {
      command: "axm install @acme/skills/code-review",
      description: "Add a code review skill to your agents",
    },
    {
      command: "axm packs install @acme/packs/frontend-tools",
      description: "Install a curated set of extensions at once",
    },
    { command: "axm whoami", description: "Check who you're authenticated as" },
  ]),
  Command.withSubcommands([
    { group: "GETTING STARTED", commands: [initCommand] },
    {
      group: "EXTENSIONS",
      commands: [
        installCommand,
        skillsCommand,
        packsCommand,
        commandsCommand,
        mcpServersCommand,
        subagentsCommand,
        discoverCommand,
      ],
    },
    {
      group: "AUTH AND CONFIG",
      commands: [
        doctorCommand,
        syncCommand,
        authCommand,
        loginCommand,
        logoutCommand,
        whoamiCommand,
        tokenCommand,
        upgradeCommand,
      ],
    },
  ]),
  Command.withGlobalFlags(axmGlobalFlags),
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

      const rendererLayer = isJson ? MachineRenderer() : InteractiveRenderer();

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
            CliOutput.layer(makeAxmFormatter({ json: isJson })),
          ),
        ),
      );
    },
    { args },
  );
};
