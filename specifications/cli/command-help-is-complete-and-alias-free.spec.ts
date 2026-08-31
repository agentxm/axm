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

import { defineSpecification } from "../support/contract.js";

export const specification = defineSpecification({
  requirement: "cli/command-help-is-complete-and-alias-free",
  title: "Every supported command presents help and no alias routes exist",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access"],
  methods: ["model"],
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
