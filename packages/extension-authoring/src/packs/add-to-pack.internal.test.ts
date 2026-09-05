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
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import { configuredRow, makeBaseWorkspaceMock, rowsFor } from "@agentxm/workspace-state/testing";
import { handle, TestAuthoringFailureAdapter } from "../test-helpers.js";
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
  const configuredPacks = opts.configuredPacks ?? {
    "my-pack": {
      source: "workspace",
      enabled: true,
    },
  };

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredOwner: () => Effect.succeed(Option.some(handle(configuredProfile))),
    getConfiguredPackEntries: () => Effect.succeed(configuredPacks),
    rows: rowsFor({
      pack: [
        configuredRow({
          type: "pack",
          name: "my-pack",
          source: "workspace",
          packagingKind: "non-native",
        }),
      ],
    }),
  });
};

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  return Layer.mergeAll(
    NodeServices.layer,
    WorkspaceMutations.layer(mockWs),
    TestAuthoringFailureAdapter,
  );
};

/** Creates a pack manifest on disk and returns its content hash. */
const createPackManifest = (base: string, owner: string, packName: string) => {
  const packDir = path.join(base, "packs", packName);
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
        const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
        const currentContent = fs.readFileSync(manifestPath, "utf-8");
        expect(currentContent).toBe(content);
      }),
    );
  });

  describe("FQN storage", () => {
    it.effect("writes hook FQNs to manifest dependencies", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifest(base, "@myorg", "my-pack");

        const result = yield* addToPack(
          makeOp({
            additions: { "@acme/hooks/my-hook": "^1.0.0" },
            manifestHash,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.dependencies["@acme/hooks/my-hook"]).toBe("^1.0.0");
        expect(manifest.hooks).toBeUndefined();
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

        const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
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
              "@acme/hooks/my-hook": "^2.0.0",
              "@acme/mcps/my-server": "^3.0.0",
            },
            manifestHash,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const manifestPath = path.join(base, "packs", "my-pack", "pack.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.dependencies["@acme/skills/my-skill"]).toBe("^1.0.0");
        expect(manifest.dependencies["@acme/hooks/my-hook"]).toBe("^2.0.0");
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
