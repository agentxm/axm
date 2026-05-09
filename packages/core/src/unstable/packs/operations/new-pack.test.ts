import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { TestRenderer } from "../../cli-renderer/index.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { handle } from "../../test-helpers.js";
import type { NewPackOperation } from "./new-pack.js";
import { newPack } from "./new-pack.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for new-pack tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredProfile?: string;
    setPackFn?: WorkspaceMutationsService["setPack"];
  } = {},
): WorkspaceMutationsService => {
  const configuredProfile = opts.configuredProfile ?? "@myorg";

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredOwner: () => Effect.succeed(Option.some(handle(configuredProfile))),
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    setPack: opts.setPackFn ?? (() => Effect.void),
  });
};

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  const { layer: outputLayer } = TestRenderer.make();
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs), outputLayer);
};

/** Creates a minimal NewPackOperation for testing. */
const makeOp = (overrides: Partial<NewPackOperation["args"]> = {}): NewPackOperation => ({
  name: "new-pack",
  args: {
    name: overrides.name ?? "my-pack",
    owner: overrides.owner ?? handle("@myorg"),
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("newPack", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "new-pack-")));
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
    it.effect("creates pack directory with manifest", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newPack(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Verify pack directory and manifest were created
        const packDir = path.join(base, ".axm", "extensions", "@myorg", "packs", "my-pack");
        expect(fs.existsSync(packDir)).toBe(true);
        expect(fs.existsSync(path.join(packDir, "pack.json"))).toBe(true);
      }),
    );

    it.effect("writes correct manifest identity fields and empty extension maps", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newPack(makeOp()).pipe(Effect.provide(withServices(axmDir)));

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
        expect(manifest.$schema).toBe("https://axm.sh/schemas/pack.schema.json");
        expect(manifest.owner).toBe("@myorg");
        expect(manifest.type).toBe("pack");
        expect(manifest.name).toBe("my-pack");
        expect(manifest.version).toBe("0.0.1");
        expect(manifest.skills).toEqual({});
        expect(manifest.commands).toEqual({});
        expect(manifest["mcp-servers"]).toEqual({});
      }),
    );

    it.effect("registers pack in settings via setPack", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();
        const setPackFn = vi.fn<WorkspaceMutationsService["setPack"]>((_args) => Effect.void);

        const result = yield* newPack(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { setPackFn })),
        );

        expect(result.result).toBe("success");
        expect(setPackFn).toHaveBeenCalledOnce();
        expect(setPackFn).toHaveBeenCalledWith(
          expect.objectContaining({
            owner: "@myorg",
            name: "my-pack",
          }),
        );
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when pack manifest already exists", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        // Pre-create the pack manifest
        const packDir = path.join(base, ".axm", "extensions", "@myorg", "packs", "my-pack");
        fs.mkdirSync(packDir, { recursive: true });
        fs.writeFileSync(
          path.join(packDir, "pack.json"),
          JSON.stringify({ owner: "@myorg", type: "pack", name: "my-pack", version: "0.0.1" }),
        );

        const result = yield* newPack(makeOp()).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.message })),
        );

        expect(result.result).toBe("error");
      }),
    );
  });
});
