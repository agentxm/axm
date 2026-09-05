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
import type { RemoveFromPackOperation } from "./remove-from-pack.js";
import { removeFromPack } from "./remove-from-pack.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Compute a content hash for stale-check testing. */
const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

/** Creates a workspace mock for remove-from-pack tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredProfile?: string;
  } = {},
): WorkspaceMutationsService => {
  const configuredProfile = opts.configuredProfile ?? "@myorg";

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredOwner: () => Effect.succeed(Option.some(handle(configuredProfile))),
    getConfiguredPackEntries: () =>
      Effect.succeed({
        "my-pack": {
          source: "workspace",
          enabled: true,
        },
      }),
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

/** Creates a pack manifest with dependencies on disk and returns its content hash. */
const createPackManifestWithDependencies = (
  base: string,
  owner: string,
  packName: string,
  dependencies: Record<string, string> = {},
) => {
  const packDir = path.join(base, "packs", packName);
  fs.mkdirSync(packDir, { recursive: true });
  const manifest = {
    owner,
    type: "pack",
    name: packName,
    version: "0.0.1",
    dependencies,
  };
  const content = JSON.stringify(manifest, null, 2) + "\n";
  fs.writeFileSync(path.join(packDir, "pack.json"), content);
  return { packDir, manifestHash: hashContent(content), content };
};

/** Creates a minimal RemoveFromPackOperation for testing. */
const makeOp = (
  overrides: Partial<RemoveFromPackOperation["args"]> & { manifestHash: string },
): RemoveFromPackOperation => ({
  name: "remove-from-pack",
  args: {
    packName: overrides.packName ?? "my-pack",
    packOwner: overrides.packOwner ?? handle("@myorg"),
    removals: overrides.removals ?? ["@acme/skills/my-skill"],
    manifestHash: overrides.manifestHash,
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("removeFromPack", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "remove-from-pack-")));
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
    it.effect("returns success when removals list is empty", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifestWithDependencies(base, "@myorg", "my-pack", {
          "@acme/skills/my-skill": "^1.0.0",
        });

        const result = yield* removeFromPack(makeOp({ removals: [], manifestHash })).pipe(
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
        createPackManifestWithDependencies(base, "@myorg", "my-pack", {
          "@acme/skills/my-skill": "^1.0.0",
        });

        const result = yield* removeFromPack(
          makeOp({
            removals: ["@acme/skills/my-skill"],
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
        const { content } = createPackManifestWithDependencies(base, "@myorg", "my-pack", {
          "@acme/skills/my-skill": "^1.0.0",
        });

        yield* removeFromPack(
          makeOp({
            removals: ["@acme/skills/my-skill"],
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

  describe("error cases", () => {
    it.effect("fails when manifest file does not exist", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* removeFromPack(
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
