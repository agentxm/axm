/**
 * Root CLI application.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliError, CliOutput, Command } from "effect/unstable/cli";

import { AppError, makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  InteractiveRenderer,
  MachineRenderer,
  resolveCliOutputPolicy,
} from "@agentxm/client-core/unstable/cli-renderer";
import { resolveVerbosityFromArgv } from "@agentxm/client-core/unstable/cli-flags";
import { runCliMain } from "@agentxm/client-core/unstable/cli-runtime";
import { InstallMethodLive } from "@agentxm/client-core/unstable/install-method";
import { UpdateCheckLive } from "@agentxm/client-core/unstable/update-check";

import { LearnMore, formatLearnMore, makeAxmFormatter } from "./formatter.js";
import { withUpdateCheck, resolveNonInteractiveFromArgv } from "./update-check-startup.js";

import { axmGlobalFlags, baseLayer, runtimeBaseLayer } from "./runtime.js";
import { loadVersion } from "./version.js";

import { setupCommand } from "./root/setup.js";
import { agentsCommand } from "./root/agents/_agents.js";
import {
  extensionGroupCommands,
  workspaceCapabilityCommands,
} from "./root/extension-type-commands.js";
import { authCommand } from "./root/auth/_auth.js";
import { loginCommand } from "./root/auth/login.js";
import { logoutCommand } from "./root/auth/logout.js";
import { whoamiCommand } from "./root/auth/whoami.js";
import { tokenCommand } from "./root/auth/token.js";
import { upgradeCommand } from "./root/upgrade/upgrade.js";
import { lintCommand } from "./root/lint/command.js";
import { discoverCommand } from "./root/discover/command.js";
import { installCommand } from "./root/install/command.js";
import { listCommand } from "./root/list/command.js";
import { uninstallCommand } from "./root/uninstall/command.js";
import { syncCommand } from "./root/sync/command.js";
import { updateCommand } from "./root/update/command.js";
import { helpCommand } from "./root/help/command.js";
import { viewCommand } from "./root/view/command.js";
import { versionCommand } from "./root/shared/version-command.js";
import { publishCommand } from "./root/publish/command.js";
import { adoptCommand } from "./root/adopt/command.js";
import { demoteCommand } from "./root/demote/command.js";
import { forkCommand } from "./root/fork/command.js";
import { importCommand } from "./root/import/command.js";
import { cacheCommand } from "./root/cache/command.js";
import {
  deprecateCommand,
  undeprecateCommand,
  unyankCommand,
  yankCommand,
} from "./root/lifecycle/command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();
type CommandProgramError = AppError | CliError.CliError;

/**
 * Effect CLI built-ins kept for axm: `--completions` and `--log-level` are
 * intentionally absent — verbosity flags own logger severity instead.
 */
export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Open extension manager for AI coding agents.\n  Manage skills, MCP servers, subagents, rules, hooks, knowledge, and packs across your AI coding agents from a single CLI.",
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
        ...extensionGroupCommands,
        publishCommand,
        forkCommand,
        importCommand,
        adoptCommand,
        demoteCommand,
        installCommand,
        updateCommand,
        uninstallCommand,
        listCommand,
        viewCommand,
        versionCommand,
        yankCommand,
        unyankCommand,
        deprecateCommand,
        undeprecateCommand,
      ],
    },
    {
      group: "WORKSPACE",
      commands: [
        syncCommand,
        agentsCommand,
        ...workspaceCapabilityCommands,
        lintCommand,
        cacheCommand,
        upgradeCommand,
      ],
    },
    {
      group: "AUTH",
      commands: [authCommand, loginCommand, logoutCommand, whoamiCommand, tokenCommand],
    },
    {
      group: "GETTING STARTED",
      commands: [setupCommand, discoverCommand, helpCommand],
    },
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
      const commandProgram = argv.includes("-vv")
        ? Effect.fail<CommandProgramError>(
            makeAppError({
              code: "usage",
              detail: "Unrecognized flag: -vv. Use --debug for full debug diagnostics.",
            }),
          )
        : Command.runWith(rootCommand, { version })(argv).pipe(
            Effect.mapError((error): CommandProgramError => error),
          );
      const outputPolicy = resolveCliOutputPolicy({
        quiet: resolveVerbosityFromArgv(argv) === "quiet",
      });

      const rendererLayer = isJson
        ? MachineRenderer({ quiet: outputPolicy.quiet })
        : InteractiveRenderer({ outputPolicy });

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
