import { stat } from "node:fs/promises";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import {
  applyStructuralInverse,
  captureContainerIdentity,
  deriveStructuralInverse,
  forgetContainerReceipt,
  readContainerReceipts,
  recordContainerReceipt,
  verifyContainerIdentity,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/container-receipts-require-continuous-identity",
  title: "Container cleanup receipts require continuing identity and bounded syntax evidence",
  statement:
    "AXM shall use a container receipt for cleanup only while its workspace, parents, entry, and aliases retain the captured identities, and shall store structural inverses without unrelated config content and apply them only to the matching postimage.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Temporary files expose real replacement identities and receipt store behavior; digest witnesses exercise exact byte inverses.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("container receipt continuity", () => {
  it.effect("keeps exact inode identity when platform stat cannot represent it as a number", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const target = path.join(root, "config.json");
      yield* fs.writeFileString(target, "{}");
      const withoutNumericInodes = {
        ...fs,
        stat: (entry: string) =>
          fs.stat(entry).pipe(Effect.map((info) => ({ ...info, ino: Option.none<number>() }))),
      };
      const context = { nativeRoot: root, target };
      const identity = yield* captureContainerIdentity(context).pipe(
        Effect.provideService(FileSystem.FileSystem, withoutNumericInodes),
      );
      const raw = yield* Effect.promise(() => stat(target, { bigint: true }));
      expect(identity.entry.inode).toBe(raw.ino.toString());
      expect(
        yield* verifyContainerIdentity(identity, context).pipe(
          Effect.provideService(FileSystem.FileSystem, withoutNumericInodes),
        ),
      ).toBe(true);
      yield* fs.rename(target, path.join(root, "original"));
      yield* fs.writeFileString(target, "{}");
      expect(
        yield* verifyContainerIdentity(identity, context).pipe(
          Effect.provideService(FileSystem.FileSystem, withoutNumericInodes),
        ),
      ).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "expires an identical-byte replacement, a parent replacement, and a copied workspace",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const parent = path.join(root, "native");
        const target = path.join(parent, "config.json");
        yield* fs.makeDirectory(parent);
        yield* fs.writeFileString(target, "{}");
        const context = { nativeRoot: root, target };
        const identity = yield* captureContainerIdentity(context);
        expect(yield* verifyContainerIdentity(identity, context)).toBe(true);
        yield* fs.rename(target, path.join(root, "original"));
        yield* fs.writeFileString(target, "{}");
        expect(yield* verifyContainerIdentity(identity, context)).toBe(false);
        yield* fs.remove(target);
        yield* fs.rename(path.join(root, "original"), target);
        expect(yield* verifyContainerIdentity(identity, context)).toBe(true);
        yield* fs.rename(parent, path.join(root, "moved-parent"));
        yield* fs.makeDirectory(parent);
        yield* fs.rename(path.join(root, "moved-parent", "config.json"), target);
        expect(yield* verifyContainerIdentity(identity, context)).toBe(false);
        const copy = yield* fs.makeTempDirectoryScoped();
        yield* fs.copy(root, copy, { overwrite: true });
        expect(
          yield* verifyContainerIdentity(identity, {
            nativeRoot: copy,
            target: path.join(copy, "native", "config.json"),
          }),
        ).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("expires a retargeted alias even when its replacement has the same content", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const target = path.join(root, "native.json");
      const alias = path.join(root, "alias.json");
      yield* fs.writeFileString(target, "{}");
      yield* fs.writeFileString(path.join(root, "replacement.json"), "{}");
      yield* fs.symlink("native.json", alias);
      const context = { nativeRoot: root, target, aliases: [alias] };
      const identity = yield* captureContainerIdentity(context);
      expect(yield* verifyContainerIdentity(identity, context)).toBe(true);
      yield* fs.remove(alias);
      yield* fs.symlink("replacement.json", alias);
      expect(yield* verifyContainerIdentity(identity, context)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it("preserves compact, CRLF, and missing-final-newline baselines without storing foreign values", () => {
    for (const before of ["{}", "{ }", "{\r\n}\r\n", '{"foreign":"keep"}']) {
      const after = before.replace(
        /}\s*$/,
        `${before.includes("foreign") ? "," : ""}"owned":{"value":1}}`,
      );
      const inverse = deriveStructuralInverse(before, after);
      expect(Option.isSome(inverse)).toBe(true);
      if (Option.isNone(inverse)) continue;
      expect(Option.getOrUndefined(applyStructuralInverse(after, inverse.value))).toBe(before);
      expect(JSON.stringify(inverse.value)).not.toContain("foreign");
      expect(JSON.stringify(inverse.value)).not.toContain("keep");
      expect(Option.isNone(applyStructuralInverse(`${after}\n`, inverse.value))).toBe(true);
    }
    expect(Option.isNone(deriveStructuralInverse('{"foreign":1}', '{"foreign":2}'))).toBe(true);
  });

  it("restores separated formatting spans without persisting comments, keys, or values", () => {
    for (const [before, after] of [
      [
        '{\r\n    "token": "private-token",\r\n    "empty": {}\r\n}',
        '{\n  "token": "private-token",\n  "empty": {"managed":true}\n}\n',
      ],
      [
        "# authored\r\nlockfileVersion: 11\r\npackages: {}\r\nskills: {}",
        "# authored\nlockfileVersion: 11\npackages: {}\nskills:\n  owned:\n    value: true\n",
      ],
      ['{"token":"α😀","list":[]}', '{\n  "token": "α😀",\n  "list": ["managed"]\n}\n'],
    ]) {
      if (before === undefined || after === undefined) continue;
      const inverse = deriveStructuralInverse(before, after);
      expect(Option.isSome(inverse)).toBe(true);
      if (Option.isNone(inverse)) continue;
      expect(Option.getOrUndefined(applyStructuralInverse(after, inverse.value))).toBe(before);
      for (const edit of inverse.value.edits) expect(edit.syntax).toMatch(/^[\s{}[\],:]*$/);
      expect(JSON.stringify(inverse.value)).not.toContain("private-token");
      expect(JSON.stringify(inverse.value)).not.toContain("authored");
      expect(Option.isNone(applyStructuralInverse(`${after} `, inverse.value))).toBe(true);
    }
  });

  it.effect("serializes receipt deltas, retires the last row, and refuses corrupt metadata", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const workspaceDir = path.join(root, ".axm");
      const target = path.join(root, "config.json");
      yield* fs.makeDirectory(workspaceDir);
      yield* fs.writeFileString(target, "{}");
      const identity = yield* captureContainerIdentity({ nativeRoot: root, target });
      const semaphore = yield* Semaphore.make(1);
      const mutation = {
        withLock: <A, E, R>(_target: string, effect: Effect.Effect<A, E, R>) =>
          semaphore.withPermits(1)(effect),
        createDirectory: (directory: string) => fs.makeDirectory(directory).pipe(Effect.as(true)),
        write: (file: string, contents: string) => fs.writeFileString(file, contents),
        retire: (file: string) => fs.remove(file),
      };
      yield* Effect.all(
        [
          recordContainerReceipt(
            workspaceDir,
            { unit: "first", kind: "inserted-key", identity },
            mutation,
          ),
          recordContainerReceipt(
            workspaceDir,
            { unit: "second", kind: "inserted-key", identity },
            mutation,
          ),
        ],
        { concurrency: 2 },
      );
      const document = yield* readContainerReceipts(workspaceDir);
      expect(document.entries.map((entry) => entry.unit).sort()).toEqual(["first", "second"]);
      for (const unit of ["first", "second"])
        yield* forgetContainerReceipt(
          workspaceDir,
          { unit, physicalPath: identity.physicalPath },
          mutation,
        );
      const stored = path.join(workspaceDir, "projection-containers.json");
      expect(yield* fs.exists(stored)).toBe(false);
      yield* fs.writeFileString(stored, '{"version":1,"entries":[],"foreign":"preserve"}');
      const refused = yield* recordContainerReceipt(
        workspaceDir,
        { unit: "third", kind: "inserted-key", identity },
        mutation,
      ).pipe(Effect.result);
      expect(refused._tag).toBe("Failure");
      expect(yield* fs.readFileString(stored)).toBe(
        '{"version":1,"entries":[],"foreign":"preserve"}',
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("retires only runtime directories created by the receipt store itself", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const workspaceDir = path.join(root, ".axm");
      const target = path.join(root, "native.json");
      yield* fs.writeFileString(target, "{}");
      const identity = yield* captureContainerIdentity({ nativeRoot: root, target });
      const mutation = {
        withLock: <A, E, R>(_target: string, effect: Effect.Effect<A, E, R>) => effect,
        createDirectory: (directory: string) => fs.makeDirectory(directory).pipe(Effect.as(true)),
        write: (file: string, contents: string) => fs.writeFileString(file, contents),
        retire: (file: string) => fs.remove(file, { recursive: true }),
      };
      yield* recordContainerReceipt(
        workspaceDir,
        { unit: "first", kind: "inserted-key", identity },
        mutation,
      );
      expect((yield* readContainerReceipts(workspaceDir)).createdDirectories).toHaveLength(1);
      yield* forgetContainerReceipt(
        workspaceDir,
        { unit: "first", physicalPath: identity.physicalPath },
        mutation,
      );
      expect(yield* fs.exists(workspaceDir)).toBe(false);
      yield* recordContainerReceipt(
        workspaceDir,
        { unit: "second", kind: "inserted-key", identity },
        mutation,
      );
      yield* fs.writeFileString(path.join(workspaceDir, "foreign"), "retain");
      yield* forgetContainerReceipt(
        workspaceDir,
        { unit: "second", physicalPath: identity.physicalPath },
        mutation,
      );
      expect(yield* fs.readFileString(path.join(workspaceDir, "foreign"))).toBe("retain");
      expect(yield* fs.exists(path.join(workspaceDir, "projection-containers.json"))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves a recreated runtime directory even with copied receipt bytes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const workspaceDir = path.join(root, ".axm");
      const original = path.join(root, "original-runtime");
      const target = path.join(root, "native.json");
      yield* fs.writeFileString(target, "{}");
      const identity = yield* captureContainerIdentity({ nativeRoot: root, target });
      const mutation = {
        withLock: <A, E, R>(_target: string, effect: Effect.Effect<A, E, R>) => effect,
        createDirectory: (directory: string) => fs.makeDirectory(directory).pipe(Effect.as(true)),
        write: (file: string, contents: string) => fs.writeFileString(file, contents),
        retire: (file: string) => fs.remove(file, { recursive: true }),
      };
      yield* recordContainerReceipt(
        workspaceDir,
        { unit: "first", kind: "inserted-key", identity },
        mutation,
      );
      yield* fs.rename(workspaceDir, original);
      yield* fs.makeDirectory(workspaceDir);
      yield* fs.copyFile(
        path.join(original, "projection-containers.json"),
        path.join(workspaceDir, "projection-containers.json"),
      );
      yield* forgetContainerReceipt(
        workspaceDir,
        { unit: "first", physicalPath: identity.physicalPath },
        mutation,
      );
      expect(yield* fs.exists(workspaceDir)).toBe(true);
      expect(yield* fs.readDirectory(workspaceDir)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
