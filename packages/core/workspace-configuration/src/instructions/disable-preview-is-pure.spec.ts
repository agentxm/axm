import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { applyInstructionsRequest, previewInstructionsRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/disable/preview-is-pure",
  title: "Instruction management disable preview describes the removals without changing any state",
  statement:
    "When instructions disable runs in preview mode for a workspace with managed instruction files, it shall report the recorded choice and owned aliases it would remove with a previewed outcome and shall not change settings, alias files, ignore regions, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/disable/removes-only-owned-aliases"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "A preview whose request is already satisfied settles as a no-op here because the instructions use case detects 'already current' before planning, while install's satisfied preview reports 'previewed'. The plan-family decision at workspace-operations — whether every planner settles the satisfied case before planning — determines which outcome this example asserts; until then it records current behaviour.",
  ],
});

describe("Instruction management disable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixtureWith = (files: Readonly<Record<string, string>> = {}): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({ settings: { agents: ["claude-code"] }, files });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("a previewed disable of managed instruction files changes no protected state", () => {
    const fixture = fixtureWith({
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
          expect(fs.lstatSync(path.join(fixture.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
          const before = fixture.snapshot();

          const outcome = yield* previewInstructionsRequest({ action: "disable" });

          expect(outcome).toMatchObject({
            outcome: "previewed",
            resolution: {
              units: [
                expect.objectContaining({
                  state: "ready",
                  artifact: expect.objectContaining({
                    targets: expect.arrayContaining([{ path: "CLAUDE.md", change: "removed" }]),
                  }),
                }),
              ],
            },
          });
          expect(fixture.snapshot()).toEqual(before);
          expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
          });
          expect(fs.lstatSync(path.join(fixture.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
          expect(fixture.readFile(".gitignore")).toContain("region=instruction-aliases");
          expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "a previewed disable of already unmanaged instruction files reports a no-op and changes nothing",
    () => {
      const fixture = fixtureWith();
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const outcome = yield* previewInstructionsRequest({ action: "disable" });

            expect(outcome).toMatchObject({
              _tag: "Unchanged",
              action: "disable",
              message: "Instruction-file management is already disabled.",
            });
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
