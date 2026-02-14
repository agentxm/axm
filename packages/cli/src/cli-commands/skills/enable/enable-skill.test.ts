import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { makeCliError } from "../../../cli-error/index.js";
import type { SkillLockEntry } from "../../../lockfile/schema.js";
import { makeLogTestLayer } from "../../../tui/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { sanitizeName } from "../install/skill-utils.js";
import type { EnableSkillOperation } from "../operations.js";
import { enableSkill } from "./enable-skill.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Creates a workspace mock for enable tests. */
const makeWorkspaceMock = (
  axmDir: string,
  opts: {
    configuredAgents?: ReadonlyArray<string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    lockfileSkills?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    settingsSkills?: Record<string, any>;
    updateSkillEntryFn?: ReturnType<typeof vi.fn>;
    updateLockEntryAgentsFn?: ReturnType<typeof vi.fn>;
  } = {},
): WorkspaceContextService => {
  const configuredAgents = opts.configuredAgents ?? ["claude-code"];
  const lockfileSkills = opts.lockfileSkills ?? {};
  const settingsSkills = opts.settingsSkills ?? {};

  return {
    global: false,
    path: axmDir,
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getConfiguredRegistrySources: () => Effect.succeed([]),
    getConfiguredScope: () => Effect.succeed("@community"),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(settingsSkills).map(([k, v]) => [
            k,
            {
              source: Option.fromNullable(typeof v === "string" ? v : v?.source),
              enabled: typeof v === "string" ? true : (v?.enabled ?? true),
              managed: typeof v === "string" ? true : (v?.managed ?? true),
            },
          ]),
        ),
      ),
    getInstalledSkills: () =>
      Effect.succeed(
        Object.fromEntries(
          Object.entries(settingsSkills)
            .filter(
              ([, v]) => typeof v === "string" || (v as { managed?: boolean })?.managed !== false,
            )
            .map(([k, v]) => [
              k,
              {
                source: Option.fromNullable(typeof v === "string" ? v : v?.source),
                enabled: typeof v === "string" ? true : (v?.enabled ?? true),
                managed: true,
              },
            ]),
        ),
      ),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getLockedSkills: () => Effect.succeed(lockfileSkills),
    getLockedSkill: (name: string) =>
      Effect.succeed(Option.fromNullable(lockfileSkills[name] as SkillLockEntry | undefined)),
    getSkillDir: (name: string) => {
      const base = path.dirname(axmDir);
      const sanitized = sanitizeName(name);
      const lockEntry = lockfileSkills[name] as SkillLockEntry | undefined;
      if (lockEntry === undefined) {
        return Effect.fail(
          makeCliError({
            code: "SKILL_NOT_LOCKED",
            what: `Skill "${name}" not found in lockfile`,
          }),
        );
      }
      if (lockEntry.type === "registry") {
        const scope = "scope" in lockEntry ? (lockEntry as { scope: string }).scope : "@community";
        const canonicalPath = path.join(base, ".axm", "extensions", scope, "skills", sanitized);
        return Effect.succeed({ canonicalPath, skillSrcPath: path.join(canonicalPath, "src") });
      }
      const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", sanitized);
      return Effect.succeed({ canonicalPath, skillSrcPath: canonicalPath });
    },
    setSkill: () => Effect.void,
    removeSkill: () => Effect.void,
    updateSkillEntry: opts.updateSkillEntryFn ?? (() => Effect.void),
    renameSkill: () => Effect.void,
    updateLockEntryAgents: opts.updateLockEntryAgentsFn ?? (() => Effect.void),
    addConfiguredAgent: () => Effect.void,
  };
};

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string, wsOpts?: Parameters<typeof makeWorkspaceMock>[1]) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOpts);
  const [logLayer] = makeLogTestLayer();
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs), logLayer);
};

/** Creates a minimal EnableSkillOperation for testing. */
const makeOp = (skillName = "my-skill"): EnableSkillOperation => ({
  name: "enable-skill",
  args: { skillName },
});

/** Creates a local source lock entry for the in-memory mock (Date objects). */
const makeLocalLockEntry = (agents: string[], sourcePath = "/tmp/source") => ({
  type: "local" as const,
  path: sourcePath,
  agents,
  installedAt: new Date(),
  updatedAt: new Date(),
});

/** Creates a registry source lock entry for the in-memory mock (Date objects). */
const makeRegistryLockEntry = (agents: string[]) => ({
  type: "registry" as const,
  scope: "@community",
  name: "my-skill",
  resolvedVersion: "1.0.0",
  checksum: "sha256:abc123",
  sourceName: "local",
  agents,
  installedAt: new Date(),
  updatedAt: new Date(),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("enableSkill", () => {
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

    // Create canonical skill files at the external extensions path
    const canonicalDir = path.join(base, ".axm", "extensions", "external", "skills", skillName);
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), `# ${skillName}`);
    fs.writeFileSync(path.join(canonicalDir, "prompt.md"), "prompt content");

    return { base, axmDir, canonicalDir, skillName, agents };
  };

  describe("happy path", () => {
    it.effect("creates agent symlinks from existing canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base, canonicalDir } = setupWorkspace();

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false, managed: true },
              },
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical location should still have files
        expect(fs.existsSync(path.join(canonicalDir, "SKILL.md"))).toBe(true);

        // Agent symlink should exist
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);
      }),
    );

    it.effect("handles multiple agents concurrently", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupWorkspace({ agents: ["claude-code", "cursor"] });

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code", "cursor"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false, managed: true },
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

    it.effect("calls updateLockEntryAgents with configured agents", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false, managed: true },
              },
              updateLockEntryAgentsFn,
            }),
          ),
        );

        expect(updateLockEntryAgentsFn).toHaveBeenCalledOnce();
        expect(updateLockEntryAgentsFn).toHaveBeenCalledWith("my-skill", ["claude-code"]);
      }),
    );

    it.effect("calls updateSkillEntry to set enabled: true", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();
        const updateSkillEntryFn = vi.fn((_name: string, _updater: unknown) => Effect.void);

        yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false, managed: true },
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
        const updateLockEntryAgentsFn = vi.fn(
          (_name: string, _agents: ReadonlyArray<string>) => Effect.void,
        );

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeLocalLockEntry([]) },
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false, managed: true },
              },
              updateSkillEntryFn,
              updateLockEntryAgentsFn,
            }),
          ),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
        // State should NOT have been updated
        expect(updateSkillEntryFn).not.toHaveBeenCalled();
        expect(updateLockEntryAgentsFn).not.toHaveBeenCalled();
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
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
        );
        const registrySrcDir = path.join(registryCanonical, "src");
        fs.mkdirSync(registrySrcDir, { recursive: true });
        fs.writeFileSync(path.join(registrySrcDir, "SKILL.md"), "# my-skill");

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: { "my-skill": makeRegistryLockEntry([]) },
              settingsSkills: {
                "my-skill": {
                  source: "registry:@community/my-skill",
                  enabled: false,
                  managed: true,
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

  describe("error cases", () => {
    it.effect("fails when lock entry is missing", () =>
      Effect.gen(function* () {
        const { axmDir } = setupWorkspace();

        const result = yield* enableSkill(makeOp()).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["claude-code"],
              lockfileSkills: {},
              settingsSkills: {
                "my-skill": { source: "local:/tmp/source", enabled: false, managed: true },
              },
            }),
          ),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
      }),
    );
  });
});
