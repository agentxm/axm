import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import type { PackLockEntry, SkillLockEntry } from "../../lockfile/index.js";
import { AppError, makeAppError } from "../../app-error/index.js";
import { sanitizeName } from "../../extensions/utils.js";
import {
  WorkspaceMutations,
  type SetSkillArgs,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import {
  makeBaseWorkspaceMock,
  makeRegistryPackLockEntry,
  makeRegistrySkillLockEntry,
  TEST_CONTENT_IDENTITY,
} from "../../workspace/test-stubs.js";
import { decodeRelativePathSync } from "../../utils/path-types.js";
import { exactVersion, handle } from "../../test-helpers.js";
import type { UninstallSkillOperation } from "./uninstall.js";
import { uninstallSkill } from "./uninstall.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const configuredAgentsByWorkspace = new Map<string, ReadonlyArray<string>>();

/** Creates a workspace mock backed by in-memory skills + on-disk YAML. */
const makeWorkspaceMock = (
  axmDir: string,
  lockfileSkills: Record<string, SkillLockEntry> = {},
  overrides?: {
    removeSkillFn?: (name: string) => Effect.Effect<void, AppError>;
    removeSkillFromSettingsFn?: (name: string) => Effect.Effect<void, AppError>;
    lockfileErrorOverride?: () => Effect.Effect<never, AppError>;
    setSkillErrorOverride?: () => Effect.Effect<never, AppError>;
    removeSkillErrorOverride?: () => Effect.Effect<never, AppError>;
    lockedPacks?: Record<string, PackLockEntry>;
    requiredByPack?: boolean;
  },
): WorkspaceMutationsService => {
  let skills: Record<string, SkillLockEntry> = { ...lockfileSkills };
  const lockfileErrorOverride = overrides?.lockfileErrorOverride;
  const setSkillErrorOverride = overrides?.setSkillErrorOverride;
  const removeSkillFn = overrides?.removeSkillFn;
  const removeSkillErrorOverride = overrides?.removeSkillErrorOverride;
  const removeSkillFromSettingsFn = overrides?.removeSkillFromSettingsFn;
  const lockedPacks: Record<string, PackLockEntry> = overrides?.lockedPacks ?? {};

  const writeToDisk = () => {
    const lockfile: { lockfileVersion: number; skills: Record<string, unknown> } = {
      lockfileVersion: 4,
      skills: {},
    };
    for (const [k, v] of Object.entries(skills)) {
      lockfile.skills[k] = v;
    }
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
  };

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredAgents: () =>
      Effect.succeed(configuredAgentsByWorkspace.get(axmDir) ?? ["claude-code"]),
    getLockedSkills: () =>
      lockfileErrorOverride !== undefined ? lockfileErrorOverride() : Effect.succeed(skills),
    getLockedSkill: (name: string) =>
      lockfileErrorOverride !== undefined
        ? lockfileErrorOverride()
        : Effect.succeed(Option.fromUndefinedOr(skills[name])),
    setSkill:
      setSkillErrorOverride !== undefined
        ? () => setSkillErrorOverride()
        : ({ name, lockEntry }: Pick<SetSkillArgs, "name" | "lockEntry">) =>
            Effect.sync(() => {
              skills = {
                ...skills,
                [name]: lockEntry,
              };
              writeToDisk();
            }),
    setSkillLock: ({ name, lockEntry }: Pick<SetSkillArgs, "name" | "lockEntry">) =>
      Effect.sync(() => {
        skills = {
          ...skills,
          [name]: lockEntry,
        };
        writeToDisk();
      }),
    removeSkill:
      removeSkillFn !== undefined
        ? (name: string) => removeSkillFn(name)
        : removeSkillErrorOverride !== undefined
          ? () => removeSkillErrorOverride()
          : (name: string) =>
              Effect.sync(() => {
                const { [name]: _, ...rest } = skills;
                void _;
                skills = rest;
                writeToDisk();
              }),
    removeSkillFromSettings:
      removeSkillFromSettingsFn !== undefined
        ? (name: string) => removeSkillFromSettingsFn(name)
        : (name: string) =>
            Effect.sync(() => {
              // Settings-only removal: keep skill in lockfile/disk
              void name;
            }),
    getLockedPacks: () => Effect.succeed(lockedPacks),
    ...(overrides?.requiredByPack === true
      ? {
          getDesiredStateGraph: () =>
            Effect.succeed({
              complete: true,
              problems: [],
              nodes: [
                {
                  type: "skill" as const,
                  name: "my-skill",
                  identity: "@acme/skills/my-skill",
                  source: "@acme/skills/my-skill@^1.0.0",
                  enabled: true,
                  constraints: ["^1.0.0"],
                  origins: [
                    {
                      type: "pack" as const,
                      pack: "@acme/packs/starter-pack",
                      source: "@acme/skills/my-skill",
                      constraint: "^1.0.0",
                      enabled: true,
                    },
                  ],
                },
              ],
            }),
        }
      : {}),
  });
};

/** Creates a layer providing FileSystem + Path + a minimal WorkspaceMutations. */
const withServices = (
  axmDir: string,
  lockfileSkills: Record<string, SkillLockEntry> = {},
  wsOverrides?: {
    removeSkillFn?: (name: string) => Effect.Effect<void, AppError>;
    removeSkillFromSettingsFn?: (name: string) => Effect.Effect<void, AppError>;
    lockfileErrorOverride?: () => Effect.Effect<never, AppError>;
    setSkillErrorOverride?: () => Effect.Effect<never, AppError>;
    removeSkillErrorOverride?: () => Effect.Effect<never, AppError>;
    lockedPacks?: Record<string, PackLockEntry>;
    requiredByPack?: boolean;
  },
) => {
  return Layer.mergeAll(
    NodeServices.layer,
    WorkspaceMutations.layer(makeWorkspaceMock(axmDir, lockfileSkills, wsOverrides)),
  );
};

/** Creates a minimal UninstallSkillOperation for testing. */
const makeOp = (
  overrides: { skillName?: string; agents?: ReadonlyArray<string> } = {},
): UninstallSkillOperation => ({
  name: "uninstall-skill",
  args: {
    skillName: overrides.skillName ?? "my-skill",
    agents: overrides.agents ?? [],
  },
});

/** Writes a lockfile YAML to disk. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper uses simplified mock data
const writeLockfileYaml = (axmDir: string, skills: Record<string, any>) => {
  const lockfile = { lockfileVersion: 4, skills };
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

/** Reads lockfile YAML from disk. */
const readLockfileYaml = (axmDir: string) => {
  const content = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
  return YAML.parse(content);
};

/** Creates a local source accepted-resolution entry for the in-memory mock. */
const makeLocalLockEntry = (_agents: string[]): SkillLockEntry => ({
  type: "local" as const,
  path: decodeRelativePathSync("tmp/source"),
  contentIdentity: TEST_CONTENT_IDENTITY,
});

/** Creates a local source lock entry for on-disk YAML (ISO strings). */
const makeLocalLockEntryYaml = (_agents: string[]) => ({
  type: "local",
  path: "tmp/source",
  contentIdentity: TEST_CONTENT_IDENTITY,
});

/** Creates a registry source lock entry for the in-memory mock (DateTime.Utc values). */
const makeRegistryLockEntry = (agents: string[]) =>
  makeRegistrySkillLockEntry({
    owner: handle("@community"),
    name: "my-skill",
    sourceName: "local",

    publisherBindingId: "hbnd_test",
    agents,
  });

/** Creates a registry source lock entry for on-disk YAML (ISO strings). */
const makeRegistryLockEntryYaml = (_agents: string[]) => ({
  type: "registry",
  owner: "@community",
  name: "my-skill",
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "local",

  publisherBindingId: "hbnd_test",
});

/** Creates a removeSkill spy function for use as a workspace mock override. */
const makeRemoveSkillSpy = () => {
  const removeSkillFn = vi.fn((_name: string) => Effect.void);
  return { removeSkillFn };
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("uninstallSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-skill-")));
    configuredAgentsByWorkspace.clear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with .axm dir, canonical skill dir, and agent symlinks. */
  const setupWorkspace = (
    opts: {
      skillName?: string;
      agents?: string[];
      createCanonical?: boolean;
      createSymlinks?: boolean;
      /** In-memory mock lockfile skills (DateTime.Utc values). Passed to withServices. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper uses simplified mock data
      lockfileSkills?: Record<string, any>;
      /** On-disk YAML lockfile skills (ISO strings). Written to axm-lock.yaml. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper uses simplified mock data
      lockfileSkillsYaml?: Record<string, any>;
    } = {},
  ) => {
    const skillName = opts.skillName ?? "my-skill";
    const agents = opts.agents ?? ["claude-code"];
    const createCanonical = opts.createCanonical ?? true;
    const createSymlinks = opts.createSymlinks ?? true;

    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    configuredAgentsByWorkspace.set(axmDir, agents);

    // Create canonical skill dir (unified: .axm/extensions/external/skills/<name>)
    const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", skillName);
    if (createCanonical) {
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), `# ${skillName}`);
    }

    // Create agent symlinks
    if (createSymlinks && createCanonical) {
      for (const agentId of agents) {
        // Map agent IDs to their skill dirs
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

    // In-memory mock (DateTime.Utc values) for withServices
    const lockfileSkills = opts.lockfileSkills ?? { [skillName]: makeLocalLockEntry(agents) };
    // On-disk YAML (ISO strings) for lockfile read/write operations
    const lockfileSkillsYaml = opts.lockfileSkillsYaml ?? {
      [skillName]: makeLocalLockEntryYaml(agents),
    };
    writeLockfileYaml(axmDir, lockfileSkillsYaml);

    return { base, axmDir, canonicalPath, lockfileSkills };
  };

  describe("full uninstall — skill in lockfile", () => {
    it.effect("removes agent symlinks, canonical dir, and lockfile entry", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath, lockfileSkills } = setupWorkspace({
          agents: ["claude-code"],
        });

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill");

        // Canonical dir should be removed
        expect(fs.existsSync(canonicalPath)).toBe(false);

        // Agent symlink should be removed
        const agentSkillPath = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillPath)).toBe(false);

        // Lockfile entry should be removed
        const lockfile = readLockfileYaml(axmDir);
        expect(lockfile.skills["my-skill"]).toBeUndefined();
      }),
    );

    it.effect("removes symlinks for multiple agents concurrently", () =>
      Effect.gen(function* () {
        const { axmDir, base, lockfileSkills } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");

        // Both agent symlinks should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(false);
      }),
    );

    it.effect("calls WorkspaceMutations.removeSkill after full uninstall", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileSkills } = setupWorkspace({ agents: ["claude-code"] });
        const { removeSkillFn } = makeRemoveSkillSpy();

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills, { removeSkillFn })),
        );

        expect(result.result).toBe("success");
        expect(removeSkillFn).toHaveBeenCalledOnce();
        expect(removeSkillFn).toHaveBeenCalledWith("my-skill");
      }),
    );

    it.effect("swallows WorkspaceMutations.removeSkill failure without failing uninstall", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileSkills } = setupWorkspace({ agents: ["claude-code"] });
        const removeSkillFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "internal",
              detail: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills, { removeSkillFn })),
        );

        expect(result.result).toBe("success");
      }),
    );
  });

  describe("skill not in lockfile but exists on disk", () => {
    it.effect("removes canonical dir and returns success", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath } = setupWorkspace({
          createSymlinks: false,
        });

        // Provide empty lockfile (skill not tracked)
        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, {})),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill");
        expect(fs.existsSync(canonicalPath)).toBe(false);
      }),
    );
  });

  describe("skill not installed anywhere", () => {
    it.effect("returns success when not in lockfile and no files on disk", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        writeLockfileYaml(axmDir, {});

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, {})),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("not installed");
      }),
    );
  });

  describe("partial uninstall with remaining agents", () => {
    it.effect("removes specified agent symlinks without rewriting the shared lock", () =>
      Effect.gen(function* () {
        const { axmDir, base, lockfileSkills } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });

        const result = yield* uninstallSkill(makeOp({ agents: ["claude-code"] })).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill from claude-code");

        // claude-code symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        // cursor symlink should still exist
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);

        // Canonical dir should still exist
        expect(
          fs.existsSync(path.join(base, ".axm", "extensions", "external", "skills", "my-skill")),
        ).toBe(true);

        // Partial materialization changes do not rewrite shared resolution state.
        const lockfile = readLockfileYaml(axmDir);
        expect(lockfile.skills["my-skill"]).toBeDefined();
        expect(lockfile.skills["my-skill"]).not.toHaveProperty("agents");
      }),
    );

    it.effect("does not call WorkspaceMutations.removeSkill for partial uninstall", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileSkills } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });
        const { removeSkillFn } = makeRemoveSkillSpy();

        const result = yield* uninstallSkill(makeOp({ agents: ["claude-code"] })).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills, { removeSkillFn })),
        );

        expect(result.result).toBe("success");
        expect(removeSkillFn).not.toHaveBeenCalled();
      }),
    );

    it.effect("preserves an artifact path shared with a remaining agent", () =>
      Effect.gen(function* () {
        const agents = ["universal", "codex", "claude-code"];
        const { axmDir, base, canonicalPath, lockfileSkills } = setupWorkspace({ agents });
        const sharedSkillPath = path.join(base, ".agents", "skills", "my-skill");
        fs.mkdirSync(path.dirname(sharedSkillPath), { recursive: true });
        fs.symlinkSync(canonicalPath, sharedSkillPath);

        const result = yield* uninstallSkill(makeOp({ agents: ["universal"] })).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(sharedSkillPath)).toBe(true);
        expect(fs.lstatSync(sharedSkillPath).isSymbolicLink()).toBe(true);

        const lockfile = readLockfileYaml(axmDir);
        expect(lockfile.skills["my-skill"]).not.toHaveProperty("agents");
      }),
    );
  });

  describe("partial uninstall of every configured agent", () => {
    it.effect("preserves shared resolution state and canonical source", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath, lockfileSkills } = setupWorkspace({
          agents: ["claude-code"],
        });

        // Partial uninstall targeting the only agent
        const result = yield* uninstallSkill(makeOp({ agents: ["claude-code"] })).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill from claude-code");

        expect(fs.existsSync(canonicalPath)).toBe(true);

        // Agent symlink removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        // Shared resolution state is removed only by a full uninstall.
        const lockfile = readLockfileYaml(axmDir);
        expect(lockfile.skills["my-skill"]).toBeDefined();
      }),
    );
  });

  describe("missing canonical dir", () => {
    it.effect("removes a stale accepted resolution when canonical content is absent", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const lockfileSkills: Record<string, ReturnType<typeof makeLocalLockEntry>> = {
          "my-skill": makeLocalLockEntry(["claude-code"]),
        };
        writeLockfileYaml(axmDir, { "my-skill": makeLocalLockEntryYaml(["claude-code"]) });

        // No canonical dir, but lockfile has entry
        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("not installed");

        // Historical receipt data is not mutation authority.
        const lockfile = readLockfileYaml(axmDir);
        expect(lockfile.skills["my-skill"]).toBeDefined();
      }),
    );
  });

  describe("missing symlinks", () => {
    it.effect("skips without error when agent symlinks do not exist", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath, lockfileSkills } = setupWorkspace({
          createSymlinks: false,
        });

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill");
        expect(fs.existsSync(canonicalPath)).toBe(false);
      }),
    );
  });

  describe("sanitized name usage", () => {
    it.effect("uses sanitizeName for filesystem paths", () =>
      Effect.gen(function* () {
        const displayName = "My Awesome Skill!!";
        const sanitizedName = sanitizeName(displayName);
        const { axmDir, base } = setupWorkspace({
          skillName: sanitizedName,
          agents: ["claude-code"],
          lockfileSkills: {
            [displayName]: makeLocalLockEntry(["claude-code"]),
          },
          lockfileSkillsYaml: {
            [displayName]: makeLocalLockEntryYaml(["claude-code"]),
          },
        });

        const result = yield* uninstallSkill(makeOp({ skillName: displayName })).pipe(
          Effect.provide(
            withServices(axmDir, {
              [displayName]: makeLocalLockEntry(["claude-code"]),
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe(`Uninstalled ${displayName}`);

        // The sanitized path should be removed from canonical location
        expect(
          fs.existsSync(path.join(base, ".axm", "extensions", "external", "skills", sanitizedName)),
        ).toBe(false);
      }),
    );

    it.effect("does not remove a colliding display name's files", () =>
      Effect.gen(function* () {
        const firstName = "My Awesome Skill!!";
        const secondName = "My@Awesome/Skill!!";
        const firstSanitized = sanitizeName(firstName);
        const secondSanitized = sanitizeName(secondName);
        const lockfileSkills = {
          [firstName]: makeLocalLockEntry([]),
          [secondName]: makeLocalLockEntry([]),
        };
        const { axmDir, base } = setupWorkspace({
          skillName: firstSanitized,
          agents: [],
          createSymlinks: false,
          lockfileSkills,
          lockfileSkillsYaml: {
            [firstName]: makeLocalLockEntryYaml([]),
            [secondName]: makeLocalLockEntryYaml([]),
          },
        });
        const secondPath = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          secondSanitized,
        );
        fs.mkdirSync(secondPath, { recursive: true });
        fs.writeFileSync(path.join(secondPath, "SKILL.md"), `# ${secondName}`);

        expect(firstSanitized).not.toBe(secondSanitized);

        const result = yield* uninstallSkill(makeOp({ skillName: firstName })).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(
          fs.existsSync(
            path.join(base, ".axm", "extensions", "external", "skills", firstSanitized),
          ),
        ).toBe(false);
        expect(fs.existsSync(secondPath)).toBe(true);
      }),
    );
  });

  describe("lockfile read error handling", () => {
    it.effect("uninstalls observed content without reading the receipt", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath } = setupWorkspace({ agents: ["claude-code"] });

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(
            withServices(
              axmDir,
              {},
              {
                lockfileErrorOverride: () =>
                  Effect.fail(
                    makeAppError({
                      code: "validation",
                      detail: "corrupt lockfile",
                    }),
                  ),
              },
            ),
          ),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(canonicalPath)).toBe(false);
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);
      }),
    );
  });

  describe("partial uninstall lockfile isolation", () => {
    it.effect("does not invoke the shared lock writer", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace({
          agents: ["claude-code", "cursor"],
        });
        const lockfileSkills: Record<string, ReturnType<typeof makeLocalLockEntry>> = {
          "my-skill": makeLocalLockEntry(["claude-code", "cursor"]),
        };
        const writeError = makeAppError({
          code: "internal",
          detail: "write failed",
        });

        const result = yield* uninstallSkill(makeOp({ agents: ["claude-code"] })).pipe(
          Effect.provide(
            withServices(axmDir, lockfileSkills, {
              setSkillErrorOverride: () => Effect.fail(writeError),
            }),
          ),
        );

        expect(result.result).toBe("success");
      }),
    );

    it.effect("swallows removeSkill failure during full uninstall", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace({
          agents: ["claude-code"],
        });
        const lockfileSkills: Record<string, ReturnType<typeof makeLocalLockEntry>> = {
          "my-skill": makeLocalLockEntry(["claude-code"]),
        };
        const writeError = makeAppError({
          code: "internal",
          detail: "write failed",
        });

        // Full uninstall now swallows removeSkill errors (catchAll in the handler)
        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, lockfileSkills, {
              removeSkillErrorOverride: () => Effect.fail(writeError),
            }),
          ),
        );

        // removeSkill errors are swallowed, so the result is still success
        expect(result.result).toBe("success");
      }),
    );
  });

  describe("universal agent self-reference", () => {
    it.effect("skips symlink removal for agents whose skills.dir matches canonical", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath } = setupWorkspace({
          agents: ["claude-code"],
          lockfileSkills: {
            "my-skill": makeLocalLockEntry(["amp", "claude-code"]),
          },
          lockfileSkillsYaml: {
            "my-skill": makeLocalLockEntryYaml(["amp", "claude-code"]),
          },
        });

        // amp uses .agents/skills — separate from canonical (.axm/extensions/external/skills)
        // Both agent symlinks and canonical dir should be removed in full uninstall
        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              "my-skill": makeLocalLockEntry(["amp", "claude-code"]),
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(canonicalPath)).toBe(false);
      }),
    );
  });

  describe("ownership-aware uninstall — pack references", () => {
    /** Creates a pack lock entry with resolvedSkills. */
    const makePackLockEntry = (resolvedSkills: Record<string, string>) =>
      makeRegistryPackLockEntry({
        owner: handle("@acme"),
        name: "starter-pack",
        sourceName: "local",

        publisherBindingId: "hbnd_test",
        resolvedSkills: Object.fromEntries(
          Object.entries(resolvedSkills).map(([name, version]) => [
            name,
            {
              source: "registry",
              version: exactVersion(version),
              publisherBindingId: "hbnd_test",
              integrity: "sha512-member",
            },
          ]),
        ),
      });

    it.effect("full uninstall when skill is NOT referenced by any pack", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalPath, lockfileSkills } = setupWorkspace({
          agents: ["claude-code"],
        });
        const { removeSkillFn } = makeRemoveSkillSpy();

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, lockfileSkills, {
              removeSkillFn,
              lockedPacks: {
                "starter-pack": makePackLockEntry({
                  "@acme/skills/other-skill": "1.0.0",
                }),
              },
            }),
          ),
        );

        expect(result.result).toBe("success");

        // Canonical dir should be removed (full uninstall)
        expect(fs.existsSync(canonicalPath)).toBe(false);

        // Agent symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        // removeSkill should be called (full removal from settings + lockfile)
        expect(removeSkillFn).toHaveBeenCalledWith("my-skill");
      }),
    );

    it.effect("settings-only removal when skill IS referenced by a pack", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath, lockfileSkills } = setupWorkspace({
          agents: ["claude-code"],
          skillName: "my-skill",
          lockfileSkills: {
            "my-skill": makeRegistrySkillLockEntry({
              owner: handle("@acme"),
              name: "my-skill",
              sourceName: "local",

              publisherBindingId: "hbnd_test",
              agents: ["claude-code"],
            }),
          },
          lockfileSkillsYaml: {
            "my-skill": {
              ...makeRegistryLockEntryYaml(["claude-code"]),
              owner: "@acme",
              name: "my-skill",
            },
          },
        });
        const removeSkillFromSettingsFn = vi.fn((_name: string) => Effect.void);
        const { removeSkillFn } = makeRemoveSkillSpy();

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, lockfileSkills, {
              removeSkillFn,
              removeSkillFromSettingsFn,
              lockedPacks: {
                "starter-pack": makePackLockEntry({
                  "@acme/skills/my-skill": "1.0.0",
                }),
              },
              requiredByPack: true,
            }),
          ),
        );

        expect(result.result).toBe("success");

        // removeSkillFromSettings should be called (settings-only removal)
        expect(removeSkillFromSettingsFn).toHaveBeenCalledWith("my-skill");

        // removeSkill should NOT be called (no full removal)
        expect(removeSkillFn).not.toHaveBeenCalled();

        // Canonical dir should still exist (kept for pack)
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );

    it.effect("settings-only removal when skill is referenced by multiple packs", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath, lockfileSkills } = setupWorkspace({
          agents: ["claude-code"],
          skillName: "my-skill",
          lockfileSkills: {
            "my-skill": makeRegistrySkillLockEntry({
              owner: handle("@acme"),
              name: "my-skill",
              sourceName: "local",

              publisherBindingId: "hbnd_test",
              agents: ["claude-code"],
            }),
          },
          lockfileSkillsYaml: {
            "my-skill": {
              ...makeRegistryLockEntryYaml(["claude-code"]),
              owner: "@acme",
              name: "my-skill",
            },
          },
        });
        const removeSkillFromSettingsFn = vi.fn((_name: string) => Effect.void);
        const { removeSkillFn } = makeRemoveSkillSpy();

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, lockfileSkills, {
              removeSkillFn,
              removeSkillFromSettingsFn,
              lockedPacks: {
                "starter-pack": makePackLockEntry({
                  "@acme/skills/my-skill": "1.0.0",
                }),
                "pro-pack": makePackLockEntry({
                  "@acme/skills/my-skill": "2.0.0",
                }),
              },
              requiredByPack: true,
            }),
          ),
        );

        expect(result.result).toBe("success");

        // removeSkillFromSettings should be called (settings-only removal)
        expect(removeSkillFromSettingsFn).toHaveBeenCalledWith("my-skill");

        // removeSkill should NOT be called (no full removal)
        expect(removeSkillFn).not.toHaveBeenCalled();

        // Canonical dir should still exist (kept for packs)
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );

    it.effect("matches skill FQN using lockfile entry owner and name fields", () =>
      Effect.gen(function* () {
        // Skill name in lockfile may differ from FQN in pack resolvedSkills
        // e.g., lockfile key "my-skill" with owner "@community" → FQN "@community/skills/my-skill"
        const { axmDir, canonicalPath, lockfileSkills } = setupWorkspace({
          agents: ["claude-code"],
          skillName: "my-skill",
          lockfileSkills: {
            "my-skill": makeRegistrySkillLockEntry({
              owner: handle("@community"),
              name: "my-skill",
              sourceName: "local",

              publisherBindingId: "hbnd_test",
              agents: ["claude-code"],
            }),
          },
          lockfileSkillsYaml: {
            "my-skill": {
              ...makeRegistryLockEntryYaml(["claude-code"]),
              owner: "@community",
              name: "my-skill",
            },
          },
        });
        const removeSkillFromSettingsFn = vi.fn((_name: string) => Effect.void);
        const { removeSkillFn } = makeRemoveSkillSpy();

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, lockfileSkills, {
              removeSkillFn,
              removeSkillFromSettingsFn,
              lockedPacks: {
                "starter-pack": makePackLockEntry({
                  "@community/skills/my-skill": "1.0.0",
                }),
              },
              requiredByPack: true,
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(removeSkillFromSettingsFn).toHaveBeenCalledWith("my-skill");
        expect(removeSkillFn).not.toHaveBeenCalled();
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );
  });

  describe("registry source uninstall", () => {
    /** Sets up a workspace with a skill installed via registry source. */
    const setupRegistryWorkspace = (
      opts: {
        skillName?: string;
        owner?: string;
        agents?: string[];
        createSymlinks?: boolean;
      } = {},
    ) => {
      const skillName = opts.skillName ?? "my-skill";
      const owner = opts.owner ?? "@community";
      const agents = opts.agents ?? ["claude-code"];

      const base = path.join(tmpDir, "project");
      const axmDir = path.join(base, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      configuredAgentsByWorkspace.set(axmDir, agents);

      // Create registry canonical dir: .axm/extensions/@owner/skills/<name>/
      const registryPath = path.join(base, ".axm", "extensions", owner, "skills", skillName);
      fs.mkdirSync(registryPath, { recursive: true });
      fs.writeFileSync(path.join(registryPath, "SKILL.md"), `# ${skillName}`);

      // Create agent symlinks pointing to registry location
      if (opts.createSymlinks !== false) {
        for (const agentId of agents) {
          const agentDirMap: Record<string, string> = {
            "claude-code": ".claude/skills",
            cursor: ".cursor/skills",
          };
          const agentSkillsDir = agentDirMap[agentId];
          if (agentSkillsDir) {
            const agentSkillPath = path.join(base, agentSkillsDir, skillName);
            fs.mkdirSync(path.dirname(agentSkillPath), { recursive: true });
            fs.symlinkSync(registryPath, agentSkillPath);
          }
        }
      }

      const lockfileSkills = {
        [skillName]: makeRegistryLockEntry(agents),
      };
      const lockfileSkillsYaml = {
        [skillName]: makeRegistryLockEntryYaml(agents),
      };
      writeLockfileYaml(axmDir, lockfileSkillsYaml);

      return { base, axmDir, registryPath, lockfileSkills };
    };

    it.effect("removes registry-sourced skill from .axm/extensions/ and cleans lockfile", () =>
      Effect.gen(function* () {
        const { axmDir, base, registryPath, lockfileSkills } = setupRegistryWorkspace({
          agents: ["claude-code"],
        });

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill");

        // Registry canonical dir should be removed
        expect(fs.existsSync(registryPath)).toBe(false);

        // Agent symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        // Lockfile entry should be removed
        const lockfile = readLockfileYaml(axmDir);
        expect(lockfile.skills["my-skill"]).toBeUndefined();
      }),
    );

    it.effect("removes skill from both external and registry locations during uninstall", () =>
      Effect.gen(function* () {
        // Setup: skill exists in BOTH locations (e.g., after a source type change)
        const { axmDir, base, registryPath, lockfileSkills } = setupRegistryWorkspace({
          agents: ["claude-code"],
        });

        // Also create the non-registry canonical location
        const externalPath = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(externalPath, { recursive: true });
        fs.writeFileSync(path.join(externalPath, "SKILL.md"), "# my-skill");

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");

        // Both locations should be removed
        expect(fs.existsSync(registryPath)).toBe(false);
        expect(fs.existsSync(externalPath)).toBe(false);
      }),
    );

    it.effect("handles partial uninstall for registry-sourced skill", () =>
      Effect.gen(function* () {
        const { axmDir, base, registryPath, lockfileSkills } = setupRegistryWorkspace({
          agents: ["claude-code", "cursor"],
        });

        const result = yield* uninstallSkill(makeOp({ agents: ["claude-code"] })).pipe(
          Effect.provide(withServices(axmDir, lockfileSkills)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill from claude-code");

        // claude-code symlink should be removed
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        // cursor symlink should still exist
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);

        // Registry canonical dir should still exist
        expect(fs.existsSync(registryPath)).toBe(true);

        // Partial projection changes leave accepted resolution unchanged.
        const lockfile = readLockfileYaml(axmDir);
        expect(lockfile.skills["my-skill"]).toBeDefined();
        expect(lockfile.skills["my-skill"]).not.toHaveProperty("agents");
      }),
    );

    it.effect("detects registry-sourced skill on disk even without lockfile entry", () =>
      Effect.gen(function* () {
        // Setup: skill in registry location but no lockfile entry
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const registryPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(registryPath, { recursive: true });
        fs.writeFileSync(path.join(registryPath, "SKILL.md"), "# my-skill");
        writeLockfileYaml(axmDir, {});

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, {})),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("Uninstalled my-skill");

        // Registry path should be removed
        expect(fs.existsSync(registryPath)).toBe(false);
      }),
    );
  });

  describe("rendered files tracking", () => {
    it.effect("removes copy-mode paths from renderedFiles in lock entry", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create the copied skill directory at a tracked rendered path
        const renderedPath = path.join(base, ".claude", "skills", "my-skill");
        fs.mkdirSync(renderedPath, { recursive: true });
        fs.writeFileSync(path.join(renderedPath, "SKILL.md"), "# my-skill");

        // Create canonical path so existsInAnyCanonicalLocation resolves true
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(canonicalPath, { recursive: true });
        fs.writeFileSync(path.join(canonicalPath, "SKILL.md"), "# my-skill");

        const lockEntry = makeLocalLockEntry(["claude-code"]);

        writeLockfileYaml(axmDir, {});

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { "my-skill": lockEntry })),
        );

        expect(result.result).toBe("success");
        // The rendered path should be removed
        expect(fs.existsSync(renderedPath)).toBe(false);
      }),
    );

    it.effect("handles missing rendered files gracefully", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Don't create the rendered path — it doesn't exist on disk
        const lockEntry = makeLocalLockEntry(["claude-code"]);

        writeLockfileYaml(axmDir, {});

        const result = yield* uninstallSkill(makeOp()).pipe(
          Effect.provide(withServices(axmDir, { "my-skill": lockEntry })),
        );

        // Should succeed even if rendered path doesn't exist
        expect(result.result).toBe("success");
      }),
    );
  });
});
