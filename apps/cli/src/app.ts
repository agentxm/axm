/**
 * Root CLI application.
 */

import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { CliError, CliOutput, Command } from "effect/unstable/cli";
import { format as formatConsoleArgs } from "node:util";

import { AppError, makeAppError } from "./app-error/index.js";
import {
  InteractiveScreen,
  MachineScreen,
  Screen,
  resolveCliOutputPolicy,
  stderrIsTTY,
} from "./screen/index.js";
import { resolveVerbosityFromArgv } from "./cli-flags/index.js";
import { runCliMain } from "./cli-runtime/index.js";
import { InstallMethodLive } from "./install-method/install-method.js";
import { UpdateCheckLive } from "./update-check/update-check.js";

import { LearnMore, formatLearnMore, makeAxmFormatter } from "./formatter.js";
import { withUpdateCheck, resolveNonInteractiveFromArgv } from "./update-check-startup.js";

import { axmGlobalFlags, baseLayer, runtimeBaseLayer } from "./runtime.js";
import { loadVersion } from "./version.js";
import { groupCapabilities, withCommandCapabilities } from "./root/shared/command-capabilities.js";

import { setupCommand } from "./root/setup.js";
import { instructionsCommand } from "./root/instructions.js";
import { agentsCommand } from "./root/agents/_agents.js";
import {
  extensionGroupCommands,
  workspaceCapabilityCommands,
} from "./root/extension-type-commands.js";
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
import { makeHelpCommand } from "./root/help/command.js";
import { viewCommand } from "./root/view/command.js";
import { versionCommand } from "./root/shared/version-command.js";
import { publishCommand } from "./root/publish/command.js";
import { adoptCommand } from "./root/adopt/command.js";
import { demoteCommand } from "./root/demote/command.js";
import { forkCommand } from "./root/fork/command.js";
import { cacheCommand } from "./root/cache/command.js";
import { visibilityCommand } from "./root/visibility/command.js";
import {
  deprecateCommand,
  undeprecateCommand,
  unyankCommand,
  yankCommand,
} from "./root/lifecycle/command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();
type CommandProgramError = AppError | CliError.CliError;

const helpCommand = makeHelpCommand(() => rootCommand);

/**
 * Effect CLI built-ins kept for axm: `--completions` and `--log-level` are
 * intentionally absent — verbosity flags own logger severity instead.
 */
/**
 * Experimental AXM command tree for structural inspection and composition.
 *
 * Executing the tree through {@link run} is supported for one invocation per
 * process. Repeated, concurrent, and Worker-hosted invocation are unsupported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Open extension manager for AI coding agents.\n  Manage skills, MCP servers, subagents, rules, hooks, knowledge, and packs across your AI coding agents from a single CLI.",
  ),
  withCommandCapabilities(groupCapabilities),
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
        adoptCommand,
        demoteCommand,
        installCommand,
        updateCommand,
        uninstallCommand,
        listCommand,
        viewCommand,
        visibilityCommand,
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
        instructionsCommand,
        ...workspaceCapabilityCommands,
        lintCommand,
        cacheCommand,
        upgradeCommand,
      ],
    },
    {
      group: "AUTH",
      commands: [loginCommand, logoutCommand, whoamiCommand, tokenCommand],
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

const usesRetiredAuthCommand = (args: ReadonlyArray<string>): boolean => args[0] === "auth";

const runCommand = (argv: ReadonlyArray<string>, isJson: boolean) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const stdout: Array<string> = [];
    const stderr: Array<string> = [];
    const bufferedConsole: Console.Console = {
      ...globalThis.console,
      log: (...args: ReadonlyArray<unknown>) => void stdout.push(`${formatConsoleArgs(...args)}\n`),
      error: (...args: ReadonlyArray<unknown>) =>
        void stderr.push(`${formatConsoleArgs(...args)}\n`),
    };
    const exit = yield* Effect.exit(
      Command.runWith(rootCommand, { version })(argv).pipe(
        Effect.provideService(Console.Console, bufferedConsole),
      ),
    );
    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
    const usageHelp =
      failure !== undefined &&
      CliError.isCliError(failure) &&
      failure._tag === "ShowHelp" &&
      failure.errors.length > 0;

    if (usageHelp) {
      if (!isJson) {
        if (stdout.length > 0) {
          yield* screen.note([{ _tag: "raw", content: stdout.join("") }]);
        }
        if (stderr.length > 0) {
          yield* screen.note([{ _tag: "raw", content: stderr.join("") }]);
        }
      }
    } else {
      if (stdout.length > 0) yield* screen.result([{ _tag: "raw", content: stdout.join("") }]);
      if (stderr.length > 0) yield* screen.note([{ _tag: "raw", content: stderr.join("") }]);
    }

    if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
  });

/** Layer providing UpdateCheck and InstallMethod for the startup update check. */
const updateCheckServicesLayer = Layer.provide(
  Layer.mergeAll(UpdateCheckLive, InstallMethodLive),
  runtimeBaseLayer,
);

/**
 * Run AXM as a process entry point.
 *
 * This API supports one invocation per process. It owns stdout, stderr, and
 * signal handlers for that invocation, and it terminates the process on
 * failure. Repeated, concurrent, and Worker-hosted invocation are unsupported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) => {
      const isJson = hasExplicitJsonFlag(argv);
      const commandProgram = usesRetiredAuthCommand(argv)
        ? Effect.fail<CommandProgramError>(
            makeAppError({
              code: "usage",
              detail: "Unrecognized command: auth",
            }),
          )
        : argv.includes("-vv")
          ? Effect.fail<CommandProgramError>(
              makeAppError({
                code: "usage",
                detail: "Unrecognized flag: -vv. Use --debug for full debug diagnostics.",
              }),
            )
          : runCommand(argv, isJson).pipe(Effect.mapError((error): CommandProgramError => error));
      const outputPolicy = resolveCliOutputPolicy({
        quiet: resolveVerbosityFromArgv(argv) === "quiet",
        stderrIsTTY: stderrIsTTY(),
      });

      const rendererLayer = isJson
        ? MachineScreen({ quiet: outputPolicy.quiet })
        : InteractiveScreen({ outputPolicy });

      return withUpdateCheck(commandProgram, {
        localVersion: version,
        inputs: {
          args: argv,
          isNonInteractive: resolveNonInteractiveFromArgv(argv),
          isJsonOutput: isJson,
          isStderrTTY: stderrIsTTY(),
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
