import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { NativeWriteAuthority } from "../agent-adapters/index.js";
import { readContainerReceipts } from "../locations/index.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { runWorkspaceTransaction } from "../settlement/index.js";
import { WorkspaceTransactionScopeTest } from "../settlement/testing.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { NativeWriteAuthorityLive } from "./live.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/native-insertions-retire-only-proven-containers",
  title: "Native insertion receipts preserve exact baselines and expire on foreign changes",
  statement:
    "AXM shall distinguish an absent native container from a preexisting empty one, restore eligible insertion baselines only under continuous identity and digest proof, and retire only proven created containers and empty unchanged ancestors.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real native files and replacement identities exercise the live authority and persisted receipts.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const authorityLayer = (root: string) =>
  NativeWriteAuthorityLive.pipe(
    Layer.provide(Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive)),
  );

describe("native insertion receipts", () => {
  it.effect("retires a shared created parent when its last owned artifact withdraws", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const parent = path.join(root, "shared");
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const first = { path: path.join(parent, "first"), unit: "first" };
        const second = { path: path.join(parent, "second"), unit: "second" };
        for (const target of [first, second]) {
          const capture = yield* authority.captureCreatedDirectories({ ...target, eligible: true });
          const createdDirectories = yield* authority.createParentDirectories(target.path);
          yield* fs.writeFileString(target.path, target.unit);
          yield* authority.recordCreatedDirectories({ capture, createdDirectories });
        }
        yield* fs.remove(first.path);
        yield* authority.retireCreatedDirectories(first);
        expect(yield* fs.readDirectory(parent)).toEqual(["second"]);
        yield* fs.remove(second.path);
        yield* authority.retireCreatedDirectories(second);
        expect(yield* fs.exists(parent)).toBe(false);
        expect((yield* readContainerReceipts(path.join(root, ".axm"))).entries).toEqual([]);
      }).pipe(Effect.provide(authorityLayer(root)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("does not claim a parent created by another writer after insertion capture", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const parent = path.join(root, "foreign-parent");
      const file = path.join(parent, "native.json");
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const target = { path: file, unit: "new-route" };
        const capture = yield* authority.captureInsertion({
          ...target,
          beforeRaw: Option.none(),
          eligible: true,
        });
        yield* fs.makeDirectory(parent);
        const createdDirectories = yield* authority.createParentDirectories(file);
        expect(createdDirectories).toEqual([]);
        const raw = '{"owned":1}';
        yield* fs.writeFileString(file, raw);
        yield* authority.recordInsertion({ capture, afterRaw: raw, createdDirectories });
        expect(yield* authority.retireInsertion({ ...target, raw, empty: true })).toBe(true);
        expect(yield* fs.exists(parent)).toBe(true);
        expect(yield* fs.readDirectory(parent)).toEqual([]);
      }).pipe(Effect.provide(authorityLayer(root)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "resolves a complete batch through the matching inverse chain without rereading virtual bytes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "native.json");
        yield* Effect.gen(function* () {
          const authority = yield* NativeWriteAuthority;
          const first = '{"first":1}';
          const both = '{"first":1,"second":2}';
          const initial = yield* authority.captureInsertion({
            path: file,
            unit: "first",
            beforeRaw: Option.none(),
            eligible: true,
          });
          yield* fs.writeFileString(file, first);
          yield* authority.recordInsertion({
            createdDirectories: [],
            capture: initial,
            afterRaw: first,
          });
          const second = yield* authority.captureInsertion({
            path: file,
            unit: "second",
            beforeRaw: Option.some(first),
            eligible: true,
          });
          yield* fs.writeFileString(file, both);
          yield* authority.recordInsertion({
            createdDirectories: [],
            capture: second,
            afterRaw: both,
          });
          expect(
            Option.getOrUndefined(
              yield* authority.resolveInsertions({
                path: file,
                units: ["first", "second"],
                raw: both,
              }),
            ),
          ).toEqual({ kind: "remove-file" });
          expect(
            Option.isNone(
              yield* authority.resolveInsertions({
                path: file,
                units: ["first", "missing"],
                raw: both,
              }),
            ),
          ).toBe(true);
          expect(yield* fs.readFileString(file)).toBe(both);
          expect(
            yield* authority.retireInsertion({ path: file, unit: "first", raw: both, empty: true }),
          ).toBe(true);
          expect(yield* fs.exists(file)).toBe(false);
        }).pipe(Effect.provide(authorityLayer(root)));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps preexisting insertion receipts valid after an in-place update rolls back", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      yield* fs.writeFileString(file, "{ }");
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const target = { path: file, unit: "server:first" };
        const before = '{"owned":1}';
        const initial = yield* authority.captureInsertion({
          ...target,
          beforeRaw: Option.some("{ }"),
          eligible: true,
        });
        yield* fs.writeFileString(file, before);
        yield* authority.recordInsertion({
          createdDirectories: [],
          capture: initial,
          afterRaw: before,
        });
        const receiptPath = path.join(root, ".axm", "projection-containers.json");
        const receiptBefore = yield* fs.readFileString(receiptPath);
        const identityBefore = yield* fs.stat(file);
        const result = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          transition: Effect.gen(function* () {
            const capture = yield* authority.captureInsertion({
              ...target,
              beforeRaw: Option.some(before),
              eligible: false,
            });
            yield* authority.protect(file);
            yield* fs.writeFileString(file, '{"owned":2}');
            yield* authority.record({ path: file, change: "modified" });
            yield* authority.recordInsertion({
              createdDirectories: [],
              capture,
              afterRaw: '{"owned":2}',
            });
            return yield* Effect.fail("later-step-failed");
          }),
          validate: () => Effect.void,
        }).pipe(
          Effect.provide(
            WorkspaceTransactionScopeTest({
              workspaceDir: path.join(root, ".axm"),
              settingsPath: path.join(root, "axm.json"),
              lockPath: path.join(root, "axm-lock.yaml"),
            }),
          ),
          Effect.result,
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure).toBe("later-step-failed");
        expect(yield* fs.readFileString(file)).toBe(before);
        expect((yield* fs.stat(file)).ino).toEqual(identityBefore.ino);
        expect(yield* fs.readFileString(receiptPath)).toBe(receiptBefore);
        expect(
          Option.getOrUndefined(yield* authority.resolveInsertion({ ...target, raw: before })),
        ).toEqual({ kind: "restore-text", text: "{ }" });
      }).pipe(Effect.provide(authorityLayer(root)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("distinguishes absent from preexisting empty and compact native files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      for (const before of [undefined, "", "{ }\r\n", '{"foreign":"keep"}']) {
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "native.json");
        if (before !== undefined) yield* fs.writeFileString(file, before);
        yield* Effect.gen(function* () {
          const authority = yield* NativeWriteAuthority;
          const target = { path: file, unit: "server:first" };
          const after = before?.includes("foreign")
            ? '{"foreign":"keep","owned":1}'
            : '{"owned":1}';
          const capture = yield* authority.captureInsertion({
            ...target,
            beforeRaw: Option.fromUndefinedOr(before),
            eligible: true,
          });
          yield* authority.protect(file);
          yield* fs.writeFileString(file, after);
          yield* authority.record({
            path: file,
            change: before === undefined ? "created" : "modified",
          });
          yield* authority.recordInsertion({ createdDirectories: [], capture, afterRaw: after });
          const receiptBytes = yield* fs.readFileString(
            path.join(root, ".axm", "projection-containers.json"),
          );
          expect(receiptBytes).not.toContain("foreign");
          expect(receiptBytes).not.toContain("keep");
          expect(receiptBytes).not.toContain('"owned"');
          const resolved = yield* authority.resolveInsertion({ ...target, raw: after });
          expect(Option.getOrUndefined(resolved)).toEqual(
            before === undefined ? { kind: "remove-file" } : { kind: "restore-text", text: before },
          );
          if (before === undefined)
            expect(yield* authority.retireInsertion({ ...target, raw: after, empty: false })).toBe(
              true,
            );
          else {
            yield* fs.writeFileString(file, before);
            yield* authority.forgetInsertion(target);
            expect(yield* fs.readFileString(file)).toBe(before);
          }
          expect(yield* fs.exists(path.join(root, ".axm", "projection-containers.json"))).toBe(
            false,
          );
        }).pipe(Effect.provide(authorityLayer(root)));
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("removes only proven empty created parents and retains a foreign sibling", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      for (const foreign of [false, true]) {
        const root = yield* fs.makeTempDirectoryScoped();
        const parent = path.join(root, "native", "nested");
        const file = path.join(parent, "config.json");
        yield* Effect.gen(function* () {
          const authority = yield* NativeWriteAuthority;
          const target = { path: file, unit: "server:first" };
          const raw = '{"owned":1}';
          const capture = yield* authority.captureInsertion({
            ...target,
            beforeRaw: Option.none(),
            eligible: true,
          });
          const createdDirectories = yield* authority.createParentDirectories(file);
          yield* fs.writeFileString(file, raw);
          yield* authority.recordInsertion({ createdDirectories, capture, afterRaw: raw });
          if (foreign) yield* fs.writeFileString(path.join(parent, "personal.txt"), "keep");
          expect(yield* authority.retireInsertion({ ...target, raw, empty: false })).toBe(true);
          expect(yield* fs.exists(file)).toBe(false);
          expect(yield* fs.exists(parent)).toBe(foreign);
          if (foreign)
            expect(yield* fs.readFileString(path.join(parent, "personal.txt"))).toBe("keep");
        }).pipe(Effect.provide(authorityLayer(root)));
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses receipt creation after an identical-byte replacement during a write", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      yield* fs.writeFileString(file, "{}");
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const capture = yield* authority.captureInsertion({
          path: file,
          unit: "server:first",
          beforeRaw: Option.some("{}"),
          eligible: true,
        });
        yield* fs.rename(file, path.join(root, "original"));
        yield* fs.writeFileString(file, '{"owned":1}');
        const result = yield* authority
          .recordInsertion({ createdDirectories: [], capture, afterRaw: '{"owned":1}' })
          .pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        expect((yield* readContainerReceipts(path.join(root, ".axm"))).entries).toEqual([]);
      }).pipe(Effect.provide(authorityLayer(root)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not refresh stale receipts after foreign content or authorize a new alias route",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "native.json");
        const alias = path.join(root, "alias.json");
        yield* fs.writeFileString(file, "{}");
        yield* Effect.gen(function* () {
          const authority = yield* NativeWriteAuthority;
          const target = { path: file, unit: "server:first" };
          const first = '{"owned":1}';
          const capture = yield* authority.captureInsertion({
            ...target,
            beforeRaw: Option.some("{}"),
            eligible: true,
          });
          yield* fs.writeFileString(file, first);
          yield* authority.recordInsertion({ createdDirectories: [], capture, afterRaw: first });
          yield* fs.symlink("native.json", alias);
          expect(
            Option.isNone(
              yield* authority.resolveInsertion({ ...target, raw: first, aliases: [alias] }),
            ),
          ).toBe(true);
          const foreign = '{"owned":1,"foreign":2}';
          yield* fs.writeFileString(file, foreign);
          const next = yield* authority.captureInsertion({
            ...target,
            beforeRaw: Option.some(foreign),
            eligible: false,
          });
          const after = '{"owned":3,"foreign":2}';
          yield* fs.writeFileString(file, after);
          yield* authority.recordInsertion({
            createdDirectories: [],
            capture: next,
            afterRaw: after,
          });
          expect(Option.isNone(yield* authority.resolveInsertion({ ...target, raw: after }))).toBe(
            true,
          );
          expect(yield* authority.retireInsertion({ ...target, raw: after, empty: true })).toBe(
            false,
          );
        }).pipe(Effect.provide(authorityLayer(root)));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("revalidates actual publication bytes before persisting proof", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      yield* Effect.gen(function* () {
        const authority = yield* NativeWriteAuthority;
        const capture = yield* authority.captureInsertion({
          path: file,
          unit: "server:first",
          beforeRaw: Option.none(),
          eligible: true,
        });
        yield* fs.writeFileString(file, "foreign");
        expect(
          (yield* authority
            .recordInsertion({ createdDirectories: [], capture, afterRaw: '{"owned":1}' })
            .pipe(Effect.result))._tag,
        ).toBe("Failure");
        expect((yield* readContainerReceipts(path.join(root, ".axm"))).entries).toEqual([]);
      }).pipe(Effect.provide(authorityLayer(root)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
