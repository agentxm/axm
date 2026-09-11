import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { ManageInstructions } from "./manage-instructions.js";
import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { applyInstructionsRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/enable/enable-is-idempotent",
  title: "Enabling the same instruction configuration is a successful no-op",
  statement:
    "When instruction-file management is enabled with the already-current source file and ignore policy, AXM shall report a no-op and leave settings, source content, aliases and ignore entries unchanged.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["packages/core/workspace-configuration/src/instructions/manage-instructions.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Repeated instruction enable", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const gitManagedWorkspace = (): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({ settings: { agents: ["claude-code"] } });
    cleanups.push(fixture.cleanup);
    fs.mkdirSync(path.join(fixture.root, ".git"));
    fixture.writeFile("AGENTS.md", "Authored instructions.\n");
    fixture.writeFile(".gitignore", "build/\n");
    return fixture;
  };

  // The ignore policy is a two-row supporting matrix: the rule holds whether
  // or not AXM maintains the alias entries in `.gitignore`.
  for (const gitignoreAliases of [true, false])
    it.effect(
      `keeps an already-current instruction configuration with gitignore=${String(gitignoreAliases)}`,
      () => {
        const fixture = gitManagedWorkspace();
        return fixture
          .provide(
            Effect.gen(function* () {
              yield* applyInstructionsRequest({
                action: "enable",
                fileName: "AGENTS.md",
                gitignoreAliases,
              });
              const before = fixture.snapshot();

              const repeated = yield* ManageInstructions.prepare({
                action: "enable",
                fileName: "AGENTS.md",
                gitignoreAliases,
              });

              expect(repeated).toMatchObject({
                _tag: "Unchanged",
                action: "enable",
                message: "Instruction-file management is already enabled.",
              });
              expect(fixture.snapshot()).toEqual(before);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );
});
