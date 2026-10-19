import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import { CliConfig, CliError, Command, GlobalFlag } from "effect/cli";

const probeFlag = "--axm-command-path-probe";

/**
 * Effect runs help/version actions before reporting unknown commands. Probe the
 * same grammar with those actions disabled, retaining their flag definitions.
 * An unrecognized flag stops parsing before operand validation or workspace
 * work; the replacement root handler also prevents command dispatch. Only an
 * unknown command promotes the real parser diagnostics to a usage failure.
 *
 * Succeeds with the route the parser resolved: the command words after the
 * root, for the dispatcher to hand the command it runs.
 */
export const validateCommandPath = (command: Command.Command.Any, argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const config = yield* CliConfig.CliConfig;
    const actionSettings = config.builtIns.flatMap((flag, index) =>
      flag._tag === "Action"
        ? [GlobalFlag.Setting(`axm-command-path-${index}`)<unknown>({ flag: flag.flag })]
        : [],
    );
    const validationCommand = command.pipe(
      Command.withHandler(() => Effect.void),
      Command.withGlobalFlags(actionSettings),
    );
    return yield* Command.runWith(validationCommand, {
      version: "",
      renderErrors: false,
    })([probeFlag, ...argv]).pipe(
      Effect.as<ReadonlyArray<string>>([]),
      Effect.provideService(CliConfig.CliConfig, {
        builtIns: config.builtIns.filter((flag) => flag._tag !== "Action"),
      }),
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: () => undefined,
        error: () => undefined,
      }),
      Effect.catchTag("ShowHelp", (error) => {
        const errors = error.errors.filter(
          (entry) => entry._tag !== "UnrecognizedOption" || entry.option !== probeFlag,
        );
        return errors.some((entry) => entry._tag === "UnknownSubcommand")
          ? Effect.fail(new CliError.ShowHelp({ commandPath: error.commandPath, errors }))
          : Effect.succeed(error.commandPath.slice(1));
      }),
    );
  });
