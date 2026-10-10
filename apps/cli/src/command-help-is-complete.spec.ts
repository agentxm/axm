import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { parseArgsStringToArgv } from "string-argv";
import { parseInvocation } from "./test-support/parser-probe.js";
import { describe, expect, it } from "@effect/vitest";
import type { Command } from "effect/cli";

import {
  captureHelpDoc,
  collectCommandPaths,
  formatCommandPath,
} from "./test-support/command-tree-test-helpers.js";
import { toJsonHelpDoc } from "./cli-runtime/index.js";
import { rootCommand } from "./app.js";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "cli/command-help-is-complete",
  title: "Every supported command describes its invocation and purpose",
  statement:
    "Every supported command shall present help identifying its invocation and purpose, the rendered help tree shall list exactly the supported command paths, every authored parameter shall have a description of at most 88 characters excluding generated facts, every authored example shall parse against the registered command grammar with concrete arguments, and a help request shall reply without reading or changing project or user workspace state, even when that state is malformed.",
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
        const machine = toJsonHelpDoc(doc);
        for (const parameter of [
          ...machine.flags,
          ...(machine.args ?? []),
          ...(machine.globalFlags ?? []),
        ]) {
          // Effect owns its built-in help/version descriptions.
          if (
            parameter.name === "help" ||
            (parameter.name === "version" && parameter.type === "boolean")
          )
            continue;
          const description = parameter.description ?? "";
          expect(description, `${machine.usage}: ${parameter.name}`).not.toMatch(/\brepeatable\b/u);
          expect(description.trim().length, `${machine.usage}: ${parameter.name}`).toBeGreaterThan(
            0,
          );
          expect(description.length, `${machine.usage}: ${parameter.name}`).toBeLessThanOrEqual(88);
        }
      }
    }),
  );

  it.effect("every authored example parses without executing its command", () =>
    Effect.gen(function* () {
      const invalidExamples: Array<string> = [];
      for (const command of registeredCommands()) {
        const doc = yield* captureHelpDoc(command.path);
        for (const example of doc.examples ?? []) {
          expect(example.command, formatCommandPath(command.path)).not.toMatch(/<[^>]+>|\[--/u);
          const [executable, ...args] = parseArgsStringToArgv(example.command);
          expect(executable).toBe("axm");
          const outcome = yield* parseInvocation(args).pipe(Effect.result);
          if (Result.isFailure(outcome))
            invalidExamples.push(`${example.command}: ${JSON.stringify(outcome.failure)}`);
        }
      }
      expect(invalidExamples).toEqual([]);
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
