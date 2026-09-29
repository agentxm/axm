import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  assertNativeMutationWithin,
  assertNoPhysicalOverlap,
  resolveNativeEntry,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/identity-distinguishes-entry-and-referent",
  title: "Physical location identity distinguishes an entry from its referent",
  statement:
    "AXM shall coalesce aliases of one native entry while preserving distinct leaf links, refuse physical escapes and conflicting workspace authorities before mutation, and prohibit overlapping source and output trees.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real temporary directories and links establish entry identity, containment, and independent workspace boundaries.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("native physical addresses", () => {
  it.effect("coalesces different-depth parent aliases but keeps leaf links separate", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const physical = path.join(root, "deep", "native");
      yield* fs.makeDirectory(physical, { recursive: true });
      yield* fs.symlink(physical, path.join(root, "alias"));
      yield* fs.writeFileString(path.join(physical, "config"), "content");
      const direct = yield* resolveNativeEntry(path.join(physical, "config"));
      const alias = yield* resolveNativeEntry(path.join(root, "alias", "config"));
      expect(alias.entryPath).toBe(direct.entryPath);
      const missing = yield* resolveNativeEntry(path.join(root, "alias", "missing", "entry"));
      expect(missing.entryPath).toBe(path.join(physical, "missing", "entry"));
      yield* fs.symlink("deep/native/config", path.join(root, "first"));
      yield* fs.symlink("first", path.join(root, "second"));
      const first = yield* resolveNativeEntry(path.join(root, "first"));
      const second = yield* resolveNativeEntry(path.join(root, "second"));
      expect(first.entryPath).not.toBe(second.entryPath);
      expect(first.referentPath).toBe(second.referentPath);
      expect(second.linkTarget).toBe("first");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("distinguishes a dangling leaf from absence and refuses a dangling ancestor", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.symlink("missing", path.join(root, "dangling"));
      const leaf = yield* resolveNativeEntry(path.join(root, "dangling"));
      expect(leaf.kind).toBe("symlink");
      expect(leaf.referentPath).toBeUndefined();
      const ancestor = yield* resolveNativeEntry(path.join(root, "dangling", "config")).pipe(
        Effect.result,
      );
      expect(ancestor._tag).toBe("Failure");
      if (ancestor._tag === "Failure") expect(ancestor.failure.reason).toBe("dangling-ancestor");
      yield* fs.symlink("cycle-b", path.join(root, "cycle-a"));
      yield* fs.symlink("cycle-a", path.join(root, "cycle-b"));
      const cycle = yield* resolveNativeEntry(path.join(root, "cycle-a", "config")).pipe(
        Effect.result,
      );
      expect(cycle._tag).toBe("Failure");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses escaping content, nested authorities, and overlapping source trees", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sandbox = yield* fs.makeTempDirectoryScoped();
      const root = path.join(sandbox, "workspace");
      const child = path.join(root, "child");
      yield* fs.makeDirectory(child, { recursive: true });
      yield* fs.writeFileString(path.join(sandbox, "foreign.json"), "{}");
      yield* fs.symlink(path.join(sandbox, "foreign.json"), path.join(root, "config.json"));
      expect((yield* assertNativeMutationWithin(root, path.join(root, "config.json"))).kind).toBe(
        "symlink",
      );
      const escaped = yield* assertNativeMutationWithin(
        root,
        path.join(root, "config.json"),
        "content",
      ).pipe(Effect.result);
      expect(escaped._tag).toBe("Failure");
      if (escaped._tag === "Failure") expect(escaped.failure.reason).toBe("escape");
      yield* fs.writeFileString(path.join(child, "axm.json"), "{}");
      yield* fs.symlink(path.join(child, "native.json"), path.join(root, "native.json"));
      // An ordinary absent leaf below a foreign authority is refused too.
      const nested = yield* assertNativeMutationWithin(
        root,
        path.join(child, "native.json"),
        "content",
      ).pipe(Effect.result);
      expect(nested._tag).toBe("Failure");
      if (nested._tag === "Failure") expect(nested.failure.reason).toBe("workspace-conflict");
      const source = path.join(root, "source");
      yield* fs.makeDirectory(source);
      for (const output of [source, root, path.join(source, "copy")]) {
        const overlap = yield* assertNoPhysicalOverlap(source, output).pipe(Effect.result);
        expect(overlap._tag).toBe("Failure");
      }
      yield* assertNoPhysicalOverlap(source, path.join(root, "separate"));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses hardlinked content and distinguishes project from user authority", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const project = path.join(home, "project");
      const userWorkspace = path.join(home, ".axm", "workspace");
      yield* fs.makeDirectory(project);
      yield* fs.makeDirectory(userWorkspace, { recursive: true });
      yield* fs.writeFileString(path.join(project, "axm.json"), "{}");
      yield* fs.writeFileString(path.join(userWorkspace, "axm.json"), "{}");
      const userFile = path.join(home, "native.json");
      yield* fs.writeFileString(userFile, "{}");
      yield* fs.link(userFile, path.join(project, "hardlink.json"));
      const hardlink = yield* assertNativeMutationWithin(
        project,
        path.join(project, "hardlink.json"),
        "content",
      ).pipe(Effect.result);
      expect(hardlink._tag).toBe("Failure");
      if (hardlink._tag === "Failure") expect(hardlink.failure.reason).toBe("hardlink");
      const projectFromUser = yield* assertNativeMutationWithin(
        home,
        path.join(project, "config.json"),
        "content",
        userWorkspace,
      ).pipe(Effect.result);
      expect(projectFromUser._tag).toBe("Failure");
      if (projectFromUser._tag === "Failure")
        expect(projectFromUser.failure.reason).toBe("workspace-conflict");
      const userFromProject = yield* assertNativeMutationWithin(project, userFile, "content").pipe(
        Effect.result,
      );
      expect(userFromProject._tag).toBe("Failure");
      if (userFromProject._tag === "Failure") expect(userFromProject.failure.reason).toBe("escape");
      yield* assertNativeMutationWithin(
        home,
        path.join(userWorkspace, "lock.yaml"),
        "content",
        userWorkspace,
      );
      yield* assertNativeMutationWithin(
        home,
        path.join(home, "user-native.json"),
        "content",
        userWorkspace,
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
