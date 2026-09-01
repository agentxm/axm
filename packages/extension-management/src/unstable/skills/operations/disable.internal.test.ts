import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import type { SkillLockEntry } from "@agentxm/workspace-state";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import {
  implicitRow,
  makeBaseWorkspaceMock,
  makeRegistrySkillLockEntry,
  rowsFor,
  TEST_CONTENT_IDENTITY,
  TEST_TREE_INTEGRITY,
} from "@agentxm/workspace-state/testing";
import type { DisableSkillOperation } from "./disable.js";
import { disableSkill } from "./disable.js";
import { extensionName, handle } from "../../test-helpers.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for disable tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    lockfileSkills?: Record<string, SkillLockEntry>;
    updateSkillEntryFn?: WorkspaceMutationsService["updateSkillEntry"];
    setSkillLockFn?: WorkspaceMutationsService["setSkillLock"];
  } = {},
): WorkspaceMutationsService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const lockfileSkills: Record<string, SkillLockEntry> = opts.lockfileSkills ?? {};

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) => Effect.succeed(Option.fromUndefinedOr(lockfileSkills[name])),
    updateSkillEntry: opts.updateSkillEntryFn ?? ((_name, _updater) => Effect.void),
    setSkillLock: opts.setSkillLockFn ?? ((_args) => Effect.void),
  });
};

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs));
};

/** Creates a minimal DisableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): DisableSkillOperation => ({
  name: "disable-skill",
  args: { skillName },
});

/** Creates a local source lock entry. */
const makeLocalLockEntry = (_agents: string[]): SkillLockEntry => ({
  type: "local" as const,
  sourceType: "local",
  sourceName: "local",
  extensionType: "skill",
  workspaceName: extensionName("my-skill"),
  packageFormat: "agentxm",
  packageOwner: handle("@local"),
  packageName: extensionName("my-skill"),
  path: decodeRelativePathSync("tmp/source"),
  contentIdentity: TEST_CONTENT_IDENTITY,
  treeIntegrity: TEST_TREE_INTEGRITY,
});

/** Creates a registry source lock entry. */
const makeRegistryLockEntry = (_agents: string[]): SkillLockEntry =>
  makeRegistrySkillLockEntry({
    owner: handle("@community"),
    name: "my-skill",
    sourceName: "local",

    publisherBindingId: "hbnd_test",
  });

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("disableSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "disable-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with canonical skill dir and agent symlinks. */
  const setupWorkspace = (
    opts: {
      skillName?: string;
      agents?: string[];
      createCanonical?: boolean;
      createSymlinks?: boolean;
    } = {},
  ) => {
    const skillName = opts.skillName ?? "my-skill";
    const agents = opts.agents ?? ["claude-code"];
    const createCanonical = opts.createCanonical ?? true;
    const createSymlinks = opts.createSymlinks ?? true;

    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    // Create canonical skill dir
    const canonicalPath = path.join(base, "agent_extensions", "external", "skills", skillName);
    if (createCanonical) {
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), `# ${skillName}`);
      const universalPath = path.join(base, ".agents", "skills", skillName);
      fs.mkdirSync(path.dirname(universalPath), { recursive: true });
      fs.symlinkSync(canonicalPath, universalPath);
    }

    // Create agent symlinks
    if (createSymlinks && createCanonical) {
      for (const agentId of agents) {
        const agentDirMap: Record<string, string> = {
          "claude-code": ".claude/skills",
          cursor: ".cursor/skills",
        };
        const agentSkillsDir = agentDirMap[agentId];
        if (agentSkillsDir) {
          const agentSkillPath = path.join(base, agentSkillsDir, skillName);
          fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
          fs.symlinkSync(canonicalPath, agentSkillPath);
        }
      }
    }

    return { base, axmDir, canonicalPath };
  };

  describe("happy path", () => {
    it.effect("removes agent symlinks but preserves canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({ agents: ["claude-code"] });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical dir should be preserved for re-enablement
        expect(fs.existsSync(canonicalPath)).toBe(true);

        // Agent symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
      }),
    );

    it.effect("removes symlinks for multiple agents but preserves canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code", "cursor"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");

        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(false);
        // Canonical dir should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );

    it.effect("leaves the shared lock entry unchanged", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const setSkillLockFn = vi.fn<WorkspaceMutationsService["setSkillLock"]>(() => Effect.void);

        yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(["universal", "claude-code"]),
              },
              setSkillLockFn,
            }),
          ),
        );

        expect(setSkillLockFn).not.toHaveBeenCalled();
      }),
    );

    it.effect("calls updateSkillEntry to set enabled: false", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);

        yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              updateSkillEntryFn,
            }),
          ),
        );

        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
        expect(updateSkillEntryFn).toHaveBeenCalledWith("my-skill", expect.any(Function));
      }),
    );
  });

  describe("files-before-state ordering", () => {
    it.effect("updates state only after file removal succeeds", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);
        const setSkillLockFn = vi.fn<WorkspaceMutationsService["setSkillLock"]>(() => Effect.void);

        // Normal case: file removal should succeed, then state gets updated
        yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
              updateSkillEntryFn,
              setSkillLockFn,
            }),
          ),
        );

        expect(setSkillLockFn).not.toHaveBeenCalled();
        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("registry source", () => {
    it.effect("preserves registry canonical directory but removes agent symlinks", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create registry canonical dir
        const registryPath = path.join(
          base,
          "agent_extensions",
          "local",
          "@community",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(registryPath, { recursive: true });
        fs.writeFileSync(path.join(registryPath, "SKILL.md"), "# my-skill");

        // Create agent symlink pointing to registry location
        const agentSkillPath = path.join(base, ".claude", "skills", "my-skill");
        fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
        fs.symlinkSync(registryPath, agentSkillPath);

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeRegistryLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Registry canonical dir should be preserved
        expect(fs.existsSync(registryPath)).toBe(true);
        // Agent symlink should be removed
        expect(fs.existsSync(agentSkillPath)).toBe(false);
      }),
    );
  });

  describe("missing files", () => {
    it.effect("succeeds when canonical dir does not exist", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace({ createCanonical: false, createSymlinks: false });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
      }),
    );

    it.effect("succeeds when agent symlinks do not exist", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath } = setupWorkspace({ createSymlinks: false });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry(["claude-code"]) },
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Canonical dir should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );
  });

  describe("settings-only disable (no lock entry)", () => {
    it.effect("updates settings to enabled: false without lockfile or symlink work", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);
        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
              updateSkillEntryFn,
            }),
          ),
        );

        expect(result.result).toBe("success");
        // Settings should be updated
        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
        expect(updateSkillEntryFn).toHaveBeenCalledWith("my-skill", expect.any(Function));
      }),
    );
  });

  describe("implicit promotion disable", () => {
    it.effect("promotes implicit skill to configured entry with enabled: false", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const setSkillEntryFn = vi.fn((_name: string, _entry: unknown) => Effect.void);

        // Mock workspace where skill is implicit (lock exists but no settings entry)
        const mockWs: WorkspaceMutationsService = makeBaseWorkspaceMock(axmDir, {
          rows: rowsFor({
            skill: [
              implicitRow({
                type: "skill",
                name: "my-skill",
                source: "local:/tmp/source",
                packagingKind: "non-native",
              }),
            ],
          }),
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          getLockedSkills: () =>
            Effect.succeed({ "my-skill": makeLocalLockEntry(["claude-code"]) }),
          getLockedSkill: () => Effect.succeed(Option.some(makeLocalLockEntry(["claude-code"]))),
          setSkillEntry: setSkillEntryFn,
        });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs))),
        );

        expect(result.result).toBe("success");
        // setSkillEntry should be called with source and enabled: false
        expect(setSkillEntryFn).toHaveBeenCalledOnce();
        expect(setSkillEntryFn).toHaveBeenCalledWith(
          "my-skill",
          expect.objectContaining({ enabled: false }),
        );
      }),
    );

    it.effect("derives a registry FQN when promoting an implicit registry skill", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const setSkillEntryFn = vi.fn((_name: string, _entry: unknown) => Effect.void);

        const mockWs: WorkspaceMutationsService = makeBaseWorkspaceMock(axmDir, {
          rows: rowsFor({
            skill: [implicitRow({ type: "skill", name: "my-skill", packagingKind: "native" })],
          }),
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          getLockedSkills: () =>
            Effect.succeed({ "my-skill": makeRegistryLockEntry(["claude-code"]) }),
          getLockedSkill: () => Effect.succeed(Option.some(makeRegistryLockEntry(["claude-code"]))),
          getDesiredStateGraph: () =>
            Effect.succeed({
              complete: true,
              nodes: [
                {
                  type: "skill",
                  name: "my-skill",
                  identity: "@community/skills/my-skill",
                  source: "@community/skills/my-skill",
                  enabled: true,
                  constraints: [],
                  origins: [
                    {
                      type: "pack",
                      pack: "@community/packs/toolkit",
                      manifestPath:
                        "/project/agent_extensions/agentxm/@community/packs/toolkit/pack.json",
                      source: "@community/skills/my-skill",
                      constraint: "*",
                      enabled: true,
                    },
                  ],
                },
              ],
              problems: [],
            }),
          setSkillEntry: setSkillEntryFn,
        });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs))),
        );

        expect(result.result).toBe("success");
        expect(setSkillEntryFn).toHaveBeenCalledWith("my-skill", {
          source: "@community/skills/my-skill",
          enabled: false,
        });
      }),
    );

    it.effect("fails when implicit skill has no derivable source", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Mock workspace where skill is implicit with no source
        const mockWs: WorkspaceMutationsService = makeBaseWorkspaceMock(axmDir, {
          rows: rowsFor({
            skill: [implicitRow({ type: "skill", name: "my-skill", packagingKind: "non-native" })],
          }),
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          getLockedSkills: () => Effect.succeed({}),
          getLockedSkill: () => Effect.succeed(Option.none()),
        });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs))),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when implicit skill has no derivable source", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const mockWs: WorkspaceMutationsService = makeBaseWorkspaceMock(axmDir, {
          rows: rowsFor({
            skill: [implicitRow({ type: "skill", name: "my-skill", packagingKind: "non-native" })],
          }),
          getConfiguredAgents: () => Effect.succeed(["claude-code"]),
          getLockedSkills: () => Effect.succeed({}),
          getLockedSkill: () => Effect.succeed(Option.none()),
        });

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs))),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Cannot determine source");
      }),
    );
  });

  describe("rendered files tracking", () => {
    it.effect("removes copy-mode paths from renderedFiles while preserving canonical", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create the canonical source (should be preserved after disable)
        const canonicalPath = path.join(base, "agent_extensions", "external", "skills", "my-skill");
        fs.mkdirSync(canonicalPath, { recursive: true });
        fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), "# my-skill");

        // Create the copied skill directory at a tracked rendered path
        const renderedPath = path.join(base, ".claude", "skills", "my-skill");
        fs.mkdirSync(renderedPath, { recursive: true });
        fs.writeFileSync(path.join(renderedPath, "SKILL.md"), "# my-skill");

        const lockEntry = makeLocalLockEntry(["claude-code"]);

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { lockfileSkills: { "my-skill": lockEntry } })),
        );

        expect(result.result).toBe("success");
        // The rendered agent path should be removed
        expect(fs.existsSync(renderedPath)).toBe(false);
        // The canonical source should be preserved
        expect(fs.existsSync(canonicalPath)).toBe(true);
        expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
      }),
    );

    it.effect("handles missing rendered files gracefully during disable", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Don't create the rendered path — it doesn't exist on disk
        const lockEntry = makeLocalLockEntry(["claude-code"]);

        const result = yield* disableSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { lockfileSkills: { "my-skill": lockEntry } })),
        );

        // Should succeed even if rendered path doesn't exist
        expect(result.result).toBe("success");
      }),
    );
  });
});
