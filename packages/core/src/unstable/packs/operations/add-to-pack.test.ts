import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer } from "../../cli-renderer/index.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { handle } from "../../test-helpers.js";
import type { AddToPackOperation } from "./add-to-pack.js";
import { addToPack } from "./add-to-pack.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Compute a content hash for stale-check testing. */
const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

/** Creates a workspace mock for add-to-pack tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredProfile?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    configuredPacks?: Record<string, any>;
  } = {},
): WorkspaceMutationsService => {
  const configuredProfile = opts.configuredProfile ?? "@myorg";

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredOwner: () => Effect.succeed(Option.some(handle(configuredProfile))),
    getConfiguredPacks: () =>
      Effect.succeed(
        opts.configuredPacks ?? {
          "my-pack": {
            source: "@myorg/packs/my-pack",
            packagingKind: "non-native" as const,
          },
        },
      ),
  });
};

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  const { layer: outputLayer } = TestRenderer.make();
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs), outputLayer);
};

/** Creates a pack manifest on disk and returns its content hash. */
const createPackManifest = (base: string, owner: string, packName: string) => {
  const packDir = path.join(base, ".axm", "extensions", owner, "packs", packName);
  fs.mkdirSync(packDir, { recursive: true });
  const manifest = {
    owner,
    type: "pack",
    name: packName,
    version: "0.0.1",
    dependencies: {},
  };
  const content = JSON.stringify(manifest, null, 2) + "\n";
  fs.writeFileSync(path.join(packDir, "pack.json"), content);
  return { packDir, manifestHash: hashContent(content), content };
};

/** Creates a minimal AddToPackOperation for testing. */
const makeOp = (
  overrides: Partial<AddToPackOperation["args"]> & { manifestHash: string },
): AddToPackOperation => ({
  name: "add-to-pack",
  args: {
    packName: overrides.packName ?? "my-pack",
    packOwner: overrides.packOwner ?? handle("@myorg"),
    additions: overrides.additions ?? { "@acme/skills/my-skill": "^1.0.0" },
    manifestHash: overrides.manifestHash,
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("addToPack", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "add-to-pack-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const setupBase = () => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    return { base, axmDir };
  };

  describe("happy path", () => {
    it.effect("adds extensions to pack manifest", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifest(base, "@myorg", "my-pack");

        const result = yield* addToPack(
          makeOp({
            additions: { "@acme/skills/my-skill": "^1.0.0" },
            manifestHash,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Verify manifest was updated
        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "packs",
          "my-pack",
          "pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.dependencies["@acme/skills/my-skill"]).toBe("^1.0.0");
      }),
    );

    it.effect("adds multiple extensions at once", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifest(base, "@myorg", "my-pack");

        const result = yield* addToPack(
          makeOp({
            additions: {
              "@acme/skills/skill-a": "^1.0.0",
              "@acme/skills/skill-b": "^2.0.0",
            },
            manifestHash,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "packs",
          "my-pack",
          "pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.dependencies["@acme/skills/skill-a"]).toBe("^1.0.0");
        expect(manifest.dependencies["@acme/skills/skill-b"]).toBe("^2.0.0");
      }),
    );

    it.effect("returns success when additions map is empty", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifest(base, "@myorg", "my-pack");

        const result = yield* addToPack(makeOp({ additions: {}, manifestHash })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.result).toBe("success");
      }),
    );
  });

  describe("stale manifest conflict", () => {
    it.effect("fails when manifest changed since plan time", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        createPackManifest(base, "@myorg", "my-pack");

        // Use a stale hash that doesn't match current manifest
        const result = yield* addToPack(
          makeOp({
            additions: { "@acme/skills/my-skill": "^1.0.0" },
            manifestHash: "stale-hash-that-does-not-match",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("stale");
      }),
    );

    it.effect("does not write partial manifest on stale conflict", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { content } = createPackManifest(base, "@myorg", "my-pack");

        yield* addToPack(
          makeOp({
            additions: { "@acme/skills/my-skill": "^1.0.0" },
            manifestHash: "stale-hash-that-does-not-match",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch(() => Effect.void),
        );

        // Manifest should be unchanged
        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "packs",
          "my-pack",
          "pack.json",
        );
        const currentContent = fs.readFileSync(manifestPath, "utf-8");
        expect(currentContent).toBe(content);
      }),
    );
  });

  describe("FQN storage", () => {
    it.effect("writes command FQNs to manifest dependencies", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifest(base, "@myorg", "my-pack");

        const result = yield* addToPack(
          makeOp({
            additions: { "@acme/commands/my-cmd": "^1.0.0" },
            manifestHash,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "packs",
          "my-pack",
          "pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.dependencies["@acme/commands/my-cmd"]).toBe("^1.0.0");
        expect(manifest.commands).toBeUndefined();
      }),
    );

    it.effect("writes mcp-server FQNs to manifest dependencies", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifest(base, "@myorg", "my-pack");

        const result = yield* addToPack(
          makeOp({
            additions: { "@acme/mcps/my-server": "^2.0.0" },
            manifestHash,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "packs",
          "my-pack",
          "pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.dependencies["@acme/mcps/my-server"]).toBe("^2.0.0");
        expect(manifest["mcps"]).toBeUndefined();
      }),
    );

    it.effect("writes mixed FQN types to manifest dependencies", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifest(base, "@myorg", "my-pack");

        const result = yield* addToPack(
          makeOp({
            additions: {
              "@acme/skills/my-skill": "^1.0.0",
              "@acme/commands/my-cmd": "^2.0.0",
              "@acme/mcps/my-server": "^3.0.0",
            },
            manifestHash,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "packs",
          "my-pack",
          "pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.dependencies["@acme/skills/my-skill"]).toBe("^1.0.0");
        expect(manifest.dependencies["@acme/commands/my-cmd"]).toBe("^2.0.0");
        expect(manifest.dependencies["@acme/mcps/my-server"]).toBe("^3.0.0");
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when manifest file does not exist", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();
        // Don't create the manifest on disk

        const result = yield* addToPack(
          makeOp({
            manifestHash: "nonexistent",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
      }),
    );
  });
});
