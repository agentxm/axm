import type * as NodeServices from "@effect/platform-node/NodeServices";
import type { NativeEntryRemoval } from "../../../locations/index.js";
import { readContainerReceipts } from "../../../locations/index.js";
import {
  NativePlatformTest,
  withDetailedWork,
  workObservations,
} from "../../../locations/testing.js";
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
import { emitLockfileToml } from "./toml.js";
import {
  ProjectionDigestSchema,
  ProjectionUnitPathSchema,
  type ProjectionKindState,
} from "./projections.js";
import { LockfileDecodeError, LockfileVersionUnsupported } from "./errors.js";
import { commitLockfileSnapshotUpdateAtPath, writeLockfileAtPath } from "./lockfile.js";

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
        yield* writeLockfileAtPath(path.join(axmDir, "axm.lock"), lockfile);

        const parsed: unknown = parseLockfileToml(
          fs.readFileSync(path.join(axmDir, "axm.lock"), "utf8"),
        ).document;
        expect(Schema.decodeUnknownSync(LockfileSchema)(parsed)).toEqual(lockfile);
        expect(fs.existsSync(path.join(axmDir, "axm.lock.lock"))).toBe(false);
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
        yield* writeLockfileAtPath(path.join(axmDir, "axm.lock"), {
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
        const result = yield* commitLockfileSnapshotUpdateAtPath(
          path.join(axmDir, "axm.lock"),
          base,
          next,
        );
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

  describe("round-trip parse work", () => {
    const digest = (character: string) =>
      ProjectionDigestSchema.make(`sha256:${character.repeat(64)}`);
    const rows = (...paths: ReadonlyArray<string>): ProjectionKindState => ({
      contract: 1,
      units: Object.fromEntries(
        paths.map((unitPath) => [
          ProjectionUnitPathSchema.make(unitPath),
          { gen: digest("a"), output: digest("b") },
        ]),
      ),
    });
    const alpha: Lockfile = {
      lockfileVersion: LOCKFILE_VERSION,
      skills: { alpha: localEntry("/sources/alpha", "alpha") },
      projections: { rules: rows("AGENTS.md", "docs/AGENTS.md") },
    };
    // The prior is the writer's own image, so each introduction is a syntax-only insertion.
    const priorBytes = emitLockfileToml(
      Schema.encodeSync(LockfileSchema)(alpha),
      parseLockfileToml('[tool.keep]\nvalue = "retained"\n').tool,
    );

    /** One owner call with its lockfile parse work counted by kind and phase. */
    const observed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const observations = workObservations(false);
        yield* observations.provide(effect);
        const parses: Record<string, number> = {};
        for (const fact of observations.facts) {
          if (!fact.kind.startsWith("axm.parse.lockfile")) continue;
          const phase = fact.attributes["axm.parse.phase"];
          const key = typeof phase === "string" ? `${fact.kind}:${phase}` : fact.kind;
          parses[key] = (parses[key] ?? 0) + 1;
        }
        const receipts = (yield* readContainerReceipts(axmDir)).entries.map((receipt) => ({
          unit: receipt.unit,
          kind: receipt.kind,
          absentBefore: receipt.absentBefore,
        }));
        const target = path.join(root, "axm.lock");
        const content = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : undefined;
        return { parses, receipts, content };
      });

    const context = Effect.gen(function* () {
      fs.mkdirSync(axmDir, { recursive: true });
      return {
        nativeRoot: root,
        runtimeDir: axmDir,
        eligible: true,
        locks: yield* WorkspaceFileWriteLocks,
      };
    });

    // Exactly one introduced unit is restorable, so a receipt exists only when
    // every prior unit was recognized as prior.
    it.effect("derives a replacement's prior units from the preservation parse", () =>
      run(
        Effect.gen(function* () {
          const target = path.join(root, "axm.lock");
          fs.writeFileSync(target, priorBytes);
          const roundTrip = yield* context;
          const next: Lockfile = {
            ...alpha,
            skills: { ...alpha.skills, beta: localEntry("/sources/beta", "beta") },
          };

          const introduce = yield* observed(writeLockfileAtPath(target, next, roundTrip));
          expect(introduce.parses).toEqual({
            "axm.parse.lockfile-preservation": 1,
            "axm.parse.lockfile-round-trip:after": 1,
          });
          expect(introduce.content).toContain('value = "retained"');
          expect(introduce.receipts).toEqual([
            { unit: '["lockfile","skills","beta"]', kind: "inserted-key", absentBefore: undefined },
          ]);

          const withdraw = yield* observed(writeLockfileAtPath(target, alpha, roundTrip));
          expect(withdraw.parses).toEqual({
            "axm.parse.lockfile-preservation": 1,
            "axm.parse.lockfile-round-trip:after": 1,
            "axm.parse.lockfile-round-trip:restored": 1,
          });
          expect(withdraw.content).toBe(priorBytes);
          expect(withdraw.receipts).toEqual([]);
        }),
      ),
    );

    it.effect("derives a row-only patch's prior units from the patch parse", () =>
      run(
        Effect.gen(function* () {
          const target = path.join(root, "axm.lock");
          fs.writeFileSync(target, priorBytes);
          const roundTrip = yield* context;
          const next: Lockfile = {
            ...alpha,
            projections: { rules: rows("AGENTS.md", "docs/AGENTS.md", "src/AGENTS.md") },
          };

          const introduce = yield* observed(
            commitLockfileSnapshotUpdateAtPath(target, alpha, next, roundTrip),
          );
          expect(introduce.parses).toEqual({
            "axm.parse.lockfile": 1,
            "axm.parse.lockfile-decode": 1,
            "axm.parse.lockfile-round-trip:after": 1,
          });
          expect(introduce.receipts).toEqual([
            {
              unit: '["lockfile","projections","rules","src/AGENTS.md"]',
              kind: "inserted-key",
              absentBefore: undefined,
            },
          ]);

          const withdraw = yield* observed(
            commitLockfileSnapshotUpdateAtPath(target, next, alpha, roundTrip),
          );
          expect(withdraw.parses).toEqual({
            "axm.parse.lockfile": 1,
            "axm.parse.lockfile-decode": 1,
            "axm.parse.lockfile-round-trip:after": 1,
            "axm.parse.lockfile-round-trip:restored": 1,
          });
          expect(withdraw.content).toBe(priorBytes);
          expect(withdraw.receipts).toEqual([]);
        }),
      ),
    );

    it.effect("keeps the synthetic prior document when no lockfile exists", () =>
      run(
        Effect.gen(function* () {
          const target = path.join(root, "axm.lock");
          const roundTrip = yield* context;

          const introduce = yield* observed(writeLockfileAtPath(target, alpha, roundTrip));
          expect(introduce.parses).toEqual({ "axm.parse.lockfile-round-trip:after": 1 });
          expect(introduce.receipts).toEqual([
            { unit: '["lockfile","skills","alpha"]', kind: "created-file", absentBefore: true },
          ]);
        }),
      ),
    );
  });
});
