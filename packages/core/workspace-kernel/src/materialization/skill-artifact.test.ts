import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveNativeReferent } from "../locations/index.js";
import { groupInstallTargetsByDirectory, type InstallableSkillTarget } from "./skill-artifact.js";

// A physical temporary root with the shared and one vendor skills directory, and a
// recording filesystem whose setup calls are already forgotten.
const groupingFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs
    .makeTempDirectoryScoped({ prefix: "axm-skill-grouping-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  const shared = path.join(root, ".agents/skills");
  const claude = path.join(root, ".claude/skills");
  yield* fs.makeDirectory(shared, { recursive: true });
  yield* fs.makeDirectory(claude, { recursive: true });
  const { fileSystem, recording } = makeRecordingFileSystem(fs);
  const group = (targets: ReadonlyArray<InstallableSkillTarget>) =>
    Effect.gen(function* () {
      recording.reset();
      return yield* groupInstallTargetsByDirectory(targets, root).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
      );
    });
  const realPaths = (target: string) =>
    recording.calls({ method: "realPath", path: target }).length;
  const listings = (target: string) =>
    recording.calls({ method: "readDirectory", path: target }).length;
  return { fs, path, root, shared, claude, group, realPaths, listings };
});

describe("skill install target grouping", () => {
  it.effect("resolves a skills directory shared by several agents once per grouping", () =>
    Effect.gen(function* () {
      const { root, shared, claude, group, realPaths, listings } = yield* groupingFixture;
      const locations = yield* group([
        { agentId: "claude-code", targetDir: claude },
        { agentId: "roo", targetDir: shared },
        { agentId: "kilo", targetDir: shared },
        { agentId: "openhands", targetDir: shared },
      ]);
      expect(locations).toEqual([
        { targetDir: shared, agentIds: ["roo", "kilo", "openhands"] },
        { targetDir: claude, agentIds: ["claude-code"] },
      ]);
      expect({
        shared: realPaths(shared),
        claude: realPaths(claude),
        rootListings: listings(root),
      }).toEqual({ shared: 1, claude: 1, rootListings: 2 });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves only the shared directory when no agent is configured", () =>
    Effect.gen(function* () {
      const { root, shared, group, realPaths, listings } = yield* groupingFixture;
      expect(yield* group([])).toEqual([{ targetDir: shared, agentIds: [] }]);
      expect({ shared: realPaths(shared), rootListings: listings(root) }).toEqual({
        shared: 1,
        rootListings: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("still resolves each distinct spelling of one directory before folding it", () =>
    Effect.gen(function* () {
      const { fs, path, root, shared, group, realPaths } = yield* groupingFixture;
      const alias = path.join(root, "alias");
      yield* fs.symlink(shared, alias);
      const locations = yield* group([
        { agentId: "roo", targetDir: alias },
        { agentId: "kilo", targetDir: shared },
        { agentId: "openhands", targetDir: alias },
      ]);
      expect(locations).toEqual([{ targetDir: shared, agentIds: ["roo", "kilo", "openhands"] }]);
      expect({ shared: realPaths(shared), alias: realPaths(alias) }).toEqual({
        shared: 1,
        alias: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves every spelling again in a later grouping and sees a retarget", () =>
    Effect.gen(function* () {
      const { fs, path, root, shared, claude, group, realPaths } = yield* groupingFixture;
      const alias = path.join(root, "alias");
      yield* fs.symlink(shared, alias);
      const targets: ReadonlyArray<InstallableSkillTarget> = [
        { agentId: "roo", targetDir: alias },
        { agentId: "kilo", targetDir: alias },
      ];
      expect(yield* group(targets)).toEqual([{ targetDir: shared, agentIds: ["roo", "kilo"] }]);
      expect({ shared: realPaths(shared), alias: realPaths(alias) }).toEqual({
        shared: 1,
        alias: 1,
      });
      yield* fs.remove(alias);
      yield* fs.symlink(claude, alias);
      expect(yield* group(targets)).toEqual([
        { targetDir: shared, agentIds: [] },
        { targetDir: claude, agentIds: ["roo", "kilo"] },
      ]);
      expect({ shared: realPaths(shared), alias: realPaths(alias) }).toEqual({
        shared: 1,
        alias: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails at the first unresolvable spelling with that spelling", () =>
    Effect.gen(function* () {
      const { fs, path, root, shared, group, realPaths } = yield* groupingFixture;
      const dangling = path.join(root, "dangling");
      yield* fs.symlink(path.join(root, "missing"), dangling);
      const failure = yield* group([
        { agentId: "roo", targetDir: shared },
        { agentId: "kilo", targetDir: dangling },
        { agentId: "openhands", targetDir: dangling },
      ]).pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "NativeLocationError",
        target: dangling,
        reason: "dangling-leaf",
      });
      expect({ shared: realPaths(shared), dangling: realPaths(dangling) }).toEqual({
        shared: 1,
        dangling: 1,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
