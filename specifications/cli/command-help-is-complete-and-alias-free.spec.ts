import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import type { Command } from "effect/unstable/cli";

import {
  captureHelpDoc,
  collectCommandAliases,
  collectCommandPaths,
  formatCommandPath,
  rootCommand,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/command-help-is-complete-and-alias-free",
  title: "Every supported command presents help and no alias routes exist",
  statement:
    "Every supported command shall present usable help, the rendered help tree shall list exactly the supported command paths, and no command shall be reachable through an alias route.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access"],
  methods: ["model"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The alias prohibition is phrased as a pre-launch condition in its scenario; whether alias routes stay prohibited after public launch is unresolved.",
  ],
});

interface RegisteredCommand {
  readonly path: ReadonlyArray<string>;
  readonly unlisted: boolean;
}

const registeredCommands = (
  command: Command.Command.Any = rootCommand,
  path: ReadonlyArray<string> = [],
  unlisted = false,
): ReadonlyArray<RegisteredCommand> => [
  { path, unlisted },
  ...command.subcommands.flatMap((group) =>
    group.commands.flatMap((child) =>
      registeredCommands(child, [...path, child.name], unlisted || child.unlisted === true),
    ),
  ),
];

describe("Command help completeness", () => {
  it.effect("every registered command path renders usable command help", () =>
    Effect.gen(function* () {
      const commands = registeredCommands();
      expect(commands.length).toBeGreaterThan(1);
      for (const command of commands) {
        const doc = yield* captureHelpDoc(command.path);
        expect(doc.usage.length, formatCommandPath(command.path)).toBeGreaterThan(0);
      }
    }),
  );

  it.effect("the rendered help walk reaches exactly the listed command tree", () =>
    Effect.gen(function* () {
      const rendered = yield* collectCommandPaths();
      const listed = new Set(
        registeredCommands()
          .filter((command) => !command.unlisted)
          .map((command) => formatCommandPath(command.path)),
      );
      expect(new Set(rendered)).toEqual(listed);
    }),
  );

  it.effect("no registered command carries an alias route before launch", () =>
    Effect.gen(function* () {
      const aliases = yield* collectCommandAliases();
      expect(aliases).toEqual(new Map());
    }),
  );
});
