import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { copyExtensionDirectory } from "./index.js";

export const specification = defineSpecification({
  requirement: "extensions/acquisition/retains-contained-payload-links",
  title: "Acquired package copies preserve contained links and supporting content",
  statement:
    "When copying an acquired package, AXM shall preserve file bytes, executable permissions, relative layout, empty directories, supporting files, and relocatable links contained within the package, and shall refuse escaping links before writing the destination.",
  class: "quality",
  characteristic: "integrity",
  role: "supporting",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "Native file modes and symbolic links establish payload fidelity and containment during a real copy.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Acquired payload copies", () => {
  it.effect("preserves relative file and directory links without expanding their contents", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-payload-copy-" });
      const source = path.join(root, "source");
      const destination = path.join(root, "destination");
      yield* fs.makeDirectory(path.join(source, "assets", "empty"), { recursive: true });
      const bytes = new Uint8Array([0, 255, 10, 13]);
      yield* fs.writeFile(path.join(source, "assets", "run"), bytes);
      yield* fs.chmod(path.join(source, "assets", "run"), 0o755);
      for (const name of ["README.md", "metadata.json", ".axm-copy.json", "_notes"])
        yield* fs.writeFileString(path.join(source, name), `Upstream ${name}`);
      yield* fs.symlink("assets/run", path.join(source, "run"));
      yield* fs.symlink("assets", path.join(source, "linked-assets"));
      yield* fs.symlink(".", path.join(source, "self"));
      yield* copyExtensionDirectory(source, destination);
      expect(yield* fs.readLink(path.join(destination, "run"))).toBe("assets/run");
      expect(yield* fs.readLink(path.join(destination, "linked-assets"))).toBe("assets");
      expect(yield* fs.readLink(path.join(destination, "self"))).toBe(".");
      expect(Array.from(yield* fs.readFile(path.join(destination, "run")))).toEqual(
        Array.from(bytes),
      );
      expect((yield* fs.stat(path.join(destination, "run"))).mode & 0o777).toBe(0o755);
      expect(yield* fs.readDirectory(path.join(destination, "assets", "empty"))).toEqual([]);
      for (const name of ["README.md", "metadata.json", ".axm-copy.json", "_notes"])
        expect(yield* fs.readFileString(path.join(destination, name))).toBe(`Upstream ${name}`);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses an escaping link without creating destination content", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-payload-escape-" });
      const source = path.join(root, "source");
      const destination = path.join(root, "destination");
      yield* fs.makeDirectory(source);
      yield* fs.writeFileString(path.join(root, "outside"), "Foreign bytes");
      yield* fs.symlink("../outside", path.join(source, "escape"));
      const failure = yield* copyExtensionDirectory(source, destination).pipe(Effect.flip);
      expect(failure).toMatchObject({ _tag: "NativeLocationError", reason: "escape" });
      expect(yield* fs.exists(destination)).toBe(false);
      expect(yield* fs.readFileString(path.join(root, "outside"))).toBe("Foreign bytes");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
