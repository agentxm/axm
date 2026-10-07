/** Parser occurrence controls use the registered leaf and replace only its handler. */
import { expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliConfig, Command, GlobalFlag } from "effect/cli";
import { rootCommand } from "../app.js";
import { TEST_VERSION } from "./command-tree-test-helpers.js";
import { makeCliTestContext } from "./test-helpers.js";

interface Control {
  readonly route: string;
  readonly flag: string;
  readonly configKey: string;
  readonly siblingInputs: ReadonlyArray<string>;
  readonly values: readonly [string, string];
}

const control = (
  route: string,
  flag: string,
  values: readonly [string, string] = ["first", "second"],
  siblingInputs: ReadonlyArray<string> = [],
): Control => ({
  route,
  flag,
  configKey: flag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
  values,
  siblingInputs,
});

// These are runnable input controls, not a second cardinality declaration.
export const repeatedFlagControls = [
  { ...control("publish", "include-file", ["/src/", "/dist/"]), configKey: "fileInclude" },
  { ...control("publish", "exclude-file", ["*.map", "evals/"]), configKey: "fileExclude" },
  ...[
    "install",
    "hooks install",
    "knowledge install",
    "mcps install",
    "packs install",
    "rules install",
    "skills install",
    "subagents install",
  ].map((route) => control(route, "agent", ["claude-code", "codex"])),
  ...["hooks", "knowledge", "mcps", "rules", "skills", "subagents"].map((type) =>
    control(`${type} update`, "name"),
  ),
  ...["field", "property", "metadata", "lifecycle", "tag"].map((flag) =>
    control("knowledge concepts query", flag),
  ),
  control("mcps add", "env", ["ONE=1", "TWO=2"], ["parser-fixture"]),
  control("mcps add", "header", ["X-One:1", "X-Two:2"], ["parser-fixture"]),
  control("mcps add", "arg", ["first", "second"], ["parser-fixture"]),
  control("mcps add", "header-env", ["X-One=ONE", "X-Two=TWO"], ["parser-fixture"]),
  control("mcps import", "name"),
  control("mcps show", "agent", ["claude-code", "codex"], ["parser-fixture"]),
  ...["install", "mcps install"].flatMap((route) => [
    control(route, "bind", ["environment/ONE=1", "environment/TWO=2"]),
    control(route, "bind-env", ["environment/ONE=ONE", "environment/TWO=TWO"]),
  ]),
  ...["skill", "subagent", "rule", "hook", "knowledge", "mcp", "pack"].map((flag) =>
    control("install", flag),
  ),
  control("hooks install", "hook"),
  control("knowledge install", "knowledge"),
  control("mcps install", "mcp"),
  control("packs install", "pack"),
  control("rules install", "rule"),
  control("setup", "agent", ["claude-code", "claude-code"]),
  control("skills install", "skill"),
  control("skills handoff", "skill"),
  control("skills handoff", "agent", ["claude-code", "codex"]),
  control("skills list", "agent", ["claude-code", "claude-code"]),
  control("subagents install", "subagent"),
  control("subagents list", "agent", ["claude-code", "claude-code"]),
  control(
    "token create",
    "owner",
    ["@first", "@second"],
    ["--name", "parser-fixture", "--permission", "read"],
  ),
  control(
    "token create",
    "extension",
    ["@first/skills/one", "@second/skills/two"],
    ["--name", "parser-fixture", "--permission", "read"],
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
          // Dashed flags are registered with camel-case config keys.
          expect(isRecord(input), "parser returned a non-record input").toBe(true);
          expect(isRecord(input) ? input[fixture.configKey] : undefined).toEqual(values);
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
