/**
 * Real-parser flag probes.
 *
 * Walks an invocation through the registered command tree with one sentinel
 * flag no command registers. The parser collects every unrecognized option
 * before any handler runs, so the sentinel guarantees the invocation stops at
 * parsing while the probed flag's own recognition is read from the same
 * failure. Help is not requested: the help action exits before parse errors
 * are reported and would hide an unsupported flag. Nothing here performs
 * workspace work or touches the developer's real configuration.
 */

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { CliConfig, CliOutput, Command, GlobalFlag } from "effect/unstable/cli";

import {
  AuthLoginInteractionTest,
  DeviceLoginInteractionTest,
} from "@agentxm/registry-auth/testing";
import {
  TEST_VERSION,
  makeAxmSkillCompatibilityPolicyLayer,
  makeCliTestContext,
  rootCommand,
} from "axm.sh/specification-harness";

export type FlagProbeOutcome = "accepted" | "unrecognized";

const SENTINEL = "--axm-specification-probe-sentinel";

const parserLayer = () => {
  const context = makeCliTestContext({ machine: true, flags: { json: true } });
  // The product registers help as its only built-in flag; the parser default
  // would add a version flag whose alias collides with the verbose flag. The
  // remaining services satisfy the tree's static requirements; parsing never
  // reaches them.
  return Layer.mergeAll(
    context.baseLayer,
    CliConfig.layer({ builtIns: [GlobalFlag.Help] }),
    makeAxmSkillCompatibilityPolicyLayer(TEST_VERSION),
    AuthLoginInteractionTest().layer,
    DeviceLoginInteractionTest().layer,
  );
};

const silentConsole: Console.Console = Object.assign(Object.create(globalThis.console), {
  log: () => undefined,
  error: () => undefined,
});

const silentFormatter: CliOutput.Formatter = {
  ...CliOutput.defaultFormatter({ colors: false }),
  formatHelpDoc: () => "",
};

const ShowHelpFailure = Schema.Struct({
  _tag: Schema.Literal("ShowHelp"),
  errors: Schema.Array(
    Schema.Struct({
      _tag: Schema.String,
      option: Schema.optional(Schema.String),
    }),
  ),
});
const decodeShowHelp = Schema.decodeUnknownOption(ShowHelpFailure);

/**
 * The failure the real parser raises for one invocation it must reject. The
 * invocation runs exactly as given, so a caller passes only an invocation the
 * parser cannot accept — an unregistered flag, for example — and receives the
 * same failure the runtime would classify. An accepted invocation is a defect
 * here: it would have reached a handler.
 */
export const parserRejection = (argv: ReadonlyArray<string>): Effect.Effect<unknown> =>
  Effect.gen(function* () {
    const outcome = yield* Command.runWith(rootCommand, {
      version: TEST_VERSION,
      renderErrors: false,
    })([...argv]).pipe(
      Effect.provide(parserLayer()),
      Effect.provideService(Console.Console, silentConsole),
      Effect.provideService(CliOutput.Formatter, silentFormatter),
      Effect.result,
    );
    if (Result.isSuccess(outcome)) {
      return yield* Effect.die(new Error(`The parser accepted ${argv.join(" ")}`));
    }
    return outcome.failure;
  });

/** The options the parser reported as unrecognized for one invocation. */
export const unrecognizedOptions = (
  argv: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const failure = yield* parserRejection([...argv, SENTINEL]);
    const decoded = decodeShowHelp(failure);
    if (decoded._tag === "None") {
      return yield* Effect.die(
        new Error(`The parser failed without reporting options for ${argv.join(" ")}`),
      );
    }
    return decoded.value.errors.flatMap((error) =>
      error._tag === "UnrecognizedOption" && error.option !== undefined && error.option !== SENTINEL
        ? [error.option]
        : [],
    );
  });

/**
 * Whether the real parser accepts every one of `flags` on the command at
 * `commandPath`. Positionals are not supplied; the sentinel stops parsing
 * before positional requirements or any handler are reached.
 */
export const probeFlags = (
  commandPath: ReadonlyArray<string>,
  flags: ReadonlyArray<string>,
): Effect.Effect<FlagProbeOutcome> =>
  Effect.map(unrecognizedOptions([...commandPath, ...flags]), (unrecognized) =>
    flags.some((flag) => unrecognized.includes(flag)) ? "unrecognized" : "accepted",
  );

export const probeFlag = (
  commandPath: ReadonlyArray<string>,
  flag: string,
): Effect.Effect<FlagProbeOutcome> => probeFlags(commandPath, [flag]);
