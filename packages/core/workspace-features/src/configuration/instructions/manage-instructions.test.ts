/**
 * Instruction status and instruction-management planning each read the
 * workspace settings and lockfile once per call: one read phase spans the
 * whole call, so every later settings or lockfile query inside it reuses the
 * documents the phase captured. A changed source file name probes symlink
 * capability once while planning, not once per observed configuration.
 *
 * Counts are exact for these fixtures and are taken after fixture setup.
 * Planning an enable also reads both documents once more, outside the read
 * phase, when the execution candidate fingerprints them live.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";

import { makeConfigurationFixture } from "../testing.js";
import { ManageInstructions } from "./manage-instructions.js";
import { applyInstructionsRequest } from "./test-helpers.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const SYMLINK_PROBE = ".axm-instructions-symlink-probe-";

/** Run `effect` after fixture setup and count its document and probe work. */
const measure = <A, E, R>(root: string, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const observations = workObservations(false);
    const value = yield* effect.pipe(observations.provide);
    const kinds = observations.facts.map((fact) => fact.kind);
    return {
      value,
      documents: {
        settingsParses: kinds.filter((kind) => kind === "axm.parse.settings").length,
        lockfileParses: kinds.filter((kind) => kind === "axm.parse.lockfile").length,
        settingsReads: recording.contentReads(nodePath.join(root, "axm.json")),
        lockfileReads: recording.contentReads(nodePath.join(root, "axm.lock")),
      },
      probes: recording
        .calls({ method: "makeTempDirectory" })
        .filter(({ path }) => path.includes(SYMLINK_PROBE)).length,
    };
  });

const enable = (fileName: string) =>
  ({ action: "enable", fileName, gitignoreAliases: false }) as const;

describe("Instruction management reads the workspace documents once per call", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const fixture = (files: Readonly<Record<string, string>> = {}) => {
    const world = makeConfigurationFixture({
      settings: { agents: ["claude-code"] },
      files: { "AGENTS.md": "# Authored instructions\n", ...files },
    });
    cleanups.push(world.cleanup);
    return world;
  };

  it.effect(
    "plans a first enable from one settings read and one lockfile read",
    () => {
      const world = fixture();
      return world
        .provide(
          Effect.gen(function* () {
            const run = yield* measure(world.root, ManageInstructions.prepare(enable("AGENTS.md")));
            if (run.value._tag === "Unchanged") throw new Error("Expected a planned enable");
            // Before one phase spanned planning: 7 settings parses, 6 lockfile
            // parses, 8 settings reads and 7 lockfile reads.
            expect(run.documents).toEqual({
              settingsParses: 1,
              lockfileParses: 1,
              settingsReads: 2,
              lockfileReads: 2,
            });
            // A first enable has no superseded configuration to observe.
            expect(run.probes).toBe(1);
            const resolution = yield* ManageInstructions.previewOrApply(
              run.value,
              previewPlanExecution,
            );
            expect(deriveOperationOutcome(resolution)).toBe("previewed");
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "reports enabled instruction status from one settings read",
    () => {
      const world = fixture();
      return world
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest(enable("AGENTS.md"));
            const run = yield* measure(world.root, ManageInstructions.status());
            expect(run.value.enabled).toBe(true);
            // Before one phase spanned the report: 2 settings parses and reads.
            expect(run.documents).toEqual({
              settingsParses: 1,
              lockfileParses: 1,
              settingsReads: 1,
              lockfileReads: 1,
            });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "reports disabled instruction status without reading the lockfile",
    () => {
      const world = fixture();
      return world
        .provide(
          Effect.gen(function* () {
            const run = yield* measure(world.root, ManageInstructions.status());
            expect(run.value.enabled).toBe(false);
            expect(run.documents).toEqual({
              settingsParses: 1,
              lockfileParses: 0,
              settingsReads: 1,
              lockfileReads: 0,
            });
            expect(run.probes).toBe(0);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "probes symlink capability once while planning a changed source file name",
    () => {
      const world = fixture({
        "OLD.md": "Original authored instructions.\n",
        "TEAM.md": "Selected team instructions.\n",
      });
      return world
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest(enable("OLD.md"));
            const planned = yield* measure(
              world.root,
              ManageInstructions.prepare(enable("TEAM.md")),
            );
            if (planned.value._tag === "Unchanged") throw new Error("Expected a planned enable");
            // Before, the superseded configuration's observation probed again: 2.
            expect(planned.probes).toBe(1);
            expect(planned.value.effects).toContainEqual({
              path: nodePath.join(world.root, "CLAUDE.md"),
              change: "removed",
            });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "probes symlink capability one fewer time across a changed source file name's whole run",
    () => {
      const world = fixture({
        "OLD.md": "Original authored instructions.\n",
        "TEAM.md": "Selected team instructions.\n",
      });
      return world
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest(enable("OLD.md"));
            const run = yield* measure(world.root, applyInstructionsRequest(enable("TEAM.md")));
            expect(fs.readlinkSync(nodePath.join(world.root, "CLAUDE.md"))).toBe("TEAM.md");
            // Planning probes once and the locked transition twice; before, 4.
            expect(run.probes).toBe(3);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "refuses a plan whose settings changed after planning without writing",
    () => {
      const world = fixture();
      return world
        .provide(
          Effect.gen(function* () {
            const candidate = yield* ManageInstructions.prepare(enable("AGENTS.md"));
            if (candidate._tag === "Unchanged") throw new Error("Expected a planned enable");
            world.writeFile(
              "axm.json",
              `${JSON.stringify({ agents: ["claude-code", "cursor"] }, null, 2)}\n`,
            );
            const before = world.snapshot();
            const resolution = yield* ManageInstructions.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            );
            expect(deriveOperationOutcome(resolution)).toBe("blocked");
            expect(resolution.blocking).toMatchObject({
              class: "stale-candidate",
              phase: "validation",
              detail: "The execution candidate became stale before apply.",
            });
            expect(world.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "fails on an unreadable lockfile or settings document with the parse failure",
    () => {
      const world = fixture();
      return world
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest(enable("AGENTS.md"));
            const settings = world.readFile("axm.json");
            world.writeFile("axm.lock", "this is = not [ a lockfile\n");
            const lockfile = [
              yield* Effect.flip(ManageInstructions.status()),
              yield* Effect.flip(ManageInstructions.prepare(enable("TEAM.md"))),
            ];
            world.writeFile("axm.json", "{ not json\n");
            const settingsDocument = [
              yield* Effect.flip(ManageInstructions.status()),
              yield* Effect.flip(ManageInstructions.prepare(enable("TEAM.md"))),
            ];
            world.writeFile("axm.json", settings);
            for (const failure of lockfile) {
              expect(failure).toMatchObject({
                _tag: "LockfileParseError",
                message: "",
                path: nodePath.join(world.workspaceRoot, "axm.lock"),
                raw: "this is = not [ a lockfile\n",
              });
            }
            for (const failure of settingsDocument) {
              expect(failure).toMatchObject({
                _tag: "SettingsParseError",
                path: nodePath.join(world.workspaceRoot, "axm.json"),
                raw: "[Settings input withheld]",
              });
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 30_000 },
  );
});

/**
 * Disabling instruction management under the transition lock removes the
 * alias region with the observation's own `.gitignore` admission when no
 * alias removal wrote between them; the region write keeps its own Git walk,
 * admission and locked read. Any removed alias, an absent region or a
 * workspace outside Git keeps every live check. Counts cover the locked
 * apply only, after planning.
 */
describe("Instruction management disable removes the alias region once observed", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const cases = [
    {
      name: "removes the region observed when no alias is left to remove",
      git: true,
      gitignoreAliases: true,
      removeAlias: true,
      expected: {
        // Before: 11 reads, 4 Git walks, and one more unlocked admission and
        // read of the file (readLink 39, realPath 36, stat 47).
        gitignoreReads: 10,
        gitignore: {
          access: 2,
          copy: 1,
          readFile: 10,
          readLink: 37,
          realPath: 34,
          stat: 45,
          writeFile: 1,
        },
        git: 3,
      },
    },
    {
      name: "re-reads the region live after removing an owned alias",
      git: true,
      gitignoreAliases: true,
      removeAlias: false,
      expected: {
        gitignoreReads: 11,
        gitignore: {
          access: 2,
          copy: 1,
          readFile: 11,
          readLink: 39,
          realPath: 36,
          stat: 47,
          writeFile: 1,
        },
        git: 4,
      },
    },
    {
      name: "keeps the live checks behind a disable that finds no region",
      git: true,
      gitignoreAliases: false,
      removeAlias: true,
      expected: {
        gitignoreReads: 4,
        gitignore: { readFile: 4, readLink: 13, realPath: 12, stat: 15 },
        git: 3,
      },
    },
    {
      name: "keeps the live Git walk outside a Git checkout",
      git: false,
      gitignoreAliases: true,
      removeAlias: true,
      expected: {
        gitignoreReads: 2,
        gitignore: { readFile: 2, readLink: 8, realPath: 7, stat: 10 },
        git: 3,
      },
    },
  ] as const;

  for (const scenario of cases)
    it.effect(
      scenario.name,
      () => {
        const world = makeConfigurationFixture({
          settings: { agents: ["claude-code"] },
          files: { "AGENTS.md": "# Authored instructions\n", ".gitignore": "dist/\n" },
        });
        cleanups.push(world.cleanup);
        if (scenario.git) fs.mkdirSync(nodePath.join(world.root, ".git"));
        const gitignore = nodePath.join(world.root, ".gitignore");
        const alias = nodePath.join(world.root, "CLAUDE.md");
        return world
          .provide(
            Effect.gen(function* () {
              const recording = yield* FileSystemRecorder;
              yield* applyInstructionsRequest({
                action: "enable",
                fileName: "AGENTS.md",
                gitignoreAliases: scenario.gitignoreAliases,
              });
              const regionWritten = scenario.git && scenario.gitignoreAliases;
              expect(world.readFile(".gitignore").includes("axm:instruction-aliases")).toBe(
                regionWritten,
              );
              if (scenario.removeAlias) fs.rmSync(alias);
              const candidate = yield* ManageInstructions.prepare({ action: "disable" });
              if (candidate._tag === "Unchanged") throw new Error("Expected a planned disable");
              recording.reset();
              const resolution = yield* ManageInstructions.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              );
              const counts = {
                gitignoreReads: recording.contentReads(gitignore),
                gitignore: recording.counts(gitignore),
                git: recording.calls({ path: nodePath.join(world.root, ".git") }).length,
              };
              expect(deriveOperationOutcome(resolution)).toBe("applied");
              expect(world.readFile(".gitignore")).toBe("dist/\n");
              expect(fs.existsSync(alias)).toBe(false);
              expect(JSON.parse(world.readFile("axm.json"))).toMatchObject({
                instructionFiles: false,
              });
              expect(world.readFile("axm.lock")).not.toContain(".gitignore");
              expect(counts).toEqual(scenario.expected);
            }),
          )
          .pipe(Effect.provide(recordedNodeServices));
      },
      { timeout: 30_000 },
    );
});
