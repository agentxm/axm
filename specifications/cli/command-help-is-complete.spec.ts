import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import type { Command } from "effect/unstable/cli";

import {
  captureHelpDoc,
  collectCommandPaths,
  formatCommandPath,
  rootCommand,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/command-help-is-complete",
  title: "Every supported command describes its invocation and purpose",
  statement:
    "Every supported command shall present help identifying its invocation and purpose, and the rendered help tree shall list exactly the supported command paths.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access"],
  methods: ["model"],
  derivedFrom: ["cli/command-help-is-complete-and-alias-free"],
  supersedes: ["cli/command-help-is-complete-and-alias-free"],
  assumptions: [],
  openQuestions: [],
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
  it.effect("every registered command describes its invocation and purpose", () =>
    Effect.gen(function* () {
      const commands = registeredCommands();
      expect(commands.length).toBeGreaterThan(1);
      for (const command of commands) {
        const doc = yield* captureHelpDoc(command.path);
        expect(doc.usage, formatCommandPath(command.path)).toContain(
          formatCommandPath(command.path),
        );
        expect(doc.description.trim().length, formatCommandPath(command.path)).toBeGreaterThan(0);
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
});
