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
