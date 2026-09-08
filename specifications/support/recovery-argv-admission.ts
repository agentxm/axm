/** Full recovery argv admission uses registered parsing and substitutes only execution. */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliConfig, Command, GlobalFlag } from "effect/unstable/cli";
import { TEST_VERSION, makeCliTestContext, rootCommand } from "axm.sh/specification-harness";

/** Rebuild the expected registered branch, retaining each node's configuration and global flags. */
const observeBranch = (
  command: Command.Command.Any,
  remainingRoute: ReadonlyArray<string>,
  observe: (input: unknown) => void,
): Command.Command<string, never, unknown> => {
  const replaced = Command.withHandler(command, (input: unknown) =>
    Effect.sync(() => {
      if (remainingRoute.length !== 0)
        throw new Error("Recovery stopped before its registered command");
      observe(input);
    }),
  );
  const [name, ...rest] = remainingRoute;
  if (name === undefined) {
    if (command.subcommands.length !== 0)
      throw new Error("Recovery admission expects a registered leaf");
    return replaced;
  }
  const registered = command.subcommands
    .flatMap((group) => group.commands)
    .find((candidate) => candidate.name === name);
  if (registered === undefined) throw new Error(`Unregistered recovery route component: ${name}`);
  return Command.withSubcommands(replaced, [observeBranch(registered, rest, observe)]);
};

/**
 * Parse exactly the supplied argument vector, including required positionals,
 * values and root/global flags; no sentinel or help request short-circuits it.
 * The callback replaces workspace execution, not any parser or input schema.
 */
export const admitRecoveryArgv = (argv: ReadonlyArray<string>, route: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const admitted: Array<unknown> = [];
    const observed = observeBranch(rootCommand, route, (input) => admitted.push(input));
    const context = makeCliTestContext({ machine: true });
    yield* Command.runWith(observed, { version: TEST_VERSION, renderErrors: false })(argv).pipe(
      Effect.provide(
        Layer.mergeAll(context.baseLayer, CliConfig.layer({ builtIns: [GlobalFlag.Help] })),
      ),
    );
    if (admitted.length !== 1)
      throw new Error("Recovery did not reach exactly one registered leaf");
    return admitted[0];
  });
