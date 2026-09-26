import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { SkillLockEntrySchema } from "../lockfile/index.js";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import type { SourceHostConfig } from "../settings/index.js";
import {
  lockEntryToRef,
  lockEntrySource,
  lockEntryToSourceParams,
  lockEntryMatchesSourceLocator,
  printSkillLockSourceLocator,
} from "./lock-entry.js";
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

it("covers every installable lock-entry ref type", () => {
  expect(Object.keys(lockEntryToRef).sort()).toEqual([...installableExtensionTypes].sort());
});

it("derives Registry, Git, and local sources from accepted rows", () => {
  expect(lockEntrySource(registryEntry)).toEqual({
    type: "registry",
    name: "registry",
    location: new URL("https://registry.example.test"),
    owner: Option.some(registryEntry.identity.owner),
  });
  expect(lockEntrySource(entry)).toEqual({
    type: "git",
    url: new URL("https://github.com/remix-run/react-router.git"),
    ref: Option.some("main"),
    subPath: Option.some(".agents/skills/react-router"),
  });
  const local = Schema.decodeUnknownSync(SkillLockEntrySchema)({
    source: { type: "path", path: "../review" },
    identity: { owner: "@acme", name: "review" },
    resolved: { tree: "sha256-content" },
    treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
  });
  expect(lockEntrySource(local)).toEqual({ type: "local", path: "../review" });
});

describe("lock entry source authority", () => {
  it.effect("rehydrates Git directly from the self-describing URL", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const ref = yield* lockEntryToRef.skill("react-router", entry, {
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

      const error = yield* lockEntryToRef
        .skill("review", registryEntry, {
          baseDir: "/workspace",
          path,
          scope: "project",
          registrySourceName: "enterprise",
          getConfiguredSourceByName: (name) =>
            Effect.succeed(name === configured.name ? Option.some(configured) : Option.none()),
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(LockEntryEndpointConflict);
      if (error instanceof LockEntryEndpointConflict) {
        expect(error.acceptedEndpoint).toBe("https://registry.example.test/");
        expect(error.resolvedEndpoint).toBe("https://registry.changed.test/");
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

describe("lock entry printers", () => {
  it("maps accepted Git and local resolutions back to source parameters", () => {
    expect(
      lockEntryToSourceParams({
        source: {
          type: "git",
          url: new URL("https://github.com/acme/extensions.git"),
          revision: "main",
          path: "skills/review",
        },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: { commit: "commit-1", tree: "tree-1" },
        treeIntegrity,
      }),
    ).toEqual({
      type: "git",
      url: new URL("https://github.com/acme/extensions.git"),
      ref: Option.some("main"),
      subPath: Option.some("skills/review"),
    });
    expect(
      lockEntryToSourceParams({
        source: { type: "path", path: "../review" },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: { tree: contentIdentity },
        treeIntegrity,
      }),
    ).toEqual({ type: "local", path: "../review" });
  });

  it("prints a Registry accepted resolution as an exact locator", () => {
    expect(
      printSkillLockSourceLocator("ignored", {
        source: { type: "registry", url: new URL("https://registry.agentxm.ai") },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: {
          version: exactVersion("1.2.3"),
          integrity: "sha512-archive",
          publisherBindingId: "binding-1",
        },
        treeIntegrity,
      }),
    ).toBe("registry:https://registry.agentxm.ai/:@acme/skills/review@1.2.3");
  });

  it("matches hosted Git shorthand after trimming URL path separators", () => {
    expect(
      lockEntryMatchesSourceLocator(
        {
          source: {
            type: "git",
            url: new URL("https://github.com/acme/extensions.git/"),
            revision: "main",
            path: "skills/review",
          },
          identity: { owner: handle("@acme"), name: extensionName("review") },
          resolved: { commit: "commit-1", tree: "tree-1" },
          treeIntegrity,
        },
        "github:acme/extensions//skills/review@main",
      ),
    ).toBe(true);
  });

  it("matches a bare GitHub locator with subpath and revision", () => {
    expect(
      lockEntryMatchesSourceLocator(
        {
          source: {
            type: "git",
            url: new URL("https://github.com/acme/extensions.git"),
            revision: "main",
            path: "skills/review",
          },
          identity: { owner: handle("@acme"), name: extensionName("review") },
          resolved: { commit: "commit-1", tree: "tree-1" },
          treeIntegrity,
        },
        "acme/extensions//skills/review@main",
      ),
    ).toBe(true);
  });

  it("matches an Azure Repos locator", () => {
    expect(
      lockEntryMatchesSourceLocator(
        {
          source: {
            type: "git",
            url: new URL("https://dev.azure.com/acme/platform/_git/widgets"),
            revision: "main",
            path: "skills/review",
          },
          identity: { owner: handle("@acme"), name: extensionName("review") },
          resolved: { commit: "commit-1", tree: "tree-1" },
          treeIntegrity,
        },
        "azurerepos:acme/platform/widgets//skills/review@main",
      ),
    ).toBe(true);
  });
});
