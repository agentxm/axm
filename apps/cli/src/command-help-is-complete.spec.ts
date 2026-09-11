import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import type { Command } from "effect/unstable/cli";

import {
  captureHelpDoc,
  collectCommandPaths,
  formatCommandPath,
} from "./test-support/command-tree-test-helpers.js";
import { rootCommand } from "./app.js";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "cli/command-help-is-complete",
  title: "Every supported command describes its invocation and purpose",
  statement:
    "Every supported command shall present help identifying its invocation and purpose, the rendered help tree shall list exactly the supported command paths, and a help request shall reply without reading or changing project or user workspace state, even when that state is malformed.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access"],
  boundary: "memory",
  boundaryRationale:
    "The registered command tree is where help completeness is decided, and it is reachable in process; the malformed-workspace clause needs a real invocation and is bound evidence at apps/cli-e2e/src/help-ignores-workspace-state.e2e.test.ts.",
  methods: ["model", "example"],
  derivedFrom: [
    "cli/command-help-is-complete-and-alias-free",
    "apps/cli-e2e/src/help-ignores-workspace-state.e2e.test.ts",
  ],
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

  // The malformed-workspace controls — a help request replying unchanged and
  // writing nothing against populated, malformed project and user workspace
  // state — need a real process. They run in
  // `apps/cli-e2e/src/help-ignores-workspace-state.e2e.test.ts`, bound to this
  // requirement through that file's `executionBinding`.
});
