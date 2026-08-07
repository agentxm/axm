/**
 * Unit tests for the publishPack operation handler.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { publishPack, type PublishPackOperation } from "./publish.js";
import { handle } from "../../test-helpers.js";

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, registryRoot: string) => {
  const registrySource = {
    name: "local",
    type: "registry" as const,
    location: new URL(`file://${registryRoot}`),
  };

  const mockWs: WorkspaceMutationsService = makeBaseWorkspaceMock(axmDir, {
    getConfiguredSources: () => Effect.succeed([registrySource]),
    getConfiguredSourceByName: (name: string) =>
      Effect.succeed(name === "local" ? Option.some(registrySource) : Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([registrySource]),
    getConfiguredAgents: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.some(handle("@community"))),
  });
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs));
};

/** Creates a minimal PublishPackOperation for testing. */
const makeOp = (overrides: Partial<PublishPackOperation["args"]> = {}): PublishPackOperation => ({
  name: "publish-pack",
  args: {
    name: overrides.name ?? "@community/packs/my-pack",
    registryName: overrides.registryName ?? "local",
  },
});

describe("publishPack", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publish-pack-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with an installed pack and registry. */
  const setup = (
    owner = "@community",
    name = "my-pack",
    manifest: Record<string, unknown> = {},
  ) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const packDir = path.join(base, ".axm", "extensions", owner, "packs", name);
    const registryRoot = path.join(tmpDir, "registry");

    fs.mkdirSync(packDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    const defaultManifest = {
      owner,
      type: "pack",
      name,
      version: "0.1.0",
      dependencies: { "@community/skills/example": "^1.0.0" },
      ...manifest,
    };
    fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(defaultManifest, null, 2));

    return { base, axmDir, packDir, registryRoot };
  };

  describe("packages NOT propagated for packs", () => {
    it.effect("does not include packages in VersionEntry even when manifest has it", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup("@community", "compat-pack", {
          packages: [{ purl: "pkg:npm/claude-code" }],
        });

        yield* publishPack(
          makeOp({ name: "@community/packs/compat-pack", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "packs",
          "compat-pack",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions[0]).not.toHaveProperty("packages");
      }),
    );
  });

  it.effect("records every dependency type in published metadata", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "full-pack", {
        dependencies: {
          "@community/skills/example": "^1.0.0",
          "@community/hooks/release": "~2.0.0",
          "@community/mcps/files": "3.1.0",
          "@community/subagents/researcher": "1.4.0",
        },
      });

      yield* publishPack(
        makeOp({ name: "@community/packs/full-pack", registryName: "local" }),
      ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

      const indexPath = path.join(
        registryRoot,
        "extensions",
        "@community",
        "packs",
        "full-pack",
        "index.json",
      );
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      expect(index.versions[0]?.dependencies).toEqual({
        "@community/skills/example": "^1.0.0",
        "@community/hooks/release": "~2.0.0",
        "@community/mcps/files": "3.1.0",
        "@community/subagents/researcher": "1.4.0",
      });
    }),
  );

  it.effect("rejects unrecognized manifest keys before publishing", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "bad-keys", {
        companionPackages: [{ purl: "pkg:npm/example" }],
      });

      const result = yield* publishPack(
        makeOp({ name: "@community/packs/bad-keys", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("pack/manifest-keys-recognized");
      expect(result.message).toContain("companionPackages");
    }),
  );

  it.effect("rejects publishing an empty pack", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "empty-pack", {
        dependencies: {},
      });

      const result = yield* publishPack(
        makeOp({ name: "@community/packs/empty-pack", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((error) => Effect.succeed(error)),
      );

      expect(result).toMatchObject({ code: "validation" });
    }),
  );
});
