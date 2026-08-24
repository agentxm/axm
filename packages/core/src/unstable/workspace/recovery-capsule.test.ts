import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  appendCapsuleEntry,
  capsuleEntryPath,
  capsuleMatchesSealedState,
  createRecoveryCapsule,
  nextCapsuleArtifact,
  readRecoveryCapsules,
  restoreRecoveryCapsule,
  sealRecoveryCapsule,
  type CapsuleWriter,
} from "./recovery-capsule.js";

let tempDir: string;
let workspaceDir: string;

beforeEach(() => {
  tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-recovery-capsule-"));
  workspaceDir = nodePath.join(tempDir, ".axm");
  nodeFs.mkdirSync(workspaceDir, { recursive: true });
});

afterEach(() => {
  nodeFs.rmSync(tempDir, { recursive: true, force: true });
});

const withContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

const makeSealedCapsule = (targetContentAtSeal: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = nodePath.join(tempDir, "managed.txt");
    nodeFs.writeFileSync(target, "original");
    const writer: CapsuleWriter = yield* createRecoveryCapsule({
      fs,
      path,
      workspaceDir,
      capsuleId: "candidate-1",
      command: "skills enable",
    });
    const artifact = nextCapsuleArtifact(path, writer);
    yield* fs.copy(target, artifact);
    yield* appendCapsuleEntry(fs, path, writer, {
      path: capsuleEntryPath(path, writer, target),
      preState: "copied",
      snapshot: nodePath.basename(artifact),
    });
    nodeFs.writeFileSync(target, targetContentAtSeal);
    expect(yield* sealRecoveryCapsule(fs, path, writer, "failure")).toBe(true);
    return { fs, path, target, writer };
  });

describe("recovery capsule", () => {
  it.effect("reports absence only when the recovery location is truly absent", () =>
    withContext(
      Effect.gen(function* () {
        expect(yield* readRecoveryCapsules(workspaceDir)).toEqual([]);
      }),
    ),
  );

  it.effect("reads back a sealed capsule it wrote", () =>
    withContext(
      Effect.gen(function* () {
        yield* makeSealedCapsule("changed");
        const detected = yield* readRecoveryCapsules(workspaceDir);
        expect(detected).toHaveLength(1);
        const first = detected[0];
        expect(first?.state).toBe("readable");
        if (first?.state !== "readable") return;
        expect(first.capsule.capsuleId).toBe("candidate-1");
        expect(first.capsule.command).toBe("skills enable");
        expect(first.capsule.form).toBe("restorable");
        expect(first.capsule.entries).toHaveLength(1);
        expect(first.capsule.seal?.cause).toBe("failure");
      }),
    ),
  );

  it.effect("fails closed on a capsule whose record is missing or malformed", () =>
    withContext(
      Effect.gen(function* () {
        const emptyDir = nodePath.join(workspaceDir, "tmp", "recovery", "empty-capsule");
        const malformedDir = nodePath.join(workspaceDir, "tmp", "recovery", "malformed-capsule");
        nodeFs.mkdirSync(emptyDir, { recursive: true });
        nodeFs.mkdirSync(malformedDir, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(malformedDir, "capsule.json"), "{not json");
        const detected = yield* readRecoveryCapsules(workspaceDir);
        expect(detected).toHaveLength(2);
        expect(detected.every((capsule) => capsule.state === "unreadable")).toBe(true);
      }),
    ),
  );

  it.effect("fails closed on a schema-invalid capsule record", () =>
    withContext(
      Effect.gen(function* () {
        const dir = nodePath.join(workspaceDir, "tmp", "recovery", "invalid-capsule");
        nodeFs.mkdirSync(dir, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(dir, "capsule.json"), '{"capsuleVersion":2}\n');
        const detected = yield* readRecoveryCapsules(workspaceDir);
        expect(detected).toHaveLength(1);
        expect(detected[0]?.state).toBe("unreadable");
      }),
    ),
  );

  it.effect("matches the sealed state until the retained bytes diverge", () =>
    withContext(
      Effect.gen(function* () {
        const { fs, path, target } = yield* makeSealedCapsule("changed");
        const detected = yield* readRecoveryCapsules(workspaceDir);
        const first = detected[0];
        if (first?.state !== "readable") {
          expect(first?.state).toBe("readable");
          return;
        }
        expect(yield* capsuleMatchesSealedState(fs, path, workspaceDir, first.capsule)).toBe(true);
        nodeFs.writeFileSync(target, "tampered");
        expect(yield* capsuleMatchesSealedState(fs, path, workspaceDir, first.capsule)).toBe(false);
      }),
    ),
  );

  it.effect("restores, verifies, and removes the capsule completely", () =>
    withContext(
      Effect.gen(function* () {
        const { fs, path, target } = yield* makeSealedCapsule("changed");
        const detected = yield* readRecoveryCapsules(workspaceDir);
        const first = detected[0];
        if (first?.state !== "readable") {
          expect(first?.state).toBe("readable");
          return;
        }
        const restored = yield* restoreRecoveryCapsule(fs, path, workspaceDir, first);
        expect(restored).toEqual(["managed.txt"]);
        expect(nodeFs.readFileSync(target, "utf8")).toBe("original");
        // Complete removal after verified recovery: nothing survives.
        expect(nodeFs.existsSync(nodePath.join(workspaceDir, "tmp", "recovery"))).toBe(false);
      }),
    ),
  );

  it.effect("refuses to restore a retained-work capsule", () =>
    withContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = nodePath.join(workspaceDir, "tmp", "recovery", "retained-only");
        nodeFs.mkdirSync(dir, { recursive: true });
        nodeFs.writeFileSync(
          nodePath.join(dir, "capsule.json"),
          `${JSON.stringify({
            capsuleVersion: 1,
            form: "retained-work",
            capsuleId: "retained-only",
            operationId: "0000000000000000",
            command: "publish",
            createdAt: "2026-08-24T00:00:00.000Z",
            entries: [],
          })}\n`,
        );
        const detected = yield* readRecoveryCapsules(workspaceDir);
        const first = detected[0];
        if (first?.state !== "readable") {
          expect(first?.state).toBe("readable");
          return;
        }
        const result = yield* restoreRecoveryCapsule(fs, path, workspaceDir, first).pipe(
          Effect.flip,
        );
        expect(result.detail).toContain("nothing can be restored");
        expect(nodeFs.existsSync(dir)).toBe(true);
      }),
    ),
  );

  it.effect("refuses to open a second live capsule at the same identity", () =>
    withContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* makeSealedCapsule("changed");
        const error = yield* createRecoveryCapsule({
          fs,
          path,
          workspaceDir,
          capsuleId: "candidate-1",
          command: "skills enable",
        }).pipe(Effect.flip);
        expect(error.detail).toContain("live recovery capsule already exists");
      }),
    ),
  );
});
