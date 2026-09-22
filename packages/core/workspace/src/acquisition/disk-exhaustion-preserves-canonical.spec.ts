import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Sink from "effect/Sink";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  canonicalMaterializationPaths,
  materializeExternalPackage,
} from "./canonical-directory.js";

export const specification = defineSpecification({
  requirement: "workspace/disk-exhaustion-preserves-canonical",
  title: "Disk exhaustion during staging preserves the prior canonical package",
  statement:
    "AXM shall preserve the prior complete canonical package and remove incomplete sibling staging when a disk-full write fails, so a later retry can publish the source successfully.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "A real temporary filesystem with one injected ENOSPC sink failure exposes the canonical, staging, backup, and retry outcomes without filling the host disk.",
  methods: ["fault-injection", "example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Disk exhaustion during package publication", () => {
  it.effect("keeps the prior canonical tree and allows a retry", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fs.makeTempDirectoryScoped({ prefix: "axm-disk-full-" });
      const source = path.join(workspace, "source");
      const canonicalPath = path.join(workspace, "agent_extensions", "skill");
      yield* fs.makeDirectory(source);
      yield* fs.makeDirectory(canonicalPath, { recursive: true });
      yield* fs.writeFileString(path.join(source, "SKILL.md"), "new content");
      yield* fs.writeFileString(path.join(canonicalPath, "SKILL.md"), "prior content");

      const failingFs = {
        ...fs,
        sink: (target, options) =>
          target.includes(".axm-staging")
            ? Sink.fail(
                PlatformError.systemError({
                  _tag: "Unknown",
                  module: "FileSystem",
                  method: "sink",
                  syscall: "write",
                  pathOrDescriptor: target,
                  cause: { code: "ENOSPC" },
                }),
              )
            : fs.sink(target, options),
      } satisfies FileSystem.FileSystem;
      const args = {
        baseDir: workspace,
        canonicalPath,
        sourceLocation: source,
        copyFailureCode: "internal" as const,
        copyFailureDetail: (target: string) => `Failed to copy source to ${target}`,
      };

      const failed = yield* Effect.result(
        materializeExternalPackage(args).pipe(
          Effect.provideService(FileSystem.FileSystem, failingFs),
        ),
      );
      expect(Result.isFailure(failed)).toBe(true);
      expect(yield* fs.readFileString(path.join(canonicalPath, "SKILL.md"))).toBe("prior content");
      const siblings = canonicalMaterializationPaths(canonicalPath);
      expect(yield* fs.exists(siblings.stagingPath)).toBe(false);
      expect(yield* fs.exists(siblings.backupPath)).toBe(false);

      yield* materializeExternalPackage(args);
      expect(yield* fs.readFileString(path.join(canonicalPath, "SKILL.md"))).toBe("new content");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
