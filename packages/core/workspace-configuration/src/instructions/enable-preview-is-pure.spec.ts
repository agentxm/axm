import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { previewInstructionsRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/enable/preview-is-pure",
  title: "Instruction management enable preview describes the aliases without changing any state",
  statement:
    "When instructions enable runs in preview mode for a workspace whose instruction files are unmanaged, it shall report the recorded choice and alias files it would create with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/enable/records-choice-and-reconciles-aliases"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Instruction management enable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A Git workspace with an authored source file and no instruction management. */
  const unmanagedWorkspace = (): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({
      settings: { agents: ["claude-code"] },
      files: { "AGENTS.md": "# Authored instructions\n", ".gitignore": "dist/\n" },
    });
    cleanups.push(fixture.cleanup);
    fs.mkdirSync(path.join(fixture.root, ".git"));
    return fixture;
  };

  it.effect("a previewed enable of unmanaged instruction files changes no protected state", () => {
    const fixture = unmanagedWorkspace();
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const outcome = yield* previewInstructionsRequest({
            action: "enable",
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          });

          expect(outcome).toMatchObject({
            outcome: "previewed",
            resolution: {
              units: [
                expect.objectContaining({
                  state: "ready",
                  artifact: expect.objectContaining({
                    targets: expect.arrayContaining([{ path: "CLAUDE.md", change: "created" }]),
                  }),
                }),
              ],
            },
          });
          expect(fixture.snapshot()).toEqual(before);
          expect(JSON.parse(fixture.readFile("axm.json"))).not.toMatchObject({
            instructionFiles: expect.anything(),
          });
          expect(fixture.exists("CLAUDE.md")).toBe(false);
          expect(fixture.readFile(".gitignore")).toBe("dist/\n");
          expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "a previewed enable whose source file is absent reports the failure and changes nothing",
    () => {
      const fixture = unmanagedWorkspace();
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const settled = yield* previewInstructionsRequest({
              action: "enable",
              fileName: "ABSENT.md",
              gitignoreAliases: true,
            }).pipe(Effect.result);

            expect(settled._tag).toBe("Success");
            expect(fixture.snapshot()).toEqual(before);
            expect(JSON.parse(fixture.readFile("axm.json"))).not.toMatchObject({
              instructionFiles: expect.anything(),
            });
            expect(fixture.exists("CLAUDE.md")).toBe(false);
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
