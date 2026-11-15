import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { codingAgentFromDescriptor } from "../agent-adapters/index.js";
import {
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  resolveNativeReferent,
} from "../locations/index.js";
import { NativePlatformTest } from "../locations/testing.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceStateTest } from "../workspace-state/testing.js";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import { observeConfiguredSkillLocations } from "./skill-location-observation.js";
import { makeCodingAgentRepository } from "./testing.js";

// One unconditional reader isolates the copied row from vendor-specific location selection.
const fixtureReader = codingAgentFromDescriptor({
  id: "openclaw",
  name: "Fixture Skill reader",
  detection: { project: { markers: [] }, user: { markers: [] } },
  skills: {
    scopes: ["project"],
    writerSupported: false,
    locations: [
      {
        scope: "project",
        root: "project",
        path: "fixture-skills",
        shape: "directory",
        role: "primary",
        status: "canonical",
        applicability: { kind: "always" },
        provenance: { kind: "capability-sources" },
      },
    ],
  },
});
const repositoryLayer = Layer.succeed(CodingAgentRepository, {
  ...makeCodingAgentRepository([fixtureReader.id]),
  all: Effect.succeed([fixtureReader]),
});

// Captures a copy of a workspace skill source at the reader location, applies an optional edit, and
// observes the configured row with the receipt reads recorded.
const observeCopiedRow = (
  edit: (paths: {
    readonly source: string;
    readonly target: string;
  }) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs
      .makeTempDirectoryScoped({ prefix: "axm-copied-skill-row-" })
      .pipe(Effect.flatMap(resolveNativeReferent));
    const write = (relative: string, content: string) =>
      Effect.gen(function* () {
        const file = path.join(root, relative);
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* fs.writeFileString(file, content);
      });
    yield* write(
      "axm.json",
      JSON.stringify({
        owner: "@acme",
        agents: [fixtureReader.id],
        skills: { review: { source: "workspace", enabled: true } },
      }),
    );
    yield* write(
      "skills/review/skill.json",
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    const source = path.join(root, "skills/review/src");
    const target = path.join(root, "fixture-skills/review");
    for (const directory of [source, target]) {
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.writeFileString(
        path.join(directory, "SKILL.md"),
        "---\nname: review\ndescription: Review\n---\nReview\n",
      );
      yield* fs.writeFileString(path.join(directory, "README.md"), "Read me\n");
      yield* fs.symlink("README.md", path.join(directory, "link"));
    }
    expect(Option.isSome(yield* captureCopiedDirectory(target, source))).toBe(true);
    yield* edit({ source, target });
    const receiptPath = yield* copiedDirectoryReceiptPath(target);
    const { fileSystem, recording } = makeRecordingFileSystem(fs);
    const state = WorkspaceStateTest({
      projectRoot: decodeAbsolutePathSync(root),
      scope: "project",
    }).pipe(
      Layer.provide(WorkspaceFileWriteLocksLive),
      Layer.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } })),
      ),
    );
    const observed = yield* Effect.gen(function* () {
      recording.reset();
      return yield* observeConfiguredSkillLocations({
        type: "skill",
        state: "current",
        scope: "project",
        agentIds: [fixtureReader.id],
        rows: [{ name: "review", targetState: "enabled", installed: true }],
      });
    }).pipe(
      Effect.provide(Layer.merge(state, repositoryLayer)),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
    );
    const row = observed.get("review");
    return {
      agentReasons: row?.agentOutcomes.map((outcome) => outcome.reasonCode),
      copiedUnits: row?.nativeLocations
        .filter((unit) => unit.aliases.includes(target))
        .map((unit) => ({
          state: unit.state,
          ownership: unit.ownership,
          mechanism: unit.mechanism,
          proof: unit.proof,
          reason: unit.reason,
        })),
      receiptReads: recording.counts(receiptPath).readFile,
    };
  });

describe("configured skill location observation", () => {
  it.effect("reads a copied row's receipt once for ownership and currency", () =>
    Effect.gen(function* () {
      const observed = yield* observeCopiedRow(() => Effect.void);
      expect(observed.agentReasons).toEqual(["verified-native-unit"]);
      expect(observed.copiedUnits).toEqual([
        {
          state: "unchanged",
          ownership: "owned",
          mechanism: "copied-directory",
          proof: "bounded-copy-receipt",
          reason: undefined,
        },
      ]);
      expect(observed.receiptReads).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("still checks a copied row's currency from the single receipt read", () =>
    Effect.gen(function* () {
      const observed = yield* observeCopiedRow(({ target }) =>
        Effect.flatMap(Path.Path, (path) =>
          Effect.flatMap(FileSystem.FileSystem, (fs) =>
            fs.writeFileString(path.join(target, "README.md"), "Edited by hand\n"),
          ),
        ),
      );
      expect(observed.copiedUnits).toEqual([
        {
          state: "blocked",
          ownership: "owned",
          mechanism: "copied-directory",
          proof: "bounded-copy-receipt",
          reason: "The owned copy differs from its canonical source.",
        },
      ]);
      expect(observed.agentReasons).toEqual(["native-content-conflict"]);
      expect(observed.receiptReads).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
