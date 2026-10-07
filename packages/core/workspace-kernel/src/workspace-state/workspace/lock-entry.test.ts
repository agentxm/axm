import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { SkillLockEntrySchema, PackLockEntrySchema } from "../desired/lockfile/index.js";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { exactVersion, extensionName, handle } from "../testing.js";
import type { SourceHostConfig } from "../desired/settings/index.js";
import {
  lockEntryToRef,
  lockEntrySource,
  lockEntryToSourceParams,
  lockEntryMatchesSourceLocator,
  printSkillLockSourceLocator,
} from "./lock-entry.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";
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
  treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
});

const registryEntry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
  source: { type: "registry", url: "https://registry.example.test" },
  identity: { owner: "@acme", name: "review" },
  resolved: {
    version: "1.0.0",
    integrity: "sha512-review",
    publisherBindingId: "hbnd_review",
  },
  treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
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
    source: { type: "path", path: "/sources/review" },
    identity: { owner: "@acme", name: "review" },
    resolved: { tree: `sha256-tree-v2:${"0".repeat(64)}` },
    treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
  });
  expect(lockEntrySource(local)).toEqual({ type: "local", path: "/sources/review" });
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

  it.effect("rehydrates the selected Git plugin component within its retained package", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const distribution = {
        format: "claude",
        packageRoot: "plugins/reviews",
        componentPath: "skills/review",
        manifestPath: ".claude-plugin/plugin.json",
        marketplace: { path: ".claude-plugin/marketplace.json", name: "reviews" },
      };
      const pluginEntry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
        ...entry,
        source: {
          type: "git",
          url: "https://github.com/acme/plugins.git",
          path: "plugins/reviews/skills/review",
          distribution,
        },
      });
      const ref = yield* lockEntryToRef.skill("review", pluginEntry, {
        baseDir: "/workspace",
        path,
        scope: "project",
        getConfiguredSourceByName: () => Effect.succeed(Option.none()),
      });
      expect(ref).toMatchObject({ distribution });
      if (ref.refType !== "git-hosted") throw new Error("Expected Git plugin reference");
      expect(ref.location).toMatch(/\/plugins\/reviews\/skills\/review$/u);
      expect(ref.sourcePath).toBe("plugins/reviews/skills/review");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reconstructs complete accepted Pack declarations without source reads", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const dependencies = {
        "@acme/skills/review": "^1.0.0",
        "@other/rules/guard": {
          source: { type: "registry" as const, url: "https://other.example/" },
          versionRange: "^2.0.0",
        },
      };
      const packFields = {
        identity: { owner: "@acme", name: "toolkit" },
        manifestVersion: "1.0.0",
        manifestContentIdentity: computePackManifestContentIdentity({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "1.0.0",
          dependencies,
        }),
        dependencies,
        treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
      };
      const sources = [
        {
          source: { type: "registry", url: "https://registry.example/" },
          resolved: { version: "1.0.0", integrity: "sha512-test", publisherBindingId: "binding" },
        },
        {
          source: {
            type: "git",
            url: "https://github.com/acme/tools.git",
            path: "catalog/packs/toolkit",
          },
          resolved: { commit: "commit", tree: "tree" },
          sourceRoot: "catalog",
        },
        {
          source: { type: "path", path: "catalog/packs/toolkit" },
          resolved: { tree: `sha256-tree-v2:${"0".repeat(64)}` },
          sourceRoot: "catalog",
        },
      ];
      for (const source of sources) {
        const locked = Schema.decodeUnknownSync(PackLockEntrySchema)({ ...packFields, ...source });
        const ref = yield* lockEntryToRef.pack("toolkit", locked, {
          baseDir: "/workspace",
          path,
          scope: "project",
          getConfiguredSourceByName: () => Effect.succeed(Option.none()),
        });
        expect(ref.pack.dependencies).toEqual(locked.dependencies);
        expect(ref.version).toBe("1.0.0");
        if (ref.refType === "git-hosted") {
          expect(ref.source.subPath).toEqual(Option.some("catalog"));
        }
        if (ref.refType === "local") {
          expect(ref.source.path).toBe(path.join("/workspace", "catalog"));
        }
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

const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
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
        source: { type: "path", path: "/sources/review" },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: { tree: treeIntegrity },
        treeIntegrity,
      }),
    ).toEqual({ type: "local", path: "/sources/review" });
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

  it.each([
    ["git://git.example.test/collection.git#main", true],
    ["git://git.example.test/collection.git#axm:path=skills&ref=main", true],
    ["git://git.example.test/collection.git#axm:path=skills%2Freview&ref=main", true],
    ["git://git.example.test/collection.git#axm:path=skills%2Fother&ref=main", false],
    ["git://git.example.test/collection.git#other", false],
    ["git://git.example.test/other.git#main", false],
  ])("compares the accepted Git member against containing views: %s", (locator, matches) => {
    const accepted = Schema.decodeUnknownSync(SkillLockEntrySchema)({
      source: {
        type: "git",
        url: "git://git.example.test/collection.git",
        path: "skills/review",
        revision: "main",
      },
      identity: { name: "review" },
      resolved: { commit: "commit-1", tree: "tree-1" },
      treeIntegrity,
    });
    expect(lockEntryMatchesSourceLocator(accepted, locator)).toBe(matches);
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
