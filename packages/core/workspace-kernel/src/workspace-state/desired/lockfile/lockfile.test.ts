import type * as NodeServices from "@effect/platform-node/NodeServices";
import type { NativeEntryRemoval } from "../../../locations/index.js";
import { NativePlatformTest, withDetailedWork } from "../../../locations/testing.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Tracer from "effect/Tracer";
import * as Context from "effect/Context";
import * as Ref from "effect/Ref";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../../../settlement/live.js";
import { WorkspaceFileWriteLocks } from "../../../settlement/index.js";
import { WorkspaceStateTest } from "../../testing.js";
import { WorkspaceLocation } from "../../workspace/location.js";
import { AcceptedResolutionWriter } from "../../workspace/accepted-resolution-writer.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import * as Schema from "effect/Schema";
import { TreeIntegritySchema } from "../../workspace/materialized-tree.js";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { LOCKFILE_VERSION, LockfileSchema, type Lockfile, type SkillLockEntry } from "./schema.js";
import { parseLockfileToml } from "./toml-values.js";
import { LockfileDecodeError, LockfileVersionUnsupported } from "./errors.js";
import {
  applyLockfileUpdates,
  commitLockfileSnapshotUpdate,
  commitLockfileSnapshotUpdateAtPath,
  commitLockfileUpdates,
  writeLockfile,
  writeLockfileAtPath,
} from "./lockfile.js";

const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
);
const localEntry = (pathValue: string, packageName = "review"): SkillLockEntry => ({
  source: { type: "path", path: pathValue },
  identity: {
    owner: decodeHandleSync("@acme"),
    name: decodeExtensionNameSync(packageName),
  },
  resolved: { tree: treeIntegrity },
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
    effect: Effect.Effect<
      A,
      E,
      NodeServices.NodeServices | NativeEntryRemoval | WorkspaceFileWriteLocks
    >,
  ) =>
    effect.pipe(
      Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
    );

  const lockfileWithUnrecognizedField: Lockfile & { readonly unrecognized: string } = {
    lockfileVersion: LOCKFILE_VERSION,
    skills: {},
    unrecognized: "must not be silently discarded",
  };

  for (const { description, lockfile } of [
    {
      description: "invalid programmatic aliases",
      lockfile: {
        lockfileVersion: LOCKFILE_VERSION,
        skills: Object.fromEntries([["__proto__", localEntry("/sources/review")]]),
      },
    },
    {
      description: "unrecognized programmatic fields",
      lockfile: lockfileWithUnrecognizedField,
    },
  ] satisfies ReadonlyArray<{ readonly description: string; readonly lockfile: Lockfile }>) {
    it.effect(`refuses ${description} before replacing the file`, () =>
      run(
        Effect.gen(function* () {
          const target = path.join(root, "axm.lock");
          const prior = "version = 1\n";
          fs.writeFileSync(target, prior);
          const failure = yield* writeLockfileAtPath(target, lockfile).pipe(Effect.flip);
          expect(failure).toMatchObject({
            _tag: "LockfileWriteError",
            path: target,
            step: "encode",
            cause: { _tag: "SchemaError" },
          });
          expect(fs.readFileSync(target, "utf8")).toBe(prior);
        }),
      ),
    );
  }

  it.effect("writes only current accepted-resolution state", () =>
    run(
      Effect.gen(function* () {
        const lockfile: Lockfile = {
          lockfileVersion: LOCKFILE_VERSION,
          skills: { review: localEntry("/sources/sources/review") },
        };
        yield* writeLockfile(axmDir, lockfile);

        const parsed: unknown = parseLockfileToml(
          fs.readFileSync(path.join(axmDir, "axm.lock"), "utf8"),
        ).document;
        expect(Schema.decodeUnknownSync(LockfileSchema)(parsed)).toEqual(lockfile);
        expect(fs.existsSync(path.join(axmDir, "axm.lock.lock"))).toBe(false);
      }),
    ),
  );

  it("applies pure updates in order", () => {
    const base: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
    const result = applyLockfileUpdates(base, [
      (lockfile) => ({ ...lockfile, skills: { review: localEntry("/sources/one") } }),
      (lockfile) => ({
        ...lockfile,
        skills: { ...lockfile.skills, plan: localEntry("/sources/two", "plan") },
      }),
    ]);
    expect(Object.keys(result.skills).sort()).toEqual(["plan", "review"]);
  });

  it.effect("commits updates against the latest on-disk state", () =>
    run(
      Effect.gen(function* () {
        const base: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
        yield* writeLockfile(axmDir, {
          lockfileVersion: LOCKFILE_VERSION,
          skills: { existing: localEntry("/sources/existing", "existing") },
        });
        const result = yield* commitLockfileUpdates(axmDir, base, [
          (lockfile) => ({
            ...lockfile,
            skills: { ...lockfile.skills, review: localEntry("/sources/review", "review") },
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
          lockfileVersion: LOCKFILE_VERSION,
          skills: { review: localEntry("/sources/old") },
        };
        yield* writeLockfile(axmDir, {
          lockfileVersion: LOCKFILE_VERSION,
          skills: {
            ...base.skills,
            independent: localEntry("/sources/independent", "independent"),
          },
        });
        const next: Lockfile = {
          lockfileVersion: LOCKFILE_VERSION,
          skills: { review: localEntry("/sources/new") },
        };
        const result = yield* commitLockfileSnapshotUpdate(axmDir, base, next);
        expect(result.skills["review"]).toEqual(localEntry("/sources/new"));
        expect(result.skills["independent"]).toEqual(
          localEntry("/sources/independent", "independent"),
        );
      }),
    ),
  );

  it.effect.each([
    {
      fault: "an unrecognised key",
      raw: "version = 1\nextra = 1\n",
      error: LockfileDecodeError,
    },
    {
      fault: "a float in the integer version field",
      raw: "version = 1.0\n",
      error: LockfileDecodeError,
    },
    {
      fault: "an overflowing tool value",
      raw: "version = 1\n[tool.other]\nvalue = 1e999\n",
      error: LockfileDecodeError,
    },
    {
      fault: "an unsupported version",
      raw: "version = 2\n",
      error: LockfileVersionUnsupported,
    },
  ])("refuses a commit reread with $fault without changing the file", ({ raw, error }) =>
    run(
      Effect.gen(function* () {
        const target = path.join(root, "axm.lock");
        const base: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
        fs.writeFileSync(target, raw);

        const failure = yield* Effect.flip(commitLockfileSnapshotUpdateAtPath(target, base, base));
        expect(failure).toBeInstanceOf(error);
        expect(fs.readFileSync(target, "utf8")).toBe(raw);
      }),
    ),
  );

  it.effect("refuses a legacy YAML lockfile beside the expected lockfile", () =>
    run(
      Effect.gen(function* () {
        const legacy = path.join(root, "axm-lock.yaml");
        const raw = "lockfileVersion: 12\npackages: {}\nskills: {}\n";
        fs.writeFileSync(legacy, raw);
        const base: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };

        const failure = yield* Effect.flip(
          commitLockfileSnapshotUpdateAtPath(path.join(root, "axm.lock"), base, base),
        );
        expect(failure).toBeInstanceOf(LockfileVersionUnsupported);
        expect(failure).toMatchObject({ path: legacy, observedVersion: 12, supportedVersion: 1 });
        expect(fs.readFileSync(legacy, "utf8")).toBe(raw);
        expect(fs.existsSync(path.join(root, "axm.lock"))).toBe(false);
      }),
    ),
  );

  it.effect("keeps tool tables and drops comments when it rewrites the file", () =>
    run(
      Effect.gen(function* () {
        const target = path.join(root, "axm.lock");
        fs.writeFileSync(
          target,
          '# hand-written note\nversion = 1\n\n[tool.example]\nanything = "kept"\nnested = { b = 2, a = [1, 2] }\n',
        );
        const base: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
        yield* commitLockfileSnapshotUpdateAtPath(target, base, {
          ...base,
          skills: { review: localEntry("/sources/review") },
        });
        const written = fs.readFileSync(target, "utf8");
        expect(written).not.toContain("hand-written note");
        expect(
          written.endsWith('\n[tool.example]\nanything = "kept"\nnested = { a = [1, 2], b = 2 }\n'),
        ).toBe(true);
        expect(
          Object.keys(
            Schema.decodeUnknownSync(LockfileSchema)(parseLockfileToml(written).document).skills,
          ),
        ).toEqual(["review"]);
      }),
    ),
  );

  it.effect(
    "distinguishes replacement, no-op preservation reads, and corrupt prior documents",
    () =>
      run(
        Effect.gen(function* () {
          const real = yield* FileSystem.FileSystem;
          const target = path.join(root, "axm.lock");
          yield* real.writeFileString(target, 'version = 1\n[tool.keep]\nvalue = "retained"\n');
          let publications = 0;
          let priorReads = 0;
          const observed: FileSystem.FileSystem = {
            ...real,
            readFileString: (file, options) =>
              real.readFileString(file, options).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    if (file === target) priorReads++;
                  }),
                ),
              ),
            rename: (from, to) =>
              real.rename(from, to).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    if (to === target) publications++;
                  }),
                ),
              ),
          };
          const spans: Tracer.NativeSpan[] = [];
          const tracer = Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options);
              spans.push(span);
              return span;
            },
          });
          const next: Lockfile = {
            lockfileVersion: LOCKFILE_VERSION,
            skills: { review: localEntry("/sources/review") },
          };
          const write = writeLockfileAtPath(target, next).pipe(
            Effect.provideService(FileSystem.FileSystem, observed),
            withDetailedWork(tracer),
          );
          yield* write;
          expect(publications).toBe(1);
          const published = yield* real.readFileString(target);
          expect(published).toContain('value = "retained"');
          const identity = String((yield* real.stat(target)).ino);
          const readsBeforeNoop = priorReads;
          yield* write;
          expect(priorReads).toBeGreaterThan(readsBeforeNoop);
          expect(publications).toBe(1);
          expect(yield* real.readFileString(target)).toBe(published);
          expect(String((yield* real.stat(target)).ino)).toBe(identity);
          yield* real.writeFileString(target, "version = 1\n[tool.keep\n");
          expect((yield* write.pipe(Effect.result))._tag).toBe("Failure");
          expect(publications).toBe(1);
          expect(yield* real.readFileString(target)).toBe("version = 1\n[tool.keep\n");
          const parses = spans.filter((span) => span.name === "axm.parse.lockfile-preservation");
          expect(
            parses.map((span) => span.status._tag === "Ended" && span.status.exit._tag),
          ).toEqual(["Success", "Success", "Failure"]);
          expect(parses.map((span) => span.attributes.get("axm.work.count"))).toEqual([1, 1, 1]);
          expect(
            spans
              .filter((span) => span.name === "axm.publish.document")
              .map((span) => span.attributes.get("axm.changed")),
          ).toEqual([true, false]);
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
        const first = yield* Layer.build(WorkspaceStateTest(options)).pipe(
          Effect.provideService(WorkspaceFileWriteLocks, observed),
        );
        const second = yield* Layer.build(WorkspaceStateTest(options)).pipe(
          Effect.provideService(WorkspaceFileWriteLocks, observed),
        );
        const firstWriter = Context.get(first, AcceptedResolutionWriter);
        const secondWriter = Context.get(second, AcceptedResolutionWriter);
        yield* Effect.all(
          [
            firstWriter.setAccepted("skill", "first", localEntry("/sources/first", "first")),
            secondWriter.setAccepted("skill", "second", localEntry("/sources/second", "second")),
          ],
          { concurrency: "unbounded" },
        );
        const target = Context.get(first, WorkspaceLocation).lockPath;
        expect((yield* Ref.get(calls)).filter((call) => call === target)).toEqual([target, target]);
        const written = Schema.decodeUnknownSync(LockfileSchema)(
          parseLockfileToml(fs.readFileSync(target, "utf8")).document,
        );
        expect(Object.keys(written.skills).sort()).toEqual(["first", "second"]);
      }).pipe(Effect.scoped),
    ),
  );
});
