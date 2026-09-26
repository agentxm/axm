import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { defineSpecification } from "@agentxm/specification-metadata";

import { ManageInstructions } from "./manage-instructions.js";
import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { applyInstructionsRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/status-reports-without-changing-state",
  title: "Instruction-file status is inspected without changing workspace state",
  statement:
    "When instruction-file management status is inspected, AXM shall report whether management is enabled and, when it is, the source file and the managed target for each configured agent together with stale owned aliases, and shall not change settings or instruction files.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["cli/instructions/management-is-explicit"],
  supersedes: ["cli/instructions/management-is-explicit"],
  assumptions: [],
  openQuestions: [],
});

describe("Instruction-file status", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixtureWith = (
    settings: Readonly<Record<string, unknown>>,
    files: Readonly<Record<string, string>> = {},
  ): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({ settings, files });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  const instructionsWorkspace = (): ConfigurationFixture => {
    const fixture = fixtureWith(
      { agents: ["claude-code"] },
      { "AGENTS.md": "# Authored instructions\n", ".gitignore": "dist/\n" },
    );
    fs.mkdirSync(path.join(fixture.root, ".git"));
    return fixture;
  };

  it.effect("reports the capability as not configured without changing state", () => {
    const fixture = instructionsWorkspace();
    const settingsBefore = fixture.readFile("axm.json");
    return fixture
      .provide(
        Effect.gen(function* () {
          const status = yield* ManageInstructions.status();

          expect(status).toMatchObject({ enabled: false });
          expect(fixture.readFile("axm.json")).toBe(settingsBefore);
          expect(fixture.exists("CLAUDE.md")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports the managed target for each configured agent without changing state", () => {
    const fixture = instructionsWorkspace();
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* applyInstructionsRequest({
            action: "enable",
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          });
          const settingsBefore = fixture.readFile("axm.json");
          const ignoreBefore = fixture.readFile(".gitignore");

          const status = yield* ManageInstructions.status();

          expect(status).toMatchObject({
            enabled: true,
            sourceFileName: "AGENTS.md",
            items: [expect.objectContaining({ agentId: "claude-code" })],
          });
          expect(fixture.readFile("axm.json")).toBe(settingsBefore);
          expect(fixture.readFile(".gitignore")).toBe(ignoreBefore);
          expect(fixture.readFile("AGENTS.md")).toBe("# Authored instructions\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports an explicit disabled choice without changing content", () => {
    const fixture = instructionsWorkspace();
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* applyInstructionsRequest({
            action: "enable",
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          });
          yield* applyInstructionsRequest({ action: "disable" });
          const before = fixture.snapshot();

          const status = yield* ManageInstructions.status();

          expect(status).toMatchObject({ enabled: false, items: [], staleTargets: [] });
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports enabled management with no configured agent targets", () => {
    const fixture = fixtureWith({ agents: [] }, { "AGENTS.md": "Authored instructions.\n" });
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* applyInstructionsRequest({
            action: "enable",
            fileName: "AGENTS.md",
            gitignoreAliases: false,
          });
          const before = fixture.snapshot();

          const status = yield* ManageInstructions.status();

          expect(status).toMatchObject({
            enabled: true,
            sourceFileName: "AGENTS.md",
            items: [],
            staleTargets: [],
          });
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("distinguishes a current configured alias from a stale owned alias", () => {
    const fixture = instructionsWorkspace();
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
          const before = fixture.snapshot();

          const status = yield* ManageInstructions.status();

          expect(status).toMatchObject({
            enabled: true,
            items: [
              expect.objectContaining({
                agentId: "claude-code",
                health: "ok",
                ownership: "owned-current",
                observedForm: "symlink",
              }),
            ],
            staleTargets: [
              expect.objectContaining({
                agentId: "gemini-cli",
                health: "stale",
                targetFile: path.join(fixture.root, "GEMINI.md"),
              }),
            ],
          });
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports a missing selected source without creating the source or its alias", () => {
    const fixture = fixtureWith(
      {
        agents: ["claude-code"],
        instructionFiles: { fileName: "TEAM.md", gitignoreAliases: false },
      },
      { "unrelated.txt": "Authored unrelated bytes.\n" },
    );
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const report = yield* ManageInstructions.status();

          expect(report.enabled).toBe(true);
          expect(report.sourceFileName).toBe("TEAM.md");
          expect(report.missingSources).toEqual([path.join(fixture.root, "TEAM.md")]);
          expect(report.items).toEqual([
            expect.objectContaining({
              agentId: "claude-code",
              sourceFile: path.join(fixture.root, "TEAM.md"),
              targetFile: path.join(fixture.root, "CLAUDE.md"),
              health: "missing-source",
              ownership: "absent",
              observedForm: "none",
            }),
          ]);
          expect(report.staleTargets).toEqual([]);
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "distinguishes supported instruction sources from native rules directories it does not write",
    () => {
      const fixture = fixtureWith(
        {
          agents: ["cursor", "roo", "codex"],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        },
        { "AGENTS.md": "Shared authored instructions.\n" },
      );
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const report = yield* ManageInstructions.status();

            expect(report.missingSources).toEqual([]);
            expect(report.items.map((item) => item.agentId).sort()).toEqual([
              "codex",
              "cursor",
              "roo",
            ]);
            expect(report.items.find((item) => item.agentId === "roo")).toMatchObject({
              mechanism: "adapter",
              health: "unsupported",
              ownership: "absent",
              observedForm: "none",
            });
            expect(report.items.find((item) => item.agentId === "cursor")).toMatchObject({
              sourceFile: path.join(fixture.root, "AGENTS.md"),
              targetFile: path.join(fixture.root, "AGENTS.md"),
              mechanism: "native",
              health: "ok",
            });
            expect(report.items.find((item) => item.agentId === "codex")).toMatchObject({
              mechanism: "native",
              health: "ok",
            });
            expect(fixture.exists(".roo")).toBe(false);
            expect(fixture.exists(".cursor")).toBe(false);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
