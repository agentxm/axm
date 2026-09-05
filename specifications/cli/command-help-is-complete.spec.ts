import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
  title: "Every supported command presents complete help",
  statement:
    "Every supported command shall present usable help, and the rendered help tree shall list exactly the supported command paths.",
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
  it.effect("login help explains how to bound a pending device sign-in wait", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["login"]);
      const timeout = doc.flags.find((flag) => flag.name === "timeout");
      expect(timeout).toBeDefined();
      expect(timeout && Option.getOrElse(timeout.description, () => "")).toContain(
        "requires --wait",
      );
      expect(doc.examples).toContainEqual({
        command: "axm login --wait --timeout 300",
        description: "Wait up to 300 seconds for a pending device sign-in",
      });
    }),
  );

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
});
