import * as nodeFs from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  canonicalMaterializationPaths,
  materializeExternalPackage,
} from "./canonical-directory.js";

export const specification = defineSpecification({
  requirement: "workspace/cross-filesystem-source-publishes",
  title: "A source on another filesystem publishes through sibling staging",
  statement:
    "AXM shall copy a verified source tree from a different filesystem into canonical sibling staging before publishing it, so cross-filesystem rename restrictions cannot leave a partial canonical package.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "Separate tmpfs and ordinary temporary directories expose real cross-filesystem rename constraints while the canonical staging and backup paths remain inspectable.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Cross-filesystem package publication", () => {
  it.effect.skipIf(process.platform !== "linux" || !nodeFs.existsSync("/dev/shm"))(
    "copies scratch content into same-parent staging before publication",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const source = yield* fs.makeTempDirectoryScoped({
          directory: "/dev/shm",
          prefix: "axm-cross-fs-source-",
        });
        const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "axm-cross-fs-target-" });
        expect((yield* fs.stat(source)).dev).not.toBe((yield* fs.stat(workspace)).dev);
        yield* fs.writeFileString(path.join(source, "SKILL.md"), "# Cross filesystem\n");
        const canonicalPath = path.join(workspace, "agent_extensions", "skill");

        yield* materializeExternalPackage({
          baseDir: workspace,
          canonicalPath,
          sourceLocation: source,
          copyFailureCode: "validation",
          copyFailureDetail: (target) => `Failed to copy source to ${target}`,
        });

        expect(yield* fs.readFileString(path.join(canonicalPath, "SKILL.md"))).toBe(
          "# Cross filesystem\n",
        );
        const siblings = canonicalMaterializationPaths(canonicalPath);
        expect(yield* fs.exists(siblings.stagingPath)).toBe(false);
        expect(yield* fs.exists(siblings.backupPath)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
