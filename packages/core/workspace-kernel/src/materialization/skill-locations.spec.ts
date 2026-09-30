import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { groupInstallTargetsByDirectory } from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/skills/physical-locations-include-shared-policy",
  title: "Skills publish once per physical location including the shared location",
  statement:
    "AXM shall include the shared .agents/skills location for enabled Skills independently of configured agents, group directory aliases that address the same physical location into one write with all configured consumers, and preserve separate entries whose distinct parents merely contain links to the same source.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Physical Skill locations", () => {
  it.effect("retains a shared location without inventing an agent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      expect(yield* groupInstallTargetsByDirectory([], root)).toEqual([
        { targetDir: path.join(root, ".agents/skills"), agentIds: [] },
      ]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "coalesces case aliases only when the selected volume addresses one physical directory",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const upper = path.join(root, ".Agents", "skills");
        const lower = path.join(root, ".agents", "skills");
        yield* fs.makeDirectory(upper, { recursive: true });
        const folds = yield* fs.exists(lower);
        const targets = [
          { agentId: "claude-code", targetDir: upper },
          { agentId: "codex", targetDir: lower },
        ] as const;
        for (const order of [targets, [...targets].reverse()]) {
          const locations = yield* groupInstallTargetsByDirectory(order, root);
          expect(locations).toHaveLength(folds ? 1 : 2);
          if (folds) {
            expect(locations[0]?.targetDir).toBe(upper);
            expect(new Set(locations[0]?.agentIds)).toEqual(new Set(["claude-code", "codex"]));
          } else {
            expect(locations.find((location) => location.targetDir === upper)?.agentIds).toEqual([
              "claude-code",
            ]);
            expect(locations.find((location) => location.targetDir === lower)?.agentIds).toEqual([
              "codex",
            ]);
          }
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("folds directory aliases in either configured order", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const shared = path.join(root, ".agents/skills");
      yield* fs.makeDirectory(shared, { recursive: true });
      const alias = path.join(root, "alias");
      yield* fs.symlink(shared, alias);
      const targets = [
        { agentId: "claude-code", targetDir: shared },
        { agentId: "cursor", targetDir: alias },
      ] as const;
      for (const order of [targets, [...targets].reverse()]) {
        const locations = yield* groupInstallTargetsByDirectory(order, root);
        expect(locations).toHaveLength(1);
        expect(locations[0]?.targetDir).toBe(shared);
        expect(new Set(locations[0]?.agentIds)).toEqual(new Set(["claude-code", "cursor"]));
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
