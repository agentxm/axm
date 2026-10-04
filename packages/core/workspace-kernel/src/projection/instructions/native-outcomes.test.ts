import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { observeInstructionNativeLocations } from "./native-outcomes.js";

describe("instruction native location observation", () => {
  it.effect("shares ancestor reads within an inventory and observes changed routes next time", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const first = path.join(root, "first");
      const second = path.join(root, "second");
      const alias = path.join(root, "workspace");
      yield* fs.makeDirectory(first);
      yield* fs.makeDirectory(second);
      yield* fs.writeFileString(path.join(first, "AGENTS.md"), "Accepted instructions.");
      yield* fs.symlink(first, alias);
      const ancestor = path.parse(root).root;
      const ancestorReads = yield* Ref.make(0);
      const observedFs = {
        ...fs,
        readDirectory: (target, options) =>
          target === ancestor
            ? Ref.update(ancestorReads, (count) => count + 1).pipe(
                Effect.andThen(fs.readDirectory(target, options)),
              )
            : fs.readDirectory(target, options),
      } satisfies FileSystem.FileSystem;
      const targetFile = path.join(alias, "AGENTS.md");
      const observe = observeInstructionNativeLocations({
        workspaceRoot: alias,
        scope: "project",
        roots: [alias],
        configuredAgentIds: ["codex"],
        items: [
          {
            root: alias,
            agentId: "codex",
            agentName: "Codex",
            sourceFile: targetFile,
            targetFile,
            mechanism: "native",
            health: "ok",
            ownership: "owned-current",
            observedForm: "file",
            details: "Canonical instructions.",
          },
        ],
      }).pipe(Effect.provideService(FileSystem.FileSystem, observedFs));
      const before = yield* observe;
      expect(before).toContainEqual(
        expect.objectContaining({
          address: { kind: "file", path: path.join(first, "AGENTS.md") },
          ownership: "owned",
          configuredConsumers: ["codex"],
        }),
      );
      expect(yield* Ref.get(ancestorReads)).toBe(1);
      yield* fs.remove(alias);
      yield* fs.symlink(second, alias);
      const after = yield* observe;
      expect(after).toContainEqual(
        expect.objectContaining({
          address: { kind: "file", path: path.join(second, "AGENTS.md") },
          ownership: "absent",
        }),
      );
      expect(yield* Ref.get(ancestorReads)).toBe(2);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
