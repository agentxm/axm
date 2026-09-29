import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { copyExtensionDirectory } from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/acquisition/refuses-copy-source-overlap",
  title: "Physical overlap never copies extension bytes back into their source",
  statement:
    "Before copying extension content, AXM shall refuse source and destination trees that physically coincide or contain one another, including directory aliases and a destination leaf link to the source, without modifying the source bytes or destination entries.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Source overlap refusal", () => {
  it.effect("refuses a hardlinked destination child before any bytes are copied", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const source = path.join(root, "source");
      const destination = path.join(root, "destination");
      yield* fs.makeDirectory(source);
      yield* fs.makeDirectory(destination);
      yield* fs.writeFileString(path.join(source, "a.txt"), "source\n");
      yield* fs.writeFileString(path.join(source, "b.txt"), "shared source\n");
      yield* fs.link(path.join(source, "b.txt"), path.join(destination, "b.txt"));
      yield* fs.writeFileString(path.join(destination, "a.txt"), "destination\n");
      const failure = yield* copyExtensionDirectory(source, destination).pipe(Effect.flip);
      expect(failure._tag).toBe("NativeLocationError");
      expect(yield* fs.readFileString(path.join(destination, "a.txt"))).toBe("destination\n");
      expect(yield* fs.readFileString(path.join(source, "b.txt"))).toBe("shared source\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect.each(["same", "child", "parent", "parent-alias", "leaf-alias"])(
    "preserves source for %s overlap",
    (variant) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-overlap-copy-" });
        const source = path.join(root, "source");
        yield* fs.makeDirectory(source);
        yield* fs.writeFileString(path.join(source, "SKILL.md"), "# Source bytes must survive\n");
        let destination = source;
        if (variant === "child") destination = path.join(source, "nested");
        if (variant === "parent") destination = root;
        if (variant === "parent-alias") {
          yield* fs.symlink(root, path.join(root, "alias"));
          destination = path.join(root, "alias/source");
        }
        if (variant === "leaf-alias") {
          destination = path.join(root, "output");
          yield* fs.symlink(source, destination);
        }
        const failure = yield* copyExtensionDirectory(source, destination).pipe(Effect.flip);
        expect(failure._tag).toBe("NativeLocationError");
        expect(yield* fs.readFileString(path.join(source, "SKILL.md"))).toBe(
          "# Source bytes must survive\n",
        );
        expect(yield* fs.readDirectory(source)).toEqual(["SKILL.md"]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
