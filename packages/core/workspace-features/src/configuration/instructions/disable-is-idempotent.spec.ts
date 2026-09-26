import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { defineSpecification } from "@agentxm/specification-metadata";

import { ManageInstructions } from "./manage-instructions.js";
import { makeConfigurationFixture } from "../testing.js";
import { applyInstructionsRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/disable/disable-is-idempotent",
  title: "Disabling already disabled instruction-file management is a successful no-op",
  statement:
    "When instruction-file management is disabled while already disabled, AXM shall report a no-op outcome and shall not change settings.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/management-is-explicit"],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [],
});

describe("Repeat instruction-file disables are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("disabling an already-disabled capability changes nothing and says so", () => {
    const fixture = makeConfigurationFixture({ settings: { agents: ["claude-code"] } });
    cleanups.push(fixture.cleanup);
    fs.mkdirSync(path.join(fixture.root, ".git"));
    fixture.writeFile("AGENTS.md", "# Authored instructions\n");
    fixture.writeFile(".gitignore", "dist/\n");

    return fixture
      .provide(
        Effect.gen(function* () {
          yield* applyInstructionsRequest({
            action: "enable",
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          });
          yield* applyInstructionsRequest({ action: "disable" });
          const settingsBefore = fixture.readFile("axm.json");

          const repeated = yield* ManageInstructions.prepare({ action: "disable" });

          expect(repeated).toMatchObject({
            _tag: "Unchanged",
            action: "disable",
            message: "Instruction-file management is already disabled.",
          });
          expect(fixture.readFile("axm.json")).toBe(settingsBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
