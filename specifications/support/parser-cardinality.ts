/** Parser occurrence controls use the registered leaf and replace only its handler. */
import { expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliConfig, Command, GlobalFlag } from "effect/unstable/cli";
import { TEST_VERSION, makeCliTestContext, rootCommand } from "axm.sh/specification-harness";

interface Control {
  readonly route: string;
  readonly flag: string;
  readonly siblingInputs: ReadonlyArray<string>;
  readonly values: readonly [string, string];
}

const control = (
  route: string,
  flag: string,
  values: readonly [string, string] = ["first", "second"],
  siblingInputs: ReadonlyArray<string> = [],
): Control => ({ route, flag, values, siblingInputs });

// These are runnable input controls, not a second cardinality declaration.
export const repeatedFlagControls = [
  ...["hooks", "knowledge", "mcps", "rules", "skills", "subagents"].map((type) =>
    control(`${type} update`, "name"),
  ),
  ...["field", "property", "metadata", "lifecycle", "tag"].map((flag) =>
    control("knowledge concepts query", flag),
  ),
  control("login", "scope"),
  control("mcps add", "env", ["ONE=1", "TWO=2"], ["parser-fixture"]),
  control("mcps add", "header", ["X-One:1", "X-Two:2"], ["parser-fixture"]),
  control("mcps install", "env", ["ONE=1", "TWO=2"]),
  control("setup", "agent", ["claude-code", "claude-code"]),
  control("skills install", "skill"),
  control("skills list", "agent", ["claude-code", "claude-code"]),
  control("subagents install", "subagent"),
  control("subagents list", "agent", ["claude-code", "claude-code"]),
  control("token create", "owner", ["@first", "@second"], ["--name", "parser-fixture"]),
  control(
    "token create",
    "extension",
    ["@first/skills/one", "@second/skills/two"],
    ["--name", "parser-fixture"],
  ),
  control(
    "token create",
    "cidr",
    ["192.0.2.0/24", "198.51.100.0/24"],
    ["--name", "parser-fixture"],
  ),
] satisfies ReadonlyArray<Control>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const registeredLeaf = (route: string): Command.Command.Any => {
  let command: Command.Command.Any = rootCommand;
  for (const part of route.split(" ")) {
    const next = command.subcommands
      .flatMap((group) => group.commands)
      .find((candidate) => candidate.name === part);
    if (next === undefined) throw new Error(`Unregistered route: ${route}`);
    command = next;
  }
  if (command.subcommands.length !== 0) throw new Error(`Expected leaf: ${route}`);
  return command;
};

export const observeZeroMinimumRepetition = (fixture: Control) =>
  Effect.gen(function* () {
    const registered = registeredLeaf(fixture.route);
    const context = makeCliTestContext({ machine: true });
    const layer = Layer.mergeAll(
      context.baseLayer,
      CliConfig.layer({ builtIns: [GlobalFlag.Help] }),
    );
    for (const count of [0, 1, 2]) {
      const values = fixture.values.slice(0, count);
      let handlerReached = false;
      const observed = Command.withHandler(registered, (input: unknown) =>
        Effect.sync(() => {
          handlerReached = true;
          if (!isRecord(input)) throw new Error("Parser returned a non-record input");
          // The controlled flag's registered config key matches its public name.
          expect(input[fixture.flag]).toEqual(values);
        }),
      );
      yield* Command.runWith(observed, { version: TEST_VERSION, renderErrors: false })([
        ...fixture.siblingInputs,
        ...values.flatMap((value) => [`--${fixture.flag}`, value]),
      ]).pipe(Effect.provide(layer));
      expect(handlerReached).toBe(true);
    }
    // Compare this observed fact to decoded inventory occurrences. Two values
    // establish repeatability; they do not establish an unbounded maximum.
    return { minimumOccurrences: 0, repeatable: true };
  });
