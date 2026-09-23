import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Ref from "effect/Ref";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../../transitions/settlement/live.js";
import { WorkspaceFileWriteLocks } from "../../transitions/settlement/index.js";
import { WorkspaceStateLive } from "../live.js";
import { AcceptedResolutionWriter } from "../workspace/accepted-resolution-writer.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { TreeIntegritySchema } from "../workspace/materialized-tree.js";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { LockfileSchema, type Lockfile, type SkillLockEntry } from "./schema.js";
import {
  applyLockfileUpdates,
  commitLockfileSnapshotUpdate,
  commitLockfileUpdates,
  writeLockfile,
} from "./lockfile.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);
const localEntry = (pathValue: string, packageName = "review"): SkillLockEntry => ({
  source: { type: "path", path: pathValue },
  identity: {
    owner: decodeHandleSync("@acme"),
    name: decodeExtensionNameSync(packageName),
  },
  resolved: { tree: contentIdentity },
  treeIntegrity,
});

describe("lockfile", () => {
  let root: string;
  let axmDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-lockfile-"));
    axmDir = path.join(root, ".axm");
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const run = <A, E>(
    effect: Effect.Effect<A, E, NodeServices.NodeServices | WorkspaceFileWriteLocks>,
  ) =>
    effect.pipe(
      Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NodeServices.layer)),
    );

  it.effect("writes only current accepted-resolution state", () =>
    run(
      Effect.gen(function* () {
        const lockfile: Lockfile = {
          lockfileVersion: 8,
          skills: { review: localEntry("../sources/review") },
        };
        yield* writeLockfile(axmDir, lockfile);

        const parsed: unknown = YAML.parse(
          fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"),
        );
        expect(parsed).toEqual(lockfile);
        expect(fs.existsSync(path.join(axmDir, "axm-lock.yaml.lock"))).toBe(false);
      }),
    ),
  );

  it("applies pure updates in order", () => {
    const base: Lockfile = { lockfileVersion: 8, skills: {} };
    const result = applyLockfileUpdates(base, [
      (lockfile) => ({ ...lockfile, skills: { review: localEntry("../one") } }),
      (lockfile) => ({
        ...lockfile,
        skills: { ...lockfile.skills, plan: localEntry("../two", "plan") },
      }),
    ]);
    expect(Object.keys(result.skills).sort()).toEqual(["plan", "review"]);
  });

  it.effect("commits updates against the latest on-disk state", () =>
    run(
      Effect.gen(function* () {
        const base: Lockfile = { lockfileVersion: 8, skills: {} };
        yield* writeLockfile(axmDir, {
          lockfileVersion: 8,
          skills: { existing: localEntry("../existing", "existing") },
        });
        const result = yield* commitLockfileUpdates(axmDir, base, [
          (lockfile) => ({
            ...lockfile,
            skills: { ...lockfile.skills, review: localEntry("../review", "review") },
          }),
        ]);
        expect(Object.keys(result.skills).sort()).toEqual(["existing", "review"]);
      }),
    ),
  );

  it.effect("patches only the caller's base-to-next entries", () =>
    run(
      Effect.gen(function* () {
        const base: Lockfile = {
          lockfileVersion: 8,
          skills: { review: localEntry("../old") },
        };
        yield* writeLockfile(axmDir, {
          lockfileVersion: 8,
          skills: { ...base.skills, independent: localEntry("../independent", "independent") },
        });
        const next: Lockfile = {
          lockfileVersion: 8,
          skills: { review: localEntry("../new") },
        };
        const result = yield* commitLockfileSnapshotUpdate(axmDir, base, next);
        expect(result.skills["review"]).toEqual(localEntry("../new"));
        expect(result.skills["independent"]).toEqual(localEntry("../independent", "independent"));
      }),
    ),
  );

  it.effect("shares one file coordinator across independently built workspace graphs", () =>
    run(
      Effect.gen(function* () {
        const locks = yield* WorkspaceFileWriteLocks;
        const calls = yield* Ref.make<ReadonlyArray<string>>([]);
        const observed = WorkspaceFileWriteLocks.of({
          withLock: (target, effect) =>
            Ref.update(calls, (paths) => [...paths, target]).pipe(
              Effect.andThen(locks.withLock(target, effect)),
            ),
        });
        const options = {
          scope: "project",
          projectRoot: decodeAbsolutePathSync(root),
          allowUninitialized: true,
        } as const;
        const first = yield* Layer.build(WorkspaceStateLive(options)).pipe(
          Effect.provideService(WorkspaceFileWriteLocks, observed),
        );
        const second = yield* Layer.build(WorkspaceStateLive(options)).pipe(
          Effect.provideService(WorkspaceFileWriteLocks, observed),
        );
        const firstWriter = Context.get(first, AcceptedResolutionWriter);
        const secondWriter = Context.get(second, AcceptedResolutionWriter);
        yield* Effect.all(
          [
            firstWriter.setAccepted("skill", "first", localEntry("../first", "first")),
            secondWriter.setAccepted("skill", "second", localEntry("../second", "second")),
          ],
          { concurrency: "unbounded" },
        );
        const target = path.join(root, "axm-lock.yaml");
        expect(yield* Ref.get(calls)).toEqual([target, target]);
        const written = Schema.decodeUnknownSync(LockfileSchema)(
          YAML.parse(fs.readFileSync(target, "utf8")),
        );
        expect(Object.keys(written.skills).sort()).toEqual(["first", "second"]);
      }).pipe(Effect.scoped),
    ),
  );
});
