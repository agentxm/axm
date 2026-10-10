import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import { Command } from "effect/cli";

import { handleHelpPath } from "./command.js";
import { TestRenderer } from "../../test-support/presenter-test.js";

export const specification = defineSpecification({
  requirement: "cli/help/unknown-paths-offer-contextual-recovery",
  title: "Unknown help paths offer the nearest command help and topic discovery",
  statement:
    "When a help path does not resolve, AXM shall report not_found and suggest the longest valid canonical command prefix's help, or root help when no prefix resolves, followed by topic discovery.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const root = Command.make("axm").pipe(
  Command.withSubcommands([
    Command.make("skills").pipe(
      Command.withAlias("sk"),
      Command.withSubcommands([Command.make("install")]),
    ),
  ]),
);

describe("Unknown help path recovery", () => {
  for (const [path, help] of [
    [["unknown"], "axm --help"],
    [["skills", "unknown"], "axm skills --help"],
    [["skills", "install", "extra"], "axm skills install --help"],
    [["sk", "unknown"], "axm skills --help"],
    [["unknown", "skills"], "axm --help"],
  ] as const) {
    it.effect(`${path.join(" ")} offers ${help}`, () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleHelpPath(path, root).pipe(Effect.provide(TestRenderer.make().layer)),
        );
        expect(error).toMatchObject({
          _tag: "AppError",
          code: "not_found",
          suggestions: [{ cmd: help }, { cmd: "axm help" }],
        });
      }),
    );
  }

  it.effect("a valid alias delegates to canonical command help", () =>
    Effect.gen(function* () {
      const signal = yield* Effect.flip(
        handleHelpPath(["sk", "install"], root).pipe(Effect.provide(TestRenderer.make().layer)),
      );
      expect(signal).toMatchObject({
        _tag: "ShowHelp",
        commandPath: ["axm", "skills", "install"],
        errors: [],
      });
    }),
  );
});
