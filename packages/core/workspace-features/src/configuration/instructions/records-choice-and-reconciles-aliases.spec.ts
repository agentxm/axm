import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { defineSpecification } from "@agentxm/specification-metadata";
import { ProjectionOutputPosture } from "@agentxm/workspace-kernel/projection";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { applyInstructionsRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/enable/records-choice-and-reconciles-aliases",
  title:
    "Enabling instruction-file management records the explicit choice and reconciles aliases together",
  statement:
    "When instruction-file management is enabled, AXM shall record the explicit choice and its source file in axm.json and shall reconcile the alias files and ignore regions it owns in the same operation. An alias copy is byte-identical to its source. A differing file at an alias path that AXM has no record of writing blocks the operation unless replacing unrecorded files is explicitly requested.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  boundaryRationale:
    "Production configuration and reconciliation share a native temporary workspace; settings, lockfile and projection observations include physical files and links.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "cli/instructions/management-is-explicit",
    "cli/mutations-are-closure-atomic",
    "cli/invalid-ownership-markers-block-reconciliation",
  ],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [],
});

const readSettings = (fixture: ConfigurationFixture): unknown =>
  JSON.parse(fixture.readFile("axm.json"));

describe("Enabling instruction-file management", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const gitManaged = (
    files: Readonly<Record<string, string>>,
    settings?: Readonly<Record<string, unknown>>,
  ): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({
      settings: { agents: ["claude-code"], ...settings },
      files,
    });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("enabling records the explicit choice and reconciles aliases as one operation", () => {
    const fixture = gitManaged({
      "AGENTS.md": "# Authored instructions\n",
      ".gitignore": "dist/\n",
    });
    fs.mkdirSync(path.join(fixture.root, ".git"));
    return fixture
      .provide(
        Effect.gen(function* () {
          const outcome = yield* applyInstructionsRequest({
            action: "enable",
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          });

          expect(outcome).toMatchObject({ outcome: "applied" });
          expect(readSettings(fixture)).toMatchObject({
            instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
          });
          expect(fs.lstatSync(path.join(fixture.root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
          expect(fixture.readFile(".gitignore")).toContain("# axm:instruction-aliases\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "changes the selected source and owned alias without editing either authored document",
    () => {
      const fixture = gitManaged({
        "AGENTS.md": "Original authored instructions.\n",
        "TEAM.md": "Selected team instructions.\n",
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest({
              action: "enable",
              fileName: "AGENTS.md",
              gitignoreAliases: false,
            });
            const outcome = yield* applyInstructionsRequest({
              action: "enable",
              fileName: "TEAM.md",
              gitignoreAliases: false,
            });

            expect(outcome).toMatchObject({ outcome: "applied" });
            expect(readSettings(fixture)).toMatchObject({
              instructionFiles: { fileName: "TEAM.md", gitignoreAliases: false },
            });
            expect(fs.readlinkSync(path.join(fixture.root, "CLAUDE.md"))).toBe("TEAM.md");
            expect(fixture.readFile("AGENTS.md")).toBe("Original authored instructions.\n");
            expect(fixture.readFile("TEAM.md")).toBe("Selected team instructions.\n");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  // The choice is never left recorded when its aliases cannot be reconciled.
  // How the restoration itself is performed is owned by
  // `cli/mutations-are-closure-atomic`.
  it.effect(
    "restores settings and aliases when the owned ignore region cannot be reconciled",
    () => {
      const fixture = gitManaged({ "AGENTS.md": "Human instructions.\n" });
      fs.mkdirSync(path.join(fixture.root, ".git"));
      fs.mkdirSync(path.join(fixture.root, ".gitignore"));
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const outcome = yield* applyInstructionsRequest({
              action: "enable",
              fileName: "AGENTS.md",
              gitignoreAliases: true,
            });

            expect(outcome).toMatchObject({ outcome: "failed" });
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  // Supporting coverage for two rules this one depends on: a region whose
  // fences are malformed blocks reconciliation
  // (`cli/invalid-ownership-markers-block-reconciliation`), and a refused
  // request writes nothing (`cli/mutations-are-closure-atomic`).
  it.effect(
    "refuses malformed region fences before changing settings or any affected alias",
    () => {
      const malformed = "dist/\n# axm:instruction-aliases\n/GEMINI.md\n";
      const fixture = gitManaged(
        {
          "AGENTS.md": "Preserved authored instructions.\n",
          "unrelated.txt": "Unrelated human bytes.\n",
          ".gitignore": malformed,
        },
        { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true } },
      );
      fs.mkdirSync(path.join(fixture.root, ".git"));
      fs.symlinkSync("AGENTS.md", path.join(fixture.root, "GEMINI.md"));
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const outcome = yield* applyInstructionsRequest({
              action: "enable",
              fileName: "AGENTS.md",
              gitignoreAliases: true,
            });

            expect(outcome).toMatchObject({
              candidate: { blocked: { _tag: "Some" } },
              outcome: "blocked",
              resolution: {
                blocking: { class: "precondition-unmet", causeCode: "conflict" },
              },
            });
            expect(
              "resolution" in outcome
                ? outcome.resolution.units.filter((unit) => unit.state === "committed")
                : undefined,
            ).toEqual([]);
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.exists("CLAUDE.md")).toBe(false);
            expect(fs.readlinkSync(path.join(fixture.root, "GEMINI.md"))).toBe("AGENTS.md");
            expect(fixture.readFile(".gitignore")).toBe(malformed);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  for (const replaceUnrecorded of [false, true])
    it.effect(
      `${replaceUnrecorded ? "replaces" : "blocks on"} a differing alias AXM has no record of writing`,
      () => {
        const privateNotes = "Private notes AXM never wrote.\n";
        const fixture = gitManaged({
          "AGENTS.md": "Authored instructions.\n",
          "CLAUDE.md": privateNotes,
        });
        const before = fixture.snapshot();
        return fixture
          .provide(
            Effect.gen(function* () {
              const outcome = yield* applyInstructionsRequest({
                action: "enable",
                fileName: "AGENTS.md",
                gitignoreAliases: false,
              }).pipe(Effect.provideService(ProjectionOutputPosture, { replaceUnrecorded }));

              if (replaceUnrecorded) {
                expect(outcome).toMatchObject({ outcome: "applied" });
                expect(fs.readlinkSync(path.join(fixture.root, "CLAUDE.md"))).toBe("AGENTS.md");
              } else {
                expect(outcome).toMatchObject({ outcome: "blocked" });
                expect(
                  "candidate" in outcome && Option.isSome(outcome.candidate.blocked)
                    ? outcome.candidate.blocked.value.detail
                    : "",
                ).toContain("--replace-unrecorded");
                expect(fixture.snapshot()).toEqual(before);
                expect(fixture.readFile("CLAUDE.md")).toBe(privateNotes);
              }
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );
});
