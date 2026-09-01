import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { LockedSkillMissing } from "@agentxm/workspace-state";
import { acquiredExtensionDisplayPathFromLockEntry } from "@agentxm/workspace-state";
import type { SkillLockEntry } from "@agentxm/workspace-state";
import { TestRenderer } from "../../cli-renderer/index.js";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import {
  configuredRow,
  makeBaseWorkspaceMock,
  makeRegistrySkillLockEntry,
  rowsFor,
  TEST_CONTENT_IDENTITY,
  TEST_TREE_INTEGRITY,
} from "@agentxm/workspace-state/testing";
import { sanitizeName } from "@agentxm/workspace-state";
import type { EnableSkillOperation } from "./enable.js";
import { enableSkill } from "./enable.js";
import { computeMaterializedTreeIntegritySync, extensionName, handle } from "../../test-helpers.js";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import { computePackageContentHash } from "@agentxm/workspace-state";
import { type SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";

type SettingsSkillValue =
  | string
  | {
      readonly source?: string | undefined;
      readonly enabled?: boolean | undefined;
    };

const getConfiguredSkillSource = (value: SettingsSkillValue): string =>
  typeof value === "string" ? value : (value.source ?? "");

const isConfiguredSkillEnabled = (value: SettingsSkillValue): boolean =>
  typeof value === "string" ? true : (value.enabled ?? true);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for enable tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    lockfileSkills?: Record<string, SkillLockEntry>;
    settingsSkills?: Record<string, SettingsSkillValue>;
    updateSkillEntryFn?: WorkspaceMutationsService["updateSkillEntry"];
    setSkillLockFn?: WorkspaceMutationsService["setSkillLock"];
  } = {},
): WorkspaceMutationsService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const lockfileSkills: Record<string, SkillLockEntry> = opts.lockfileSkills ?? {};
  const settingsSkills: Record<string, SettingsSkillValue> = opts.settingsSkills ?? {};
  return makeBaseWorkspaceMock(axmDir, {
    rows: rowsFor({
      skill: Object.entries(settingsSkills).map(([name, value]) =>
        configuredRow({
          type: "skill",
          name,
          source: getConfiguredSkillSource(value),
          enabled: isConfiguredSkillEnabled(value),
        }),
      ),
    }),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) => Effect.succeed(Option.fromUndefinedOr(lockfileSkills[name])),
    getSkillDir: (name: string) => {
      const base = path.dirname(axmDir);
      const sanitized = sanitizeName(name);
      const lockEntry = lockfileSkills[name];
      if (lockEntry === undefined) {
        return Effect.fail(new LockedSkillMissing({ name }));
      }
      const canonicalPath = path.join(
        base,
        acquiredExtensionDisplayPathFromLockEntry(
          "agent_extensions",
          lockEntry,
          "skills",
          sanitized,
        ),
      );
      return Effect.succeed({
        canonicalPath,
        skillSrcPath:
          lockEntry.packageFormat === "agent-skill"
            ? canonicalPath
            : path.join(canonicalPath, "src"),
      });
    },
    updateSkillEntry: opts.updateSkillEntryFn ?? ((_name, _updater) => Effect.void),
    setSkillLock: opts.setSkillLockFn ?? ((_args) => Effect.void),
  });
};

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  const { layer: outputLayer } = TestRenderer.make();
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs), outputLayer);
};

/** Creates a minimal EnableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): EnableSkillOperation => ({
  name: "enable-skill",
  args: { skillName },
});

/** Creates a local source accepted-resolution entry for the in-memory mock. */
const makeLocalLockEntry = (
  packageRoot?: string,
  sourcePath = "tmp/source",
  contentIdentity: SourceHash = TEST_CONTENT_IDENTITY,
): SkillLockEntry => ({
  type: "local" as const,
  sourceType: "local",
  sourceName: "local",
  extensionType: "skill",
  workspaceName: extensionName("my-skill"),
  packageFormat: "agentxm",
  packageOwner: handle("@community"),
  packageName: extensionName("my-skill"),
  path: decodeRelativePathSync(sourcePath),
  contentIdentity,
  treeIntegrity:
    packageRoot === undefined
      ? TEST_TREE_INTEGRITY
      : computeMaterializedTreeIntegritySync(packageRoot),
});

/** Creates a registry source lock entry for the in-memory mock (DateTime.Utc values). */
const makeRegistryLockEntry = (packageRoot: string): SkillLockEntry => ({
  ...makeRegistrySkillLockEntry({
    owner: handle("@community"),
    name: "my-skill",
    sourceName: "agentxm",
    publisherBindingId: "hbnd_test",
  }),
  treeIntegrity: computeMaterializedTreeIntegritySync(packageRoot),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

layer(NodeServices.layer, { excludeTestServices: true })("enableSkill", (it) => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enable-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with .axm dir and canonical skill files already present. */
  const setupWorkspace = (
    opts: {
      skillName?: string;
      agents?: string[];
    } = {},
  ) => {
    const skillName = opts.skillName ?? "my-skill";
    const agents = opts.agents ?? ["claude-code"];
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    const canonicalDir = path.join(base, "agent_extensions", "local", "tmp", "source");
    fs.mkdirSync(path.join(canonicalDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, "skill.json"),
      JSON.stringify({ owner: "@community", type: "skill", name: skillName, version: "1.0.0" }),
    );
    fs.writeFileSync(path.join(canonicalDir, "src", "SKILL.md"), `# ${skillName}`);
    fs.writeFileSync(path.join(canonicalDir, "src", "prompt.md"), "prompt content");

    return { base, axmDir, canonicalDir, skillName, agents };
  };

  describe("happy path", () => {
    it.effect("creates agent symlinks from existing canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalDir } = setupWorkspace();
        const contentIdentity = yield* computePackageContentHash(canonicalDir);
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(canonicalDir, "tmp/source", contentIdentity),
              },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical location should still have files
        expect(fs.existsSync(path.join(canonicalDir, "src", "SKILL.md"))).toBe(true);

        // Agent symlink should exist
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);
      }),
    );

    it.effect("handles multiple agents concurrently", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalDir } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });
        const contentIdentity = yield* computePackageContentHash(canonicalDir);
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(canonicalDir, "tmp/source", contentIdentity),
              },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Both agent symlinks should exist
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);
      }),
    );

    it.effect("leaves the shared lock entry unchanged", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalDir } = setupWorkspace();
        const contentIdentity = yield* computePackageContentHash(canonicalDir);
        const setSkillLockFn = vi.fn<WorkspaceMutationsService["setSkillLock"]>(() => Effect.void);

        yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(canonicalDir, "tmp/source", contentIdentity),
              },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
              setSkillLockFn,
            }),
          ),
        );

        expect(setSkillLockFn).not.toHaveBeenCalled();
      }),
    );

    it.effect("calls updateSkillEntry to set enabled: true", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalDir } = setupWorkspace();
        const contentIdentity = yield* computePackageContentHash(canonicalDir);
        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);

        yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {
                "my-skill": makeLocalLockEntry(canonicalDir, "tmp/source", contentIdentity),
              },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
              updateSkillEntryFn,
            }),
          ),
        );

        expect(updateSkillEntryFn).toHaveBeenCalledOnce();
        expect(updateSkillEntryFn).toHaveBeenCalledWith("my-skill", expect.any(Function));
      }),
    );
  });

  describe("missing canonical directory", () => {
    it.effect("fails when canonical directory does not exist", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // Do NOT create canonical directory

        const updateSkillEntryFn = vi.fn(() => Effect.void);
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry() },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
              updateSkillEntryFn,
            }),
          ),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not usable");
        // State should NOT have been updated
        expect(updateSkillEntryFn).not.toHaveBeenCalled();
      }),
    );
  });

  describe("registry source", () => {
    it.effect("uses registry canonical path for registry lock entries", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");

        // Create registry-style canonical directory with src subdirectory
        const registryCanonical = path.join(
          base,
          "agent_extensions",
          "agentxm",
          "@community",
          "skills",
          "my-skill",
        );
        const registrySrcDir = path.join(registryCanonical, "src");
        fs.mkdirSync(registrySrcDir, { recursive: true });
        fs.writeFileSync(
          path.join(registryCanonical, "skill.json"),
          JSON.stringify({
            owner: "@community",
            type: "skill",
            name: "my-skill",
            version: "1.0.0",
          }),
        );
        fs.writeFileSync(path.join(registrySrcDir, "SKILL.md"), "# my-skill");
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeRegistryLockEntry(registryCanonical) },
              settingsSkills: {
                "my-skill": {
                  source: "@community/skills/my-skill",
                  enabled: false,
                },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Agent symlink should point to registry src path
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
      }),
    );
  });

  describe("settings-only enable (no lock entry)", () => {
    it.effect("fails without desired canonical content", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);
        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
              updateSkillEntryFn,
            }),
          ),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        expect(updateSkillEntryFn).not.toHaveBeenCalled();
        // No agent symlinks should have been created (no canonical dir)
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when canonical directory is missing (lock entry present)", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        // Do NOT create canonical directory

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry() },
              settingsSkills: {
                "my-skill": { source: "./tmp/source", enabled: false },
              },
            }),
          ),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not usable");
      }),
    );
  });
});
