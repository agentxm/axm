import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { readContainerReceipts } from "../locations/index.js";
import { NativePlatformTest } from "../locations/testing.js";
import { WorkspaceFileWriteLocks } from "../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { ProjectionDigestSchema, ProjectionUnitPathSchema } from "../workspace-state/index.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { reconcileNativeManagedRegion, type NativeManagedRegionArgs } from "./index.js";
import { NativeWriteAuthorityLive } from "./live.js";

/** The live insertion authority over write locks that count acquisitions by target. */
const countedAuthority = (root: string) => {
  const acquisitions: Array<string> = [];
  const locks = Layer.effect(
    WorkspaceFileWriteLocks,
    Effect.map(WorkspaceFileWriteLocks, (inner) =>
      WorkspaceFileWriteLocks.of({
        withLock: (target, effect) =>
          Effect.suspend(() => {
            acquisitions.push(target);
            return inner.withLock(target, effect);
          }),
      }),
    ),
  ).pipe(Layer.provide(WorkspaceFileWriteLocksLive));
  return {
    layer: NativeWriteAuthorityLive.pipe(
      Layer.provide(Layer.merge(WorkspaceReadTest({ baseDir: root }), locks)),
    ),
    count: (target: string) => acquisitions.filter((acquired) => acquired === target).length,
    reset: () => {
      acquisitions.length = 0;
    },
  };
};

const regionArgs = (
  root: string,
  region: "rules" | "knowledge",
  body: string,
): NativeManagedRegionArgs => {
  const owner = {
    name: "guide",
    ref: `@acme/${region}/guide`,
    root: `agent_extensions/registry.agentxm.ai/@acme/${region}/guide`,
    scope: "project" as const,
  };
  return {
    workspaceRoot: root,
    ownerRoot: root,
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    scope: "project",
    targetPath: `${root}/AGENTS.md`,
    displayPath: ProjectionUnitPathSchema.make("AGENTS.md"),
    region,
    body,
    gen: ProjectionDigestSchema.make(`sha256:${"a".repeat(64)}`),
    recorded: Option.none(),
    contributors: body.length === 0 ? [] : [owner],
    ownership: [owner],
    configuredAgentIds: ["codex"],
    eligible: body.length > 0,
  };
};

/** The receipt unit a region's insertion is recorded under. */
const regionUnit = (root: string, region: string) => JSON.stringify([region, "project", root]);

const FOREIGN = "# Foreign instructions\r\n\r\n";

describe("native region withdrawal receipts", () => {
  it.effect("forgets the withdrawn region in the record's one store update", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "AGENTS.md");
      const store = path.join(root, ".axm", "projection-containers.json");
      yield* fs.writeFileString(file, FOREIGN);
      const authority = countedAuthority(root);
      yield* reconcileNativeManagedRegion(regionArgs(root, "rules", "Managed body")).pipe(
        Effect.provide(authority.layer),
      );
      expect(
        (yield* readContainerReceipts(path.join(root, ".axm"))).entries.map(({ unit, kind }) => ({
          unit,
          kind,
        })),
      ).toEqual([{ unit: regionUnit(root, "rules"), kind: "inserted-key" }]);

      authority.reset();
      const removed = yield* reconcileNativeManagedRegion(regionArgs(root, "rules", "")).pipe(
        Effect.provide(authority.layer),
      );
      expect(removed.nativeLocation.state).toBe("removed");
      expect(yield* fs.readFileString(file)).toBe(FOREIGN);
      // The refreshed receipt and its forget leave nothing, so the store retires.
      expect(yield* fs.exists(store)).toBe(false);
      expect(authority.count(store)).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("keeps another region's receipts when one region withdraws", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "AGENTS.md");
      yield* fs.writeFileString(file, FOREIGN);
      const authority = countedAuthority(root);
      for (const region of ["rules", "knowledge"] as const)
        yield* reconcileNativeManagedRegion(regionArgs(root, region, `${region} body`)).pipe(
          Effect.provide(authority.layer),
        );
      const units = Effect.map(readContainerReceipts(path.join(root, ".axm")), ({ entries }) =>
        entries.map(({ unit }) => unit).sort(),
      );
      expect(yield* units).toEqual(
        [regionUnit(root, "knowledge"), regionUnit(root, "rules")].sort(),
      );

      authority.reset();
      yield* reconcileNativeManagedRegion(regionArgs(root, "knowledge", "")).pipe(
        Effect.provide(authority.layer),
      );
      expect(yield* fs.readFileString(file)).not.toContain("axm:knowledge");
      expect(yield* units).toEqual([regionUnit(root, "rules")]);
      expect(authority.count(path.join(root, ".axm", "projection-containers.json"))).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});

/**
 * Per-path route work of one region run over a real temporary workspace. The
 * recording filesystem stands in for the run's own filesystem only; the
 * insertion authority keeps its live one.
 */
const routeWork = Effect.gen(function* () {
  const base = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* base.realPath(yield* base.makeTempDirectoryScoped());
  const { fileSystem, recording } = makeRecordingFileSystem(base);
  const authority = countedAuthority(root);
  const run = (args: NativeManagedRegionArgs) =>
    Effect.gen(function* () {
      recording.reset();
      const result = yield* reconcileNativeManagedRegion(args).pipe(
        Effect.provide(authority.layer),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
      );
      const work = (target: string) => {
        const counts = recording.counts(target);
        return {
          readLink: counts.readLink ?? 0,
          stat: counts.stat ?? 0,
          realPath: counts.realPath ?? 0,
        };
      };
      return { result, work };
    });
  return { root, path, base, run };
});

describe("native region route admissions", () => {
  it.effect("admits the planned target once in a dry run and rechecks it under apply", () =>
    Effect.gen(function* () {
      const { root, path, base, run } = yield* routeWork;
      const file = path.join(root, "AGENTS.md");
      yield* base.writeFileString(file, FOREIGN);
      const withdrawal = regionArgs(root, "rules", "");

      const dryRun = yield* run({ ...withdrawal, dryRun: true });
      expect(dryRun.result.nativeLocation.state).toBe("absent");
      // One admission of the target, its alias recheck and the reader refresh.
      expect({ file: dryRun.work(file), root: dryRun.work(root) }).toEqual({
        file: { readLink: 4, stat: 4, realPath: 4 },
        root: { readLink: 3, stat: 4, realPath: 5 },
      });

      const applied = yield* run(withdrawal);
      expect(applied.result.nativeLocation.state).toBe("absent");
      // Apply also rechecks the target under the exclusive write.
      expect({ file: applied.work(file), root: applied.work(root) }).toEqual({
        file: { readLink: 5, stat: 5, realPath: 7 },
        root: { readLink: 4, stat: 5, realPath: 6 },
      });
      expect(yield* base.readFileString(file)).toBe(FOREIGN);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("rechecks a symlinked display path against the planned physical file", () =>
    Effect.gen(function* () {
      const { root, path, base, run } = yield* routeWork;
      const physical = path.join(root, "original.md");
      const alias = path.join(root, "AGENTS.md");
      yield* base.writeFileString(physical, FOREIGN);
      yield* base.symlink("original.md", alias);
      const withdrawal = { ...regionArgs(root, "rules", ""), targetPath: physical };

      const dryRun = yield* run({ ...withdrawal, dryRun: true });
      expect(dryRun.result.nativeLocation).toMatchObject({
        address: { kind: "region", path: physical, region: "rules" },
        state: "absent",
      });
      expect(dryRun.result.nativeLocation.aliases).toContain(alias);
      expect({
        physical: dryRun.work(physical),
        alias: dryRun.work(alias),
        root: dryRun.work(root),
      }).toEqual({
        physical: { readLink: 3, stat: 3, realPath: 3 },
        alias: { readLink: 3, stat: 2, realPath: 2 },
        root: { readLink: 3, stat: 4, realPath: 6 },
      });

      const applied = yield* run(withdrawal);
      expect({
        physical: applied.work(physical),
        alias: applied.work(alias),
        root: applied.work(root),
      }).toEqual({
        physical: { readLink: 4, stat: 4, realPath: 6 },
        alias: { readLink: 3, stat: 2, realPath: 2 },
        root: { readLink: 4, stat: 5, realPath: 7 },
      });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
