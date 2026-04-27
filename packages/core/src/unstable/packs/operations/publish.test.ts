/**
 * Unit tests for the publishExtensionPack operation handler.
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
import { publishExtensionPack, type PublishExtensionPackOperation } from "./publish.js";
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
    getConfiguredProfile: () => Effect.succeed(handle("@community")),
  });
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs));
};

/** Creates a minimal PublishExtensionPackOperation for testing. */
const makeOp = (
  overrides: Partial<PublishExtensionPackOperation["args"]> = {},
): PublishExtensionPackOperation => ({
  name: "publish-pack",
  args: {
    name: overrides.name ?? "@community/packs/my-pack",
    registryName: overrides.registryName ?? "local",
  },
});

describe("publishExtensionPack", () => {
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
      skills: { "@community/skills/example": "^1.0.0" },
      ...manifest,
    };
    fs.writeFileSync(
      path.join(packDir, "extension-pack.json"),
      JSON.stringify(defaultManifest, null, 2),
    );

    return { base, axmDir, packDir, registryRoot };
  };

  describe("compatiblePackages NOT propagated for packs", () => {
    it.effect("does not include compatiblePackages in VersionEntry even when manifest has it", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup("@community", "compat-pack", {
          compatiblePackages: ["pkg:npm/claude-code"],
        });

        yield* publishExtensionPack(
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
        expect(index.versions[0]).not.toHaveProperty("compatiblePackages");
      }),
    );
  });

  it.effect("records every dependency type in published metadata", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "full-pack", {
        skills: { "@community/skills/example": "^1.0.0" },
        commands: { "@community/commands/release": "~2.0.0" },
        "mcp-servers": { "@community/mcp-servers/docs": "3.1.0" },
        subagents: { "@community/subagents/researcher": "1.4.0" },
      });

      yield* publishExtensionPack(
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
        "@community/commands/release": "~2.0.0",
        "@community/mcp-servers/docs": "3.1.0",
        "@community/subagents/researcher": "1.4.0",
      });
    }),
  );
});
