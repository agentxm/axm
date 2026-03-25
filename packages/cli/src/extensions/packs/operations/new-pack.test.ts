import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { makeOutputTestLayer } from "@axm.sh/core/unstable/output";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
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
    setPackFn?: ReturnType<typeof vi.fn>;
  } = {},
): WorkspaceContextService => {
  const configuredProfile = opts.configuredProfile ?? "@myorg";

  return {
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir: path.dirname(axmDir),
    resolvePlan: () =>
      Effect.succeed({ _tag: "ExecutedPlan", name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredProfile: () => Effect.succeed(configuredProfile),
    getDefaultProfile: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    getLockedSkills: () => Effect.succeed({}),
    getLockedSkill: () => Effect.succeed(Option.none()),
    getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: () => Effect.void,
    renameSkill: () => Effect.void,
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: opts.setPackFn ?? (() => Effect.void),
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: "" }),
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeCommandSettings: () => Effect.void,
    removeCommandLock: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
  };
};

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  const [outputLayer] = makeOutputTestLayer();
  return Layer.mergeAll(NodeServices.layer, Workspace.layer(mockWs), outputLayer);
};

/** Creates a minimal NewPackOperation for testing. */
const makeOp = (overrides: Partial<NewPackOperation["args"]> = {}): NewPackOperation => ({
  name: "new-pack",
  args: {
    name: overrides.name ?? "my-pack",
    profile: overrides.profile ?? "@myorg",
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
        expect(fs.existsSync(path.join(packDir, "axm-pack.json"))).toBe(true);
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
          "axm-pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.profile).toBe("@myorg");
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
        const setPackFn = vi.fn((_args: unknown) => Effect.void);

        const result = yield* newPack(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { setPackFn })),
        );

        expect(result.result).toBe("success");
        expect(setPackFn).toHaveBeenCalledOnce();
        expect(setPackFn).toHaveBeenCalledWith(
          expect.objectContaining({
            profile: "@myorg",
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
          path.join(packDir, "axm-pack.json"),
          JSON.stringify({ profile: "@myorg", type: "pack", name: "my-pack", version: "0.0.1" }),
        );

        const result = yield* newPack(makeOp()).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
      }),
    );
  });
});
