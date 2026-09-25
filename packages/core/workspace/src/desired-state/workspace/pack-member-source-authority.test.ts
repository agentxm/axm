/**
 * The held side (an accepted Pack lock row) and the requested side (a resolved
 * source) spell one source view identically, whatever each records.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { PackLockEntrySchema } from "../lockfile/schema.js";
import { formatDesiredSourceAuthority } from "./desired-identity.js";
import { packMemberSourceAuthority } from "./pack-member-source-authority.js";

const packFields = {
  identity: { owner: "@acme", name: "toolkit" },
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
  manifestVersion: "1.0.0",
  manifestContentIdentity: "sha256-pack-manifest",
  members: ["@acme/skills/review"],
};

const acceptedLock = (entry: Record<string, unknown>) =>
  Schema.decodeUnknownSync(PackLockEntrySchema)({ ...packFields, ...entry });

const spelled = (view: Parameters<typeof packMemberSourceAuthority>[0]) =>
  formatDesiredSourceAuthority(packMemberSourceAuthority(view));

describe("packMemberSourceAuthority", () => {
  it.effect("spells a Git source view from the lock and from the resolved source identically", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const url = new URL("https://github.com/acme/toolkit.git");
      const held = spelled({
        kind: "accepted",
        entry: acceptedLock({
          source: { type: "git", url: url.href, path: "vendor/packs/toolkit", revision: "main" },
          resolved: { commit: "c".repeat(40), tree: "t".repeat(40) },
          sourceRoot: "vendor",
        }),
      });
      expect(held).toBe("git:https://github.com/acme/toolkit.git#main//vendor");
      expect(held).toBe(
        spelled({
          kind: "resolved",
          source: { type: "git", url, ref: Option.some("main"), subPath: Option.some("vendor") },
          path,
          baseDir: "/workspace",
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("spells a repository root view without a subdirectory and an unnamed ref as HEAD", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const url = new URL("https://github.com/acme/toolkit.git");
      expect(
        spelled({
          kind: "accepted",
          entry: acceptedLock({
            source: { type: "git", url: url.href, path: "packs/toolkit" },
            resolved: { commit: "c".repeat(40), tree: "t".repeat(40) },
          }),
        }),
      ).toBe("git:https://github.com/acme/toolkit.git#HEAD");
      expect(
        spelled({
          kind: "resolved",
          source: { type: "git", url, ref: Option.none(), subPath: Option.none() },
          path,
          baseDir: "/workspace",
        }),
      ).toBe("git:https://github.com/acme/toolkit.git#HEAD");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "spells a local source view workspace-relative from the lock and from the resolved path",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const baseDir = path.join(path.sep, "workspace", "project");
        const held = spelled({
          kind: "accepted",
          entry: acceptedLock({
            source: { type: "path", path: "vendor/tools/toolkit" },
            resolved: { tree: "sha256-pack-content" },
            sourceRoot: "vendor",
          }),
        });
        expect(held).toBe("path:vendor");
        expect(
          spelled({
            kind: "resolved",
            source: { type: "local", path: path.join(baseDir, "vendor") },
            path,
            baseDir,
          }),
        ).toBe(held);
        expect(
          spelled({
            kind: "resolved",
            source: { type: "local", path: path.join(baseDir, "..", "shared") },
            path,
            baseDir,
          }),
        ).toBe("path:../shared");
        expect(
          spelled({ kind: "resolved", source: { type: "local", path: baseDir }, path, baseDir }),
        ).toBe("path:.");
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("spells a Registry source by its endpoint from either side", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const location = new URL("https://registry.example.test/");
      expect(
        spelled({
          kind: "accepted",
          entry: acceptedLock({
            source: { type: "registry", url: location.href },
            resolved: { version: "1.0.0", integrity: "sha512-x", publisherBindingId: "binding" },
          }),
        }),
      ).toBe(`registry:${location.href}`);
      expect(
        spelled({
          kind: "resolved",
          source: { type: "registry", name: "test", location, owner: Option.none() },
          path,
          baseDir: "/workspace",
        }),
      ).toBe(`registry:${location.href}`);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
