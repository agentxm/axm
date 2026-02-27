import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { ClackLogTestLayer } from "../../../clack-effect/log/ClackLogTest.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
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
    configuredNamespace?: string;
  } = {},
): WorkspaceContextService => {
  const configuredNamespace = opts.configuredNamespace ?? "@myorg";

  return {
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir: path.dirname(axmDir),
    nonInteractive: true,
    preview: false,
    resolvePlan: () =>
      Effect.succeed({ _tag: "ExecutedPlan", name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredNamespace: () => Effect.succeed(configuredNamespace),
    getDefaultNamespace: () => Effect.succeed(Option.none()),
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
    getConfiguredPacks: () =>
      Effect.succeed({
        "my-pack": {
          source: "@myorg/packs/my-pack",
          packagingKind: "non-native" as const,
          isBuiltIn: false,
        },
      }),
    getInstalledPacks: () => Effect.succeed({}),
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
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
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs), ClackLogTestLayer);
};

/** Creates a pack manifest with some skills on disk and returns its content hash. */
const createPackManifestWithSkills = (
  base: string,
  namespace: string,
  packName: string,
  skills: Record<string, string> = {},
) => {
  const packDir = path.join(base, ".axm", "extensions", namespace, "packs", packName);
  fs.mkdirSync(packDir, { recursive: true });
  const manifest = {
    namespace,
    type: "pack",
    name: packName,
    version: "0.0.1",
    skills,
    commands: {},
    "mcp-servers": {},
  };
  const content = JSON.stringify(manifest, null, 2) + "\n";
  fs.writeFileSync(path.join(packDir, "axm-pack.json"), content);
  return { packDir, manifestHash: hashContent(content), content };
};

/** Creates a minimal RemoveFromPackOperation for testing. */
const makeOp = (
  overrides: Partial<RemoveFromPackOperation["args"]> & { manifestHash: string },
): RemoveFromPackOperation => ({
  name: "remove-from-pack",
  args: {
    packName: overrides.packName ?? "my-pack",
    packNamespace: overrides.packNamespace ?? "@myorg",
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
    it.effect("removes extensions from pack manifest", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifestWithSkills(base, "@myorg", "my-pack", {
          "@acme/skills/my-skill": "^1.0.0",
          "@acme/skills/other-skill": "^2.0.0",
        });

        const result = yield* removeFromPack(
          makeOp({
            removals: ["@acme/skills/my-skill"],
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
          "axm-pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.skills["@acme/skills/my-skill"]).toBeUndefined();
        expect(manifest.skills["@acme/skills/other-skill"]).toBe("^2.0.0");
      }),
    );

    it.effect("removes multiple extensions at once", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifestWithSkills(base, "@myorg", "my-pack", {
          "@acme/skills/skill-a": "^1.0.0",
          "@acme/skills/skill-b": "^2.0.0",
          "@acme/skills/skill-c": "^3.0.0",
        });

        const result = yield* removeFromPack(
          makeOp({
            removals: ["@acme/skills/skill-a", "@acme/skills/skill-c"],
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
          "axm-pack.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.skills["@acme/skills/skill-a"]).toBeUndefined();
        expect(manifest.skills["@acme/skills/skill-b"]).toBe("^2.0.0");
        expect(manifest.skills["@acme/skills/skill-c"]).toBeUndefined();
      }),
    );

    it.effect("returns no-op when removals list is empty", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { manifestHash } = createPackManifestWithSkills(base, "@myorg", "my-pack", {
          "@acme/skills/my-skill": "^1.0.0",
        });

        const result = yield* removeFromPack(makeOp({ removals: [], manifestHash })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.result).toBe("no-op");
      }),
    );
  });

  describe("stale manifest conflict", () => {
    it.effect("fails when manifest changed since plan time", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        createPackManifestWithSkills(base, "@myorg", "my-pack", {
          "@acme/skills/my-skill": "^1.0.0",
        });

        const result = yield* removeFromPack(
          makeOp({
            removals: ["@acme/skills/my-skill"],
            manifestHash: "stale-hash-that-does-not-match",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("stale");
      }),
    );

    it.effect("does not write partial manifest on stale conflict", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { content } = createPackManifestWithSkills(base, "@myorg", "my-pack", {
          "@acme/skills/my-skill": "^1.0.0",
        });

        yield* removeFromPack(
          makeOp({
            removals: ["@acme/skills/my-skill"],
            manifestHash: "stale-hash-that-does-not-match",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catchAll(() => Effect.void),
        );

        // Manifest should be unchanged
        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "packs",
          "my-pack",
          "axm-pack.json",
        );
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
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
      }),
    );
  });
});
