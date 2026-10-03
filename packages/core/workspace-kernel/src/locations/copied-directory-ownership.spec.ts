import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  copiedDirectoryCanReplace,
  copiedDirectoryIsCurrent,
  readCopiedDirectory,
  retireCopiedDirectory,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/native-locations/copied-directory-ownership",
  title: "Copied projections retire only the entries AXM can still prove it created",
  statement:
    "When retiring a copied native projection, AXM shall require a valid creation receipt tied to the current directory identity, remove only unchanged receipt-listed files and empty unchanged receipt-listed directories, and preserve unowned additions, edits, replacements, and directories with absent or invalid receipts.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-copy-proof-" });
  const copy = path.join(root, "copy");
  yield* fs.makeDirectory(path.join(copy, "scripts"), { recursive: true });
  yield* fs.writeFileString(path.join(copy, "SKILL.md"), "# Owned skill\n");
  yield* fs.writeFileString(path.join(copy, "scripts", "run.sh"), "echo owned\n");
  yield* captureCopiedDirectory(copy, path.join(root, "canonical"));
  return { fs, path, root, copy };
});

describe("Bounded copied projection ownership", () => {
  it.effect("removes an unchanged copy completely", () =>
    Effect.gen(function* () {
      const { fs, copy } = yield* fixture;
      expect(Option.isSome(yield* readCopiedDirectory(copy))).toBe(true);
      expect(yield* retireCopiedDirectory(copy)).toBe(true);
      expect(yield* fs.exists(copy)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves foreign children and modified owned files", () =>
    Effect.gen(function* () {
      const { fs, path, copy } = yield* fixture;
      yield* fs.writeFileString(path.join(copy, "SKILL.md"), "# User changed\n");
      yield* fs.writeFileString(path.join(copy, "scripts", "personal.sh"), "echo personal\n");
      yield* retireCopiedDirectory(copy);
      expect(yield* fs.readFileString(path.join(copy, "SKILL.md"))).toBe("# User changed\n");
      expect(yield* fs.readFileString(path.join(copy, "scripts", "personal.sh"))).toBe(
        "echo personal\n",
      );
      expect(yield* fs.exists(path.join(copy, "scripts", "run.sh"))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a transplanted receipt on a replacement directory", () =>
    Effect.gen(function* () {
      const { fs, path, root, copy } = yield* fixture;
      yield* fs.rename(copy, path.join(root, "old-copy"));
      yield* fs.makeDirectory(copy);
      yield* fs.writeFileString(path.join(copy, "SKILL.md"), "# Replacement\n");
      expect(Option.isNone(yield* readCopiedDirectory(copy))).toBe(true);
      expect(yield* retireCopiedDirectory(copy)).toBe(false);
      expect(yield* fs.readFileString(path.join(copy, "SKILL.md"))).toBe("# Replacement\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves a replaced file even when its bytes are identical", () =>
    Effect.gen(function* () {
      const { fs, path, root, copy } = yield* fixture;
      const file = path.join(copy, "SKILL.md");
      yield* fs.rename(file, path.join(root, "old-skill"));
      yield* fs.writeFileString(file, "# Owned skill\n");
      yield* retireCopiedDirectory(copy);
      expect(yield* fs.readFileString(file)).toBe("# Owned skill\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect(
    "keeps management evidence outside authored files and retires only unchanged links",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-copy-links-" });
        const copy = path.join(root, "copy");
        yield* fs.makeDirectory(copy);
        yield* fs.writeFileString(path.join(copy, ".axm-copy.json"), "authored bytes");
        yield* fs.writeFileString(path.join(copy, "target"), "target");
        yield* fs.symlink("target", path.join(copy, "original"));
        yield* fs.symlink("target", path.join(copy, "modified"));
        yield* fs.symlink("missing", path.join(copy, "dangling"));
        yield* fs.symlink(".", path.join(copy, "self"));
        expect(Option.isSome(yield* captureCopiedDirectory(copy, copy))).toBe(true);
        expect(yield* fs.readFileString(path.join(copy, ".axm-copy.json"))).toBe("authored bytes");
        expect(yield* fs.exists(yield* copiedDirectoryReceiptPath(copy))).toBe(true);
        expect(yield* copiedDirectoryCanReplace(copy)).toBe(true);
        expect(yield* copiedDirectoryIsCurrent(copy, copy)).toBe(true);
        yield* fs.rename(path.join(copy, "modified"), path.join(root, "old-link"));
        yield* fs.symlink("target", path.join(copy, "modified"));
        expect(yield* copiedDirectoryCanReplace(copy)).toBe(false);
        yield* retireCopiedDirectory(copy);
        expect(yield* fs.readLink(path.join(copy, "modified"))).toBe("target");
        expect(yield* fs.readDirectory(copy)).toEqual(["modified"]);
        expect(yield* fs.exists(yield* copiedDirectoryReceiptPath(copy))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses an occupied management sibling without changing it", () =>
    Effect.gen(function* () {
      const { fs, copy } = yield* fixture;
      const receiptPath = yield* copiedDirectoryReceiptPath(copy);
      const before = yield* fs.readFileString(receiptPath);
      const refused = yield* captureCopiedDirectory(copy, "replacement").pipe(Effect.flip);
      expect(refused._tag).toBe("NativeLocationError");
      expect(yield* fs.readFileString(receiptPath)).toBe(before);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
