import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";

import { parserRejection } from "./test-support/parser-probe.js";
import { validateCommandPath } from "./validate-command-path.js";
import { rootCommand } from "./app.js";
import { baseLayer } from "./runtime.js";
import { classifyError } from "./cli-runtime/handle-error.js";

export const specification = defineSpecification({
  requirement: "cli/unknown-commands-remain-usage-errors",
  title: "Help and version flags do not make unknown commands valid",
  statement:
    "An invocation containing an unknown root or nested command, including a retired command, shall fail with usage exit code 2 and contextual command recovery in human and JSON output, even when help or version is requested. Help for a supported command shall remain available without its required operands.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access"],
  boundary: "memory",
  boundaryRationale:
    "The real command grammar and error classification are checked in process; built CLI exits and output channels are bound at apps/cli-e2e/src/unknown-command-help.e2e.test.ts.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unknown command help", () => {
  for (const command of [["inspect"], ["find"], ["outdated"], ["skills", "bogus"]]) {
    it.effect(`${command.join(" ")} preserves the same parser diagnostic with help`, () =>
      Effect.gen(function* () {
        const ordinary = yield* parserRejection(command);
        for (const flag of ["--help", "-h", "--version"]) {
          const withHelp = yield* validateCommandPath(rootCommand, [...command, flag]).pipe(
            Effect.provide(baseLayer),
            Effect.flip,
          );
          expect(withHelp).toEqual(ordinary);
          for (const format of ["text", "json"] as const) {
            expect(classifyError(withHelp, format)).toMatchObject({ exitCode: 2 });
            expect(classifyError(withHelp, format)).toEqual(classifyError(ordinary, format));
            expect(classifyError(withHelp, format).stderr?.join("\n")).toContain(
              command.length > 1 ? "axm skills --help" : "axm --help",
            );
          }
        }
      }),
    );
  }
});
