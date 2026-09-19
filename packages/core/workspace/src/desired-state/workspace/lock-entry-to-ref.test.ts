import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { SkillLockEntrySchema } from "../lockfile/index.js";
import type { SourceHostConfig } from "../settings/index.js";
import { skillLockEntryToRef } from "./lock-entry-to-ref.js";
import { LockEntryEndpointConflict } from "./errors.js";

const entry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
  source: {
    type: "git",
    url: "https://github.com/remix-run/react-router.git",
    path: ".agents/skills/react-router",
    revision: "main",
  },
  identity: { name: "react-router" },
  resolved: { commit: "commit", tree: "tree" },
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
});

const registryEntry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
  source: { type: "registry", url: "https://registry.example.test" },
  identity: { owner: "@acme", name: "review" },
  resolved: {
    version: "1.0.0",
    integrity: "sha512-review",
    publisherBindingId: "hbnd_review",
  },
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
});

describe("lock entry source authority", () => {
  it.effect("rehydrates Git directly from the self-describing URL", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const ref = yield* skillLockEntryToRef("react-router", entry, {
        baseDir: "/workspace",
        path,
        scope: "project",
        getConfiguredSourceByName: () => Effect.succeed(Option.none()),
      });

      expect(ref.refType).toBe("git-hosted");
      if (ref.refType === "git-hosted") {
        expect(ref.source).toMatchObject({
          type: "git",
          url: new URL("https://github.com/remix-run/react-router.git"),
        });
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("blocks reconstruction after a named Registry endpoint change", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const configured = {
        type: "registry",
        name: "enterprise",
        location: new URL("https://registry.changed.test"),
      } satisfies SourceHostConfig;

      const error = yield* skillLockEntryToRef("review", registryEntry, {
        baseDir: "/workspace",
        path,
        scope: "project",
        registrySourceName: "enterprise",
        getConfiguredSourceByName: (name) =>
          Effect.succeed(name === configured.name ? Option.some(configured) : Option.none()),
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(LockEntryEndpointConflict);
      if (error instanceof LockEntryEndpointConflict) {
        expect(error.acceptedEndpoint).toBe("https://registry.example.test/");
        expect(error.resolvedEndpoint).toBe("https://registry.changed.test/");
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
