import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { applyInstructionsRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/disable/removes-only-owned-aliases",
  title: "Disabling instruction-file management removes only what AXM owns",
  statement:
    "When instruction-file management is disabled, AXM shall record the choice in axm.json and remove only the alias files and ignore regions it owns, and shall preserve authored instruction content and unrelated ignore entries.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/management-is-explicit"],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [
    "When a configured alias path contains an unowned human file, current disable refuses the whole operation; decide whether disabling should preserve that file and still record disabled management. The current preservation promise does not independently choose that policy.",
  ],
});

const readSettings = (fixture: ConfigurationFixture): unknown =>
  JSON.parse(fixture.readFile("axm.json"));

describe("Disabling instruction-file management", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspaceWith = (files: Readonly<Record<string, string>>): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({ settings: { agents: ["claude-code"] }, files });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect(
    "disabling removes only owned aliases and regions while preserving authored prose",
    () => {
      const fixture = workspaceWith({
        "AGENTS.md": "# Authored instructions\n",
        ".gitignore": "dist/\n",
      });
      fs.mkdirSync(path.join(fixture.root, ".git"));
      return fixture
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest({
              action: "enable",
              fileName: "AGENTS.md",
              gitignoreAliases: true,
            });

            yield* applyInstructionsRequest({ action: "disable" });

            expect(readSettings(fixture)).toMatchObject({ instructionFiles: false });
            expect(fixture.exists("CLAUDE.md")).toBe(false);
            expect(fixture.readFile("AGENTS.md")).toBe("# Authored instructions\n");
            expect(fixture.readFile(".gitignore")).toContain("dist/");
            expect(fixture.readFile(".gitignore")).not.toContain("region=instruction-aliases");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("removes stale owned aliases while preserving an unrelated instruction file", () => {
    const fixture = workspaceWith({ "AGENTS.md": "Authored instructions.\n" });
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* applyInstructionsRequest({
            action: "enable",
            fileName: "AGENTS.md",
            gitignoreAliases: false,
          });
          fs.symlinkSync("AGENTS.md", path.join(fixture.root, "GEMINI.md"));
          fixture.writeFile("IFLOW.md", "Unowned instruction content.\n");

          const outcome = yield* applyInstructionsRequest({ action: "disable" });

          expect(outcome).toMatchObject({ outcome: "applied" });
          expect(readSettings(fixture)).toMatchObject({ instructionFiles: false });
          expect(fixture.exists("CLAUDE.md")).toBe(false);
          expect(fixture.exists("GEMINI.md")).toBe(false);
          expect(fixture.readFile("AGENTS.md")).toBe("Authored instructions.\n");
          expect(fixture.readFile("IFLOW.md")).toBe("Unowned instruction content.\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
