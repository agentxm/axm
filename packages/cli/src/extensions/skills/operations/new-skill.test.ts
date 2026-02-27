import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { makeClackLogTestLayer } from "../../../clack-effect/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { NewSkillOperation } from "./new-skill.js";
import { newSkill } from "./new-skill.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for new-skill tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    configuredNamespace?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    configuredSkills?: Record<string, any>;
    setSkillEntryFn?: ReturnType<typeof vi.fn>;
  } = {},
): WorkspaceContextService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const configuredNamespace = opts.configuredNamespace ?? "@myorg";
  const configuredSkills = opts.configuredSkills ?? {};

  return {
    ...taxonomyStubs,
    global: false,
    path: axmDir,
    baseDir: path.dirname(axmDir),
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredNamespace: () => Effect.succeed(configuredNamespace),
    getDefaultNamespace: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(configuredSkills).map(([k, v]) => [
            k,
            {
              source: typeof v === "string" ? v : (v?.source ?? ""),
              enabled: typeof v === "string" ? true : (v?.enabled ?? true),
              packagingKind: "non-native" as const,
              isBuiltIn: false,
            },
          ]),
        ),
      ),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed({}),
    getLockedSkill: () => Effect.succeed(Option.none()),
    getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: opts.setSkillEntryFn ?? (() => Effect.void),
    renameSkill: () => Effect.void,
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getConfiguredPacks: () => Effect.succeed({}),
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
  const [logLayer] = makeClackLogTestLayer();
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs), logLayer);
};

/** Creates a minimal NewSkillOperation for testing. */
const makeOp = (overrides: Partial<NewSkillOperation["args"]> = {}): NewSkillOperation => ({
  name: "new-skill",
  args: {
    name: overrides.name ?? "my-skill",
    namespace: overrides.namespace ?? "@myorg",
    agents: overrides.agents ?? ["claude-code"],
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("newSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "new-skill-")));
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
    it.effect("creates skill directory with manifest and SKILL.md", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newSkill(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Verify skill directory was created under registry path
        const skillDir = path.join(base, ".axm", "extensions", "@myorg", "skills", "my-skill");
        expect(fs.existsSync(path.join(skillDir, "src", "SKILL.md"))).toBe(true);
      }),
    );

    it.effect("creates agent symlinks for configured agents", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newSkill(makeOp({ agents: ["claude-code", "cursor"] })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: ["claude-code", "cursor"] })),
        );

        expect(result.result).toBe("success");

        // Agent symlinks should exist
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);
      }),
    );

    it.effect("registers skill in settings via setSkillEntry", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();
        const setSkillEntryFn = vi.fn((_name: string, _entry: unknown) => Effect.void);

        const result = yield* newSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { setSkillEntryFn })),
        );

        expect(result.result).toBe("success");
        expect(setSkillEntryFn).toHaveBeenCalledOnce();
        expect(setSkillEntryFn).toHaveBeenCalledWith(
          "my-skill",
          expect.objectContaining({
            source: "@myorg/skills/my-skill",
            enabled: true,
          }),
        );
      }),
    );

    it.effect("writes correct manifest identity fields and version", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();

        const result = yield* newSkill(makeOp()).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Check manifest content
        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "skills",
          "my-skill",
          "axm-skill.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.namespace).toBe("@myorg");
        expect(manifest.type).toBe("skill");
        expect(manifest.name).toBe("my-skill");
        expect(manifest.version).toBe("0.0.1");
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when skill directory already exists", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* newSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredSkills: { "my-skill": "@myorg/skills/my-skill" },
            }),
          ),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        // Should fail because skill already exists in settings
        expect(result.result).toBe("error");
      }),
    );
  });
});
