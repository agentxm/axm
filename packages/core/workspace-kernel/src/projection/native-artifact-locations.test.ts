import { NativePlatformTest } from "../locations/testing.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { codingAgentForId } from "../agent-adapters/index.js";
import { captureCopiedDirectory, copiedDirectoryReceiptPath } from "../locations/index.js";
import { nativeArtifactLocationOutcomes } from "./index.js";

/** A bounded copy at the shared skill directory, reachable through a parent alias too. */
const copiedSkill = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
  const source = path.join(root, "source");
  const target = path.join(root, ".agents/skills/review");
  for (const directory of [source, target]) {
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* fs.writeFileString(path.join(directory, "SKILL.md"), "# Review\n");
  }
  expect(Option.isSome(yield* captureCopiedDirectory(target, source))).toBe(true);
  yield* fs.symlink(path.join(root, ".agents/skills"), path.join(root, "alias"));
  return { fs, path, root, source, target, receiptPath: yield* copiedDirectoryReceiptPath(target) };
});

type Target = Parameters<typeof nativeArtifactLocationOutcomes>[0]["targets"][number];

const outcomesRecorded = (root: string, target: Target) =>
  Effect.gen(function* () {
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    recording.reset();
    const outcomes = yield* nativeArtifactLocationOutcomes({
      workspaceRoot: root,
      scope: "project",
      sharedSkillPolicy: true,
      agents: [codingAgentForId("codex")],
      configuredAgentIds: new Set<string>(),
      targets: [target],
    }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
    return { outcomes, recording };
  });

describe("native artifact location capture of copied skills", () => {
  it.effect("uses a receipt presence observed for the resolved entry instead of rereading", () =>
    Effect.gen(function* () {
      const { root, source, target, receiptPath } = yield* copiedSkill;
      const base = { path: target, kind: "skill", state: "unchanged", sourcePath: source } as const;

      const read = yield* outcomesRecorded(root, base);
      const observed = yield* outcomesRecorded(root, {
        ...base,
        copyReceipt: { directory: target, present: true },
      });

      expect(read.recording.contentReads(receiptPath)).toBe(1);
      expect(observed.recording.contentReads(receiptPath)).toBe(0);
      expect(observed.outcomes).toEqual(read.outcomes);
      expect(read.outcomes).toEqual([
        expect.objectContaining({
          address: { kind: "entry", path: target },
          mechanism: "copied-directory",
          ownership: "owned",
          proof: "bounded-copy-receipt",
        }),
      ]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("reads the receipt itself when the presence names another spelling of the entry", () =>
    Effect.gen(function* () {
      const { path, root, source, target, receiptPath } = yield* copiedSkill;
      const aliased = path.join(root, "alias", "review");

      const { outcomes, recording } = yield* outcomesRecorded(root, {
        path: aliased,
        kind: "skill",
        state: "unchanged",
        sourcePath: source,
        copyReceipt: { directory: aliased, present: false },
      });

      expect(recording.contentReads(receiptPath)).toBe(1);
      expect(outcomes).toEqual([
        expect.objectContaining({
          address: { kind: "entry", path: target },
          mechanism: "copied-directory",
          ownership: "owned",
          proof: "bounded-copy-receipt",
        }),
      ]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("ignores a receipt presence for an entry that is not a directory", () =>
    Effect.gen(function* () {
      const { fs, path, root, source } = yield* copiedSkill;
      const linked = path.join(root, ".agents/skills/linked");
      yield* fs.symlink(source, linked);

      const { outcomes, recording } = yield* outcomesRecorded(root, {
        path: linked,
        kind: "skill",
        state: "unchanged",
        sourcePath: source,
        copyReceipt: { directory: linked, present: true },
      });

      expect(recording.calls({ path: yield* copiedDirectoryReceiptPath(linked) })).toEqual([]);
      expect(outcomes).toEqual([
        expect.objectContaining({ mechanism: "symlink", proof: "exact-canonical-source-link" }),
      ]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
