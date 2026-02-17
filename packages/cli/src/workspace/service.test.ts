/**
 * Unit tests for WorkspaceContextService.
 *
 * Tests nonInteractive resolution from Option<boolean> to plain boolean,
 * including CI environment detection fallback.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import {
  makeLogTestLayer,
  type MockLogService,
  makeConfirmTestLayer,
  makeSelectTestLayer,
  makeMultiselectTestLayer,
  Log,
} from "../tui/index.js";
import YAML from "yaml";
import { CliError } from "../cli-error/index.js";
import type { NormalizedSkillEntry, SourceHostConfig } from "../settings/index.js";
import type { SkillLockEntry } from "../lockfile/index.js";
import type { OperationResult } from "./plan.js";
import type { Operation, Plan, PlannedJobStep } from "./plan.js";
import {
  Workspace,
  layer as workspaceLayer,
  type SetPackArgs,
  type WorkspaceContextOptions,
} from "./service.js";

describe("WorkspaceContextService", () => {
  let tempDir: string;
  let projectDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-service-test-"));

    // Separate project and home dirs so local != global .axm
    projectDir = path.join(tempDir, "project");
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });

    process.chdir(projectDir);
    process.env["HOME"] = homeDir;

    // Pre-create an initialized workspace so the service doesn't prompt
    const axmDir = path.join(projectDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(
      path.join(axmDir, "settings.json"),
      JSON.stringify({ agents: ["claude-code"] }),
    );
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const [testLogLayer] = makeLogTestLayer();
  const [testConfirmLayer] = makeConfirmTestLayer();
  const [testSelectLayer] = makeSelectTestLayer();
  const [testMultiselectLayer] = makeMultiselectTestLayer();
  const BaseLayer = Layer.mergeAll(
    NodeContext.layer,
    testLogLayer,
    testConfirmLayer,
    testSelectLayer,
    testMultiselectLayer,
  );

  const makeWsLayer = (options: WorkspaceContextOptions) =>
    Layer.provide(workspaceLayer(options), BaseLayer);

  const getService = (options: WorkspaceContextOptions) =>
    Workspace.pipe(Effect.provide(Layer.merge(BaseLayer, makeWsLayer(options))));

  describe("nonInteractive resolution", () => {
    it.effect("explicit Option.some(true) resolves to true", () =>
      Effect.gen(function* () {
        const ws = yield* getService({
          global: false,
          yes: true,
          nonInteractive: Option.some(true),
          preview: false,
          agents: Option.none(),
        });

        expect(ws.nonInteractive).toBe(true);
      }),
    );

    it.effect("explicit Option.some(false) resolves to false even with CI=true", () =>
      Effect.gen(function* () {
        const originalCI = process.env["CI"];
        process.env["CI"] = "true";
        try {
          const ws = yield* getService({
            global: false,
            yes: true,
            nonInteractive: Option.some(false),
            preview: false,
            agents: Option.none(),
          });

          expect(ws.nonInteractive).toBe(false);
        } finally {
          if (originalCI === undefined) {
            delete process.env["CI"];
          } else {
            process.env["CI"] = originalCI;
          }
        }
      }),
    );

    it.effect("Option.none() with CI=true resolves to true", () =>
      Effect.gen(function* () {
        const originalCI = process.env["CI"];
        process.env["CI"] = "true";
        try {
          const ws = yield* getService({
            global: false,
            yes: true,
            nonInteractive: Option.none(),
            preview: false,
            agents: Option.none(),
          });

          expect(ws.nonInteractive).toBe(true);
        } finally {
          if (originalCI === undefined) {
            delete process.env["CI"];
          } else {
            process.env["CI"] = originalCI;
          }
        }
      }),
    );

    it.effect("Option.none() without CI resolves to false", () =>
      Effect.gen(function* () {
        const originalCI = process.env["CI"];
        delete process.env["CI"];
        try {
          const ws = yield* getService({
            global: false,
            yes: true,
            nonInteractive: Option.none(),
            preview: false,
            agents: Option.none(),
          });

          expect(ws.nonInteractive).toBe(false);
        } finally {
          if (originalCI === undefined) {
            delete process.env["CI"];
          } else {
            process.env["CI"] = originalCI;
          }
        }
      }),
    );
  });

  describe("preview", () => {
    it.effect("stores preview value from options", () =>
      Effect.gen(function* () {
        const ws = yield* getService({
          global: false,
          yes: true,
          nonInteractive: Option.some(false),
          preview: true,
          agents: Option.none(),
        });

        expect(ws.preview).toBe(true);
      }),
    );
  });

  describe("resolvePlan", () => {
    type TestOp = Operation<"test-op", Record<string, never>>;
    const testStep: PlannedJobStep<TestOp> = {
      _tag: "PlannedJobStep",
      operation: { name: "test-op", args: {} },
      expectedResult: { result: "success", message: "Installed test action" },
      label: "test action",
    };
    const testPlan: Plan<TestOp> = {
      name: "Test Plan",
      description: Option.none(),
      jobs: [
        {
          steps: [testStep],
          concurrency: 1,
        },
      ],
    };

    const testHandlers = {
      "test-op": (_op: TestOp): Effect.Effect<OperationResult> =>
        Effect.succeed({ result: "success" as const, message: "Installed test action" }),
    };

    const runResolvePlan = (
      options: WorkspaceContextOptions,
      mockLog: MockLogService,
      confirmValue = true,
    ) => {
      const logLayer = Layer.succeed(Log, mockLog);
      const [confirmLayer] = makeConfirmTestLayer({ type: "return", value: confirmValue });
      const [selectLayer] = makeSelectTestLayer();
      const [multiselectLayer] = makeMultiselectTestLayer();
      const base = Layer.mergeAll(
        NodeContext.layer,
        logLayer,
        confirmLayer,
        selectLayer,
        multiselectLayer,
      );
      const wsLayer = Layer.provide(workspaceLayer(options), base);
      return Effect.gen(function* () {
        const ws = yield* Workspace;
        return yield* ws.resolvePlan(testPlan, testHandlers);
      }).pipe(Effect.provide(Layer.merge(base, wsLayer)));
    };

    it.effect("default mode (preview=false) displays plan and applies", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeLogTestLayer();
        const applied = yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(false),
            preview: false,
            agents: Option.none(),
          },
          mockLog,
        );

        // displayPlan logs plan name as info
        expect(mockLog.logs.info).toContain("Test Plan");
        // applyPlan returns plan with JobStepResult steps
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
          _tag: "JobStepResult",
          actualResult: { result: "success", message: "Installed test action" },
        });
      }),
    );

    it.effect("preview interactive confirms and applies", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeLogTestLayer();
        const applied = yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(false),
            preview: true,
            agents: Option.none(),
          },
          mockLog,
          true,
        );

        // Should show preview message
        expect(mockLog.logs.info).toContainEqual("Previewing changes...");
        // displayPlan logs plan name
        expect(mockLog.logs.info).toContain("Test Plan");
        // Confirmed, so applyPlan runs and returns plan with results
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
          _tag: "JobStepResult",
          actualResult: { result: "success", message: "Installed test action" },
        });
      }),
    );

    it.effect("preview interactive cancels when user declines", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeLogTestLayer();
        const applied = yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(false),
            preview: true,
            agents: Option.none(),
          },
          mockLog,
          false,
        );

        // Should show preview message
        expect(mockLog.logs.info).toContainEqual("Previewing changes...");
        // User declined, should show cancelled message
        expect(mockLog.logs.success).toContainEqual("Cancelled.");
        // Should NOT apply — empty jobs
        expect(applied.jobs).toHaveLength(0);
      }),
    );

    it.effect("preview with --yes auto-applies without confirming", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeLogTestLayer();
        const applied = yield* runResolvePlan(
          {
            global: false,
            yes: true,
            nonInteractive: Option.some(false),
            preview: true,
            agents: Option.none(),
          },
          mockLog,
        );

        // Should show preview message
        expect(mockLog.logs.info).toContainEqual("Previewing changes...");
        // Should show pre-approved message
        expect(mockLog.logs.info).toContainEqual("Pre-approved via --yes, applying changes...");
        // Should apply and return plan with results
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
          _tag: "JobStepResult",
          actualResult: { result: "success", message: "Installed test action" },
        });
      }),
    );

    it.effect("preview with nonInteractive warns and does not apply", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeLogTestLayer();
        const applied = yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(true),
            preview: true,
            agents: Option.none(),
          },
          mockLog,
        );

        // Should show preview message
        expect(mockLog.logs.info).toContainEqual("Previewing changes...");
        // Should warn about non-interactive mode
        expect(mockLog.logs.warn).toContainEqual(
          "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.",
        );
        // Should NOT apply — empty jobs
        expect(applied.jobs).toHaveLength(0);
      }),
    );
  });

  /** Default options for tests that don't care about prompting/preview. */
  const defaultOptions: WorkspaceContextOptions = {
    global: false,
    yes: true,
    nonInteractive: Option.some(false),
    preview: false,
    agents: Option.none(),
  };

  /**
   * Helper to write settings JSON to a .axm directory.
   * Creates the directory if it doesn't exist.
   */
  const writeSettingsTo = (dir: string, settings: Record<string, unknown>) => {
    const axmDir = path.join(dir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings, null, 2));
  };

  describe("getConfiguredSources", () => {
    it.effect("returns only built-in defaults when no sources configured", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        expect(sources).toHaveLength(3);
        expect(sources.map((s) => s.name)).toEqual(["github", "gitlab", "bitbucket"]);
      }),
    );

    it.effect("merge ordering: project first, then global, then built-in", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [{ name: "my-registry", type: "registry", url: "https://registry.example.com" }],
        });
        writeSettingsTo(homeDir, {
          sources: [{ name: "corp-registry", type: "registry", url: "https://corp.example.com" }],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        const names = sources.map((s) => s.name);
        expect(names).toEqual(["my-registry", "corp-registry", "github", "gitlab", "bitbucket"]);
      }),
    );

    it.effect("project source overrides global source with same name", () =>
      Effect.gen(function* () {
        const projectSource: SourceHostConfig = {
          name: "github",
          type: "github",
          url: new URL("https://github.mycompany.com"),
        };
        const globalSource: SourceHostConfig = {
          name: "github",
          type: "github",
          url: new URL("https://github.example.com"),
        };

        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [projectSource],
        });
        writeSettingsTo(homeDir, {
          sources: [globalSource],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        const githubSource = sources.find((s) => s.name === "github");
        expect(githubSource).toBeDefined();
        // Project wins over global
        expect((githubSource as SourceHostConfig & { url: URL }).url).toEqual(
          new URL("https://github.mycompany.com"),
        );
        // Built-in github is also overridden (only one "github" entry)
        expect(sources.filter((s) => s.name === "github")).toHaveLength(1);
      }),
    );

    it.effect("global source overrides built-in source with same name", () =>
      Effect.gen(function* () {
        const globalSource: SourceHostConfig = {
          name: "gitlab",
          type: "gitlab",
          url: new URL("https://gitlab.corp.example.com"),
        };

        writeSettingsTo(homeDir, {
          sources: [globalSource],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        const gitlabSource = sources.find((s) => s.name === "gitlab");
        expect(gitlabSource).toBeDefined();
        expect((gitlabSource as SourceHostConfig & { url: URL }).url).toEqual(
          new URL("https://gitlab.corp.example.com"),
        );
        expect(sources.filter((s) => s.name === "gitlab")).toHaveLength(1);
      }),
    );

    it.effect("caches result across multiple calls", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [{ name: "custom", type: "registry", url: new URL("https://r.example.com") }],
        });

        const ws = yield* getService(defaultOptions);
        const first = yield* ws.getConfiguredSources();
        const second = yield* ws.getConfiguredSources();

        // Same reference (cached)
        expect(first).toBe(second);
      }),
    );
  });

  describe("getConfiguredSourceByName", () => {
    it.effect("returns Some when source exists", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getConfiguredSourceByName("github");

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result).name).toBe("github");
      }),
    );

    it.effect("returns None when source does not exist", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getConfiguredSourceByName("nonexistent");

        expect(Option.isNone(result)).toBe(true);
      }),
    );
  });

  describe("getConfiguredRegistrySources", () => {
    it.effect("returns empty when no registry sources configured", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredRegistrySources(Option.none());

        // Built-in sources are github/gitlab/bitbucket, none are registry type
        expect(sources).toHaveLength(0);
      }),
    );

    it.effect("returns all registry sources when scope is None", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "r1",
              type: "registry",
              url: new URL("https://r1.example.com"),
            },
            {
              name: "r2",
              type: "registry",
              url: new URL("https://r2.example.com"),
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredRegistrySources(Option.none());

        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["r1", "r2"]);
      }),
    );

    it.effect("scope argument does not filter registry sources", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "corp-reg",
              type: "registry",
              url: new URL("https://corp.example.com"),
            },
            {
              name: "public-reg",
              type: "registry",
              url: new URL("https://public.example.com"),
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredRegistrySources(Option.some("@corp"));

        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["corp-reg", "public-reg"]);
      }),
    );
  });

  describe("getConfiguredScope", () => {
    it.effect("returns project scope when configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          scope: "@myorg",
        });

        const ws = yield* getService(defaultOptions);
        const scope = yield* ws.getConfiguredScope();

        expect(scope).toBe("@myorg");
      }),
    );

    it.effect("returns global scope when project scope not configured", () =>
      Effect.gen(function* () {
        // Project has no scope
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        // Global has scope
        writeSettingsTo(homeDir, {
          scope: "@globalorg",
        });

        const ws = yield* getService(defaultOptions);
        const scope = yield* ws.getConfiguredScope();

        expect(scope).toBe("@globalorg");
      }),
    );

    it.effect("normalizes bare scope by prepending @", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          scope: "myorg",
        });

        const ws = yield* getService(defaultOptions);
        const scope = yield* ws.getConfiguredScope();

        expect(scope).toBe("@myorg");
      }),
    );

    it.effect("returns @community when no scope configured anywhere", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        // No global settings (readSettingsSafe returns defaults)

        const ws = yield* getService(defaultOptions);
        const scope = yield* ws.getConfiguredScope();

        expect(scope).toBe("@community");
      }),
    );
  });

  describe("addConfiguredSource", () => {
    it.effect("appends source to project settings", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        const newSource: SourceHostConfig = {
          name: "my-registry",
          type: "registry",
          url: new URL("https://registry.example.com"),
        };
        yield* ws.addConfiguredSource(newSource);

        // Verify it was written to disk
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(content.sources).toBeDefined();
        expect(content.sources).toHaveLength(1);
        expect(content.sources[0].name).toBe("my-registry");
      }),
    );

    it.effect("source visible in subsequent getConfiguredSources calls (cache invalidated)", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        // Populate cache
        const before = yield* ws.getConfiguredSources();
        expect(before.find((s) => s.name === "new-source")).toBeUndefined();

        // Add a new source
        const newSource: SourceHostConfig = {
          name: "new-source",
          type: "registry",
          url: new URL("https://new.example.com"),
        };
        yield* ws.addConfiguredSource(newSource);

        // Cache should be invalidated, new source visible
        const after = yield* ws.getConfiguredSources();
        expect(after.find((s) => s.name === "new-source")).toBeDefined();
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Lockfile helpers
  // ---------------------------------------------------------------------------

  /**
   * Helper to write a lockfile YAML to the .axm directory.
   */
  const writeLockfileTo = (
    dir: string,
    skills: Record<string, unknown>,
    packs?: Record<string, unknown>,
  ) => {
    const axmDir = path.join(dir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    const lockfileData: Record<string, unknown> = { lockfileVersion: 1, skills };
    if (packs !== undefined) {
      lockfileData["packs"] = packs;
    }
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfileData));
  };

  /** Read lockfile from disk for verification. */
  const readLockfileFromDisk = (dir: string) =>
    YAML.parse(fs.readFileSync(path.join(dir, ".axm", "axm-lock.yaml"), "utf-8")) as {
      lockfileVersion: number;
      skills: Record<string, unknown>;
      packs?: Record<string, unknown>;
    };

  /** Create a sample SkillLockEntry for testing. */
  const makeSampleLockEntry = (agents: readonly string[] = ["claude-code"]): SkillLockEntry => ({
    type: "github" as const,
    owner: "acme",
    repo: "code-review",
    agents: [...agents],
    installedAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  });

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  describe("getInstalledSkills", () => {
    it.effect("returns normalized managed skills when skills are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review", "test-gen": "local:/tmp/test-gen" },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(skills).toEqual({
          "code-review": {
            source: Option.some("github:acme/code-review"),
            enabled: true,
            managed: true,
          },
          "test-gen": {
            source: Option.some("local:/tmp/test-gen"),
            enabled: true,
            managed: true,
          },
        });
      }),
    );

    it.effect("returns empty record when no skills configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(skills).toEqual({});
      }),
    );
  });

  describe("getConfiguredAgents", () => {
    it.effect("returns agents array when agents are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code", "cursor"] });

        const ws = yield* getService(defaultOptions);
        const agents = yield* ws.getConfiguredAgents();

        expect(agents).toEqual(["claude-code", "cursor"]);
      }),
    );

    it.effect("returns empty array when no agents configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const agents = yield* ws.getConfiguredAgents();

        expect(agents).toEqual([]);
      }),
    );
  });

  describe("getLockedSkills", () => {
    it.effect("returns skills lock map when lock entries are present", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getLockedSkills();

        expect(Object.keys(skills)).toEqual(["code-review"]);
        expect(skills["code-review"]?.type).toBe("github");
      }),
    );

    it.effect("returns empty record when no lock entries", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getLockedSkills();

        expect(skills).toEqual({});
      }),
    );
  });

  describe("getLockedSkill", () => {
    it.effect("returns Option.some when skill exists in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedSkill("code-review");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.type).toBe("github");
        }
      }),
    );

    it.effect("returns Option.none when skill not in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedSkill("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Compound mutations
  // ---------------------------------------------------------------------------

  describe("setSkill", () => {
    it.effect("installs new skill: adds to settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: makeSampleLockEntry(),
          versionConstraint: Option.none(),
        });

        // Verify settings on disk — source derived from lock entry
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toBeDefined();
        expect(settings.skills["code-review"]).toBe("github:acme/code-review");

        // Verify lockfile on disk
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).toHaveProperty("code-review");
        expect((lockfile.skills["code-review"] as { type: string }).type).toBe("github");
      }),
    );

    it.effect("sets updatedAt to current time", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const before = new Date();
        const ws = yield* getService(defaultOptions);
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: makeSampleLockEntry(),
          versionConstraint: Option.none(),
        });
        const after = new Date();

        const lockfile = readLockfileFromDisk(projectDir);
        const updatedAt = new Date(
          (lockfile.skills["code-review"] as { updatedAt: string }).updatedAt,
        );
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }),
    );

    it.effect("updates existing skill: replaces in settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const updatedEntry: SkillLockEntry = {
          type: "github",
          owner: "acme",
          repo: "code-review-v2",
          agents: ["claude-code", "cursor"],
          installedAt: new Date("2025-01-01T00:00:00.000Z"),
          updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        };
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: updatedEntry,
          versionConstraint: Option.none(),
        });

        // Verify settings updated — source derived from lock entry
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills["code-review"]).toBe("github:acme/code-review-v2");

        // Verify lockfile updated
        const lockfile = readLockfileFromDisk(projectDir);
        expect((lockfile.skills["code-review"] as { agents: string[] }).agents).toEqual([
          "claude-code",
          "cursor",
        ]);
      }),
    );

    it.effect("preserves version constraint in settings for registry skills", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          scope: "@acme",
          name: "tool",
          resolvedVersion: "1.2.3",
          checksum: "sha256-abc",
          sourceName: "default",
          agents: ["claude-code"],
          installedAt: new Date(),
          updatedAt: new Date(),
        };

        yield* ws.setSkill({
          name: "tool",
          lockEntry: registryEntry,
          versionConstraint: Option.some("^1.0.0"),
        });

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills.tool).toBe("@acme/tool@^1.0.0");
      }),
    );

    it.effect("omits version constraint in settings when none provided", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          scope: "@acme",
          name: "tool",
          resolvedVersion: "1.2.3",
          checksum: "sha256-abc",
          sourceName: "default",
          agents: ["claude-code"],
          installedAt: new Date(),
          updatedAt: new Date(),
        };

        yield* ws.setSkill({
          name: "tool",
          lockEntry: registryEntry,
          versionConstraint: Option.none(),
        });

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills.tool).toBe("@acme/tool");
      }),
    );

    it.effect("preserves exact pin version constraint", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          scope: "@acme",
          name: "tool",
          resolvedVersion: "1.2.3",
          checksum: "sha256-abc",
          sourceName: "default",
          agents: ["claude-code"],
          installedAt: new Date(),
          updatedAt: new Date(),
        };

        yield* ws.setSkill({
          name: "tool",
          lockEntry: registryEntry,
          versionConstraint: Option.some("1.2.3"),
        });

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills.tool).toBe("@acme/tool@1.2.3");
      }),
    );
  });

  describe("removeSkill", () => {
    it.effect("removes existing skill from both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "test-gen": "local:/tmp/test-gen",
          },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "test-gen": {
            type: "local",
            path: "/tmp/test-gen",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkill("code-review");

        // Verify settings: code-review removed, test-gen remains
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).not.toHaveProperty("code-review");
        expect(settings.skills).toHaveProperty("test-gen");

        // Verify lockfile: code-review removed, test-gen remains
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).not.toHaveProperty("code-review");
        expect(lockfile.skills).toHaveProperty("test-gen");
      }),
    );

    it.effect("no-op when skill does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "test-gen": "local:/tmp/test-gen" },
        });
        writeLockfileTo(projectDir, {
          "test-gen": {
            type: "local",
            path: "/tmp/test-gen",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkill("nonexistent");

        // Verify nothing changed
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toHaveProperty("test-gen");
        expect(Object.keys(settings.skills as Record<string, string>)).toHaveLength(1);

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).toHaveProperty("test-gen");
        expect(Object.keys(lockfile.skills)).toHaveLength(1);
      }),
    );
  });

  describe("addConfiguredAgent", () => {
    it.effect("adds new agent to settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.addConfiguredAgent("cursor");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code", "cursor"]);
      }),
    );

    it.effect("no-op when agent already present", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.addConfiguredAgent("claude-code");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      }),
    );

    it.effect("fails with CliError for invalid agent ID", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.addConfiguredAgent("invalid-agent-xyz").pipe(Effect.flip);

        expect(result).toBeInstanceOf(CliError);
        expect(result.code).toBe("SETTINGS_PARSE_FAILED");

        // Verify settings were not changed
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Initialization flow (initializeProjectWorkspace)
  // ---------------------------------------------------------------------------

  describe("initializeProjectWorkspace", () => {
    /**
     * Helper to remove the pre-created settings so init triggers.
     */
    const removePreCreatedSettings = () => {
      const axmDir = path.join(projectDir, ".axm");
      fs.rmSync(axmDir, { recursive: true, force: true });
    };

    /**
     * Helper to create workspace layer with custom TUI behaviors for init testing.
     * Uses multiselect behavior to control which agents are "selected".
     */
    const getServiceWithInit = (
      options: WorkspaceContextOptions,
      multiselectBehavior?: { type: "return"; indices: readonly number[] } | { type: "cancel" },
    ) => {
      const [logLayer] = makeLogTestLayer();
      const [confirmLayer] = makeConfirmTestLayer();
      const [selectLayer] = makeSelectTestLayer();
      const [multiselectLayer, multiselectMock] = makeMultiselectTestLayer(multiselectBehavior);
      const base = Layer.mergeAll(
        NodeContext.layer,
        logLayer,
        confirmLayer,
        selectLayer,
        multiselectLayer,
      );
      const wsLayer = Layer.provide(workspaceLayer(options), base);
      return {
        run: Workspace.pipe(Effect.provide(Layer.merge(base, wsLayer))),
        multiselectMock,
      };
    };

    it.effect("interactive mode calls multiselect directly (no select prompt)", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        const { run, multiselectMock } = getServiceWithInit(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(false),
            preview: false,
            agents: Option.none(),
          },
          { type: "return", indices: [] },
        );

        yield* run;

        // Should have called multiselect once (no select prompt)
        expect(multiselectMock.calls).toHaveLength(1);
        expect(multiselectMock.calls[0]!.message).toBe("Select agents to configure");
      }),
    );

    it.effect("--yes auto-selects detected agents without prompting", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        // Create .claude dir in project to trigger detection
        fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

        const { run, multiselectMock } = getServiceWithInit({
          global: false,
          yes: true,
          nonInteractive: Option.some(false),
          preview: false,
          agents: Option.none(),
        });

        const ws = yield* run;
        const agents = yield* ws.getConfiguredAgents();

        // --yes skips prompting entirely
        expect(multiselectMock.calls).toHaveLength(0);
        // claude-code should be auto-selected via project-level detection
        expect(agents).toContain("claude-code");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // getSkillDir
  // ---------------------------------------------------------------------------

  describe("getSkillDir", () => {
    it.effect("name-only lookup with registry lock entry returns registry paths", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {
          "my-skill": {
            type: "registry",
            scope: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            checksum: "abc123",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const paths = yield* ws.getSkillDir("my-skill");

        expect(paths.canonicalPath).toContain(".axm/extensions/@acme/skills/my-skill");
        expect(paths.skillSrcPath).toContain(
          ".axm/extensions/@acme/skills/my-skill" + path.sep + "src",
        );
        expect(paths.skillSrcPath).toBe(paths.canonicalPath + path.sep + "src");
      }),
    );

    it.effect(
      "name-only lookup with non-registry lock entry returns external extensions paths",
      () =>
        Effect.gen(function* () {
          writeLockfileTo(projectDir, {
            "code-review": {
              type: "github",
              owner: "acme",
              repo: "code-review",
              agents: ["claude-code"],
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          });

          const ws = yield* getService(defaultOptions);
          const paths = yield* ws.getSkillDir("code-review");

          expect(paths.canonicalPath).toContain(".axm/extensions/external/skills/code-review");
          expect(paths.skillSrcPath).toBe(paths.canonicalPath);
        }),
    );

    it.effect("explicit registry source returns correct paths without lockfile lookup", () =>
      Effect.gen(function* () {
        // Empty lockfile — explicit source should not need it
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const paths = yield* ws.getSkillDir("my-skill", {
          type: "registry",
          scope: "@corp",
        });

        expect(paths.canonicalPath).toContain(".axm/extensions/@corp/skills/my-skill");
        expect(paths.skillSrcPath).toBe(paths.canonicalPath + path.sep + "src");
      }),
    );

    it.effect("explicit non-registry source returns correct paths without lockfile lookup", () =>
      Effect.gen(function* () {
        // Empty lockfile — explicit source should not need it
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const paths = yield* ws.getSkillDir("code-review", { type: "github" });

        expect(paths.canonicalPath).toContain(".axm/extensions/external/skills/code-review");
        expect(paths.skillSrcPath).toBe(paths.canonicalPath);
      }),
    );

    it.effect("name-only with missing lock entry fails with SKILL_NOT_LOCKED", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getSkillDir("nonexistent").pipe(Effect.flip);

        expect(result).toBeInstanceOf(CliError);
        expect(result.code).toBe("SKILL_NOT_LOCKED");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Semaphore serialization
  // ---------------------------------------------------------------------------

  describe("semaphore serialization", () => {
    it.effect("concurrent setSkill and addConfiguredSource do not interleave", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);

        const newSource: SourceHostConfig = {
          name: "my-registry",
          type: "registry",
          url: new URL("https://registry.example.com"),
        };

        yield* Effect.all(
          [
            ws.setSkill({
              name: "code-review",
              lockEntry: makeSampleLockEntry(),
              versionConstraint: Option.none(),
            }),
            ws.addConfiguredSource(newSource),
          ],
          { concurrency: "unbounded" },
        );

        // Both mutations should be present in final state
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toHaveProperty("code-review");
        expect(settings.sources).toBeDefined();
        expect(settings.sources).toHaveLength(1);
        expect(settings.sources[0].name).toBe("my-registry");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).toHaveProperty("code-review");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // getConfiguredSkills
  // ---------------------------------------------------------------------------

  describe("getConfiguredSkills", () => {
    it.effect("returns all entries normalized (managed + unmanaged)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "my-linter": { source: "github:acme/linter", enabled: false },
            "external-tool": { managed: false },
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getConfiguredSkills();

        expect(Object.keys(skills)).toEqual(["code-review", "my-linter", "external-tool"]);

        // String entry normalizes to managed + enabled with source
        expect(skills["code-review"]).toEqual({
          source: Option.some("github:acme/code-review"),
          enabled: true,
          managed: true,
        } satisfies NormalizedSkillEntry);

        // Object entry normalizes to managed + disabled with source
        expect(skills["my-linter"]).toEqual({
          source: Option.some("github:acme/linter"),
          enabled: false,
          managed: true,
        } satisfies NormalizedSkillEntry);

        // Unmanaged entry normalizes to unmanaged, no source
        expect(skills["external-tool"]).toEqual({
          source: Option.none(),
          enabled: true,
          managed: false,
        } satisfies NormalizedSkillEntry);
      }),
    );

    it.effect("returns empty record when no skills configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getConfiguredSkills();

        expect(skills).toEqual({});
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // getInstalledSkills (modified — managed only, normalized)
  // ---------------------------------------------------------------------------

  describe("getInstalledSkills (normalized)", () => {
    it.effect("returns only managed entries as NormalizedSkillEntry", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "my-linter": { source: "github:acme/linter", enabled: false },
            "external-tool": { managed: false },
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        // Only managed entries (external-tool excluded)
        expect(Object.keys(skills)).toEqual(["code-review", "my-linter"]);

        expect(skills["code-review"]).toEqual({
          source: Option.some("github:acme/code-review"),
          enabled: true,
          managed: true,
        } satisfies NormalizedSkillEntry);

        expect(skills["my-linter"]).toEqual({
          source: Option.some("github:acme/linter"),
          enabled: false,
          managed: true,
        } satisfies NormalizedSkillEntry);
      }),
    );

    it.effect("returns empty record when no skills configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(skills).toEqual({});
      }),
    );

    it.effect("all returned entries have source as Some", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "external-tool": { managed: false },
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        for (const entry of Object.values(skills)) {
          expect(Option.isSome(entry.source)).toBe(true);
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // updateSkillEntry
  // ---------------------------------------------------------------------------

  describe("updateSkillEntry", () => {
    it.effect("applies updater and collapses result back to settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.updateSkillEntry("code-review", (entry) => ({ ...entry, enabled: false }));

        // Verify on disk: collapsed to object form since enabled=false
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills["code-review"]).toEqual({
          source: "github:acme/code-review",
          enabled: false,
        });
      }),
    );

    it.effect("collapses to string form when enabled stays true", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": { source: "github:acme/code-review", enabled: false } },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.updateSkillEntry("code-review", (entry) => ({ ...entry, enabled: true }));

        // Collapsed to plain string since enabled=true
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills["code-review"]).toBe("github:acme/code-review");
      }),
    );

    it.effect("fails with CliError for missing skill name", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"], skills: {} });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws
          .updateSkillEntry("nonexistent", (entry) => entry)
          .pipe(Effect.flip);

        expect(result).toBeInstanceOf(CliError);
        expect(result.code).toBe("SKILL_NOT_FOUND");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // renameSkill
  // ---------------------------------------------------------------------------

  describe("renameSkill", () => {
    it.effect("atomically renames in both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "old-name": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "old-name": {
            type: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.renameSkill("old-name", "new-name");

        // Verify settings
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).not.toHaveProperty("old-name");
        expect(settings.skills["new-name"]).toBe("github:acme/code-review");

        // Verify lockfile
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).not.toHaveProperty("old-name");
        expect(lockfile.skills).toHaveProperty("new-name");
        expect((lockfile.skills["new-name"] as { type: string }).type).toBe("github");
      }),
    );

    it.effect("fails with CliError when old name does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"], skills: {} });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.renameSkill("nonexistent", "new-name").pipe(Effect.flip);

        expect(result).toBeInstanceOf(CliError);
        expect(result.code).toBe("SKILL_NOT_FOUND");
      }),
    );

    it.effect("handles rename when lockfile entry does not exist (settings only)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "old-name": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.renameSkill("old-name", "new-name");

        // Settings renamed
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).not.toHaveProperty("old-name");
        expect(settings.skills["new-name"]).toBe("github:acme/code-review");

        // Lockfile unchanged (empty)
        const lockfile = readLockfileFromDisk(projectDir);
        expect(Object.keys(lockfile.skills)).toHaveLength(0);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // updateLockEntryAgents
  // ---------------------------------------------------------------------------

  describe("updateLockEntryAgents", () => {
    it.effect("updates agents field on lock entry", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.updateLockEntryAgents("code-review", ["claude-code", "cursor"]);

        const lockfile = readLockfileFromDisk(projectDir);
        expect((lockfile.skills["code-review"] as { agents: string[] }).agents).toEqual([
          "claude-code",
          "cursor",
        ]);
      }),
    );

    it.effect("fails with CliError when lock entry does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws
          .updateLockEntryAgents("nonexistent", ["claude-code"])
          .pipe(Effect.flip);

        expect(result).toBeInstanceOf(CliError);
        expect(result.code).toBe("LOCK_ENTRY_NOT_FOUND");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Pack methods
  // ---------------------------------------------------------------------------

  /** Create sample SetPackArgs for testing. */
  const makeSampleSetPackArgs = (overrides?: Partial<SetPackArgs>): SetPackArgs => ({
    scope: "@acme",
    name: "starter-pack",
    resolvedVersion: "1.0.0",
    checksum: "sha256-abc123",
    sourceName: "default",
    installedAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
    resolvedSkills: {},
    resolvedCommands: {},
    resolvedMcpServers: {},
    versionConstraint: Option.none(),
    ...overrides,
  });

  describe("getConfiguredPacks", () => {
    it.effect("returns packs map when packs are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/starter-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getConfiguredPacks();

        expect(packs).toEqual({
          "starter-pack": "@acme/starter-pack",
        });
      }),
    );

    it.effect("returns empty record when no packs configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getConfiguredPacks();

        expect(packs).toEqual({});
      }),
    );
  });

  describe("getInstalledPacks", () => {
    it.effect("returns packs map when packs are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/starter-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getInstalledPacks();

        expect(packs).toEqual({
          "starter-pack": "@acme/starter-pack",
        });
      }),
    );

    it.effect("returns empty record when no packs configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getInstalledPacks();

        expect(packs).toEqual({});
      }),
    );
  });

  describe("getLockedPacks", () => {
    it.effect("returns packs lock map when lock entries are present", () =>
      Effect.gen(function* () {
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              scope: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              checksum: "sha256-abc123",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "@acme/code-review": "1.2.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getLockedPacks();

        expect(Object.keys(packs)).toEqual(["starter-pack"]);
        expect(packs["starter-pack"]?.type).toBe("registry");
        expect(packs["starter-pack"]?.resolvedSkills).toEqual({ "@acme/code-review": "1.2.0" });
      }),
    );

    it.effect("returns empty record when no pack lock entries", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getLockedPacks();

        expect(packs).toEqual({});
      }),
    );
  });

  describe("getLockedPack", () => {
    it.effect("returns Option.some when pack exists in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              scope: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              checksum: "sha256-abc123",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedPack("starter-pack");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.type).toBe("registry");
          expect(entry.value.resolvedVersion).toBe("1.0.0");
        }
      }),
    );

    it.effect("returns Option.none when pack not in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedPack("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }),
    );
  });

  describe("setPack", () => {
    it.effect("installs new pack: adds to settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setPack(makeSampleSetPackArgs());

        // Verify settings on disk
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toBeDefined();
        expect(settings.packs["starter-pack"]).toBe("@acme/starter-pack");

        // Verify lockfile on disk
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).toHaveProperty("starter-pack");
        expect((lockfile.packs!["starter-pack"] as { type: string }).type).toBe("registry");
      }),
    );

    it.effect("sets updatedAt to current time", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const before = new Date();
        const ws = yield* getService(defaultOptions);
        yield* ws.setPack(makeSampleSetPackArgs());
        const after = new Date();

        const lockfile = readLockfileFromDisk(projectDir);
        const updatedAt = new Date(
          (lockfile.packs!["starter-pack"] as { updatedAt: string }).updatedAt,
        );
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }),
    );
  });

  describe("removePack", () => {
    it.effect("removes existing pack from both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: {
            "starter-pack": "@acme/starter-pack",
            "other-pack": "@acme/other-pack",
          },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              scope: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              checksum: "sha256-abc123",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
            "other-pack": {
              type: "registry",
              scope: "@acme",
              name: "other-pack",
              resolvedVersion: "2.0.0",
              checksum: "sha256-def456",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        yield* ws.removePack("starter-pack");

        // Verify settings: starter-pack removed, other-pack remains
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).not.toHaveProperty("starter-pack");
        expect(settings.packs).toHaveProperty("other-pack");

        // Verify lockfile: starter-pack removed, other-pack remains
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).not.toHaveProperty("starter-pack");
        expect(lockfile.packs).toHaveProperty("other-pack");
      }),
    );

    it.effect("no-op when pack does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "other-pack": "@acme/other-pack" },
        });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removePack("nonexistent");

        // Verify nothing changed
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toHaveProperty("other-pack");
        expect(Object.keys(settings.packs as Record<string, string>)).toHaveLength(1);
      }),
    );
  });

  describe("getPackDir", () => {
    it.effect("returns registry extensions path with scope", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getPackDir("starter-pack", "@acme");

        expect(result.canonicalPath).toContain(".axm/extensions/@acme/packs/starter-pack");
      }),
    );

    it.effect("handles different scopes correctly", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getPackDir("my-pack", "@community");

        expect(result.canonicalPath).toContain(".axm/extensions/@community/packs/my-pack");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // getInstalledSkills with transitive pack skills
  // ---------------------------------------------------------------------------

  describe("getInstalledSkills (transitive visibility)", () => {
    it.effect("pack-provided skill visible in getInstalledSkills", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              scope: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              checksum: "sha256-abc123",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "@acme/code-review": "1.2.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(skills).toHaveProperty("@acme/code-review");
        expect(skills["@acme/code-review"]).toEqual({
          source: Option.some("@acme/code-review"),
          enabled: true,
          managed: true,
        });
      }),
    );

    it.effect("direct entry with same key overrides transitive", () =>
      Effect.gen(function* () {
        // Direct skill "code-review" and transitive skill "code-review" from pack
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
          packs: { "starter-pack": "@acme/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              scope: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              checksum: "sha256-abc123",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "code-review": "1.2.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        // Direct entry wins over transitive
        expect(skills["code-review"]).toEqual({
          source: Option.some("github:acme/code-review"),
          enabled: true,
          managed: true,
        });
      }),
    );

    it.effect("multiple packs providing same skill — first pack wins", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: {
            "pack-a": "@acme/pack-a",
            "pack-b": "@acme/pack-b",
          },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "pack-a": {
              type: "registry",
              scope: "@acme",
              name: "pack-a",
              resolvedVersion: "1.0.0",
              checksum: "sha256-aaa",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "@acme/shared-skill": "1.0.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
            "pack-b": {
              type: "registry",
              scope: "@acme",
              name: "pack-b",
              resolvedVersion: "1.0.0",
              checksum: "sha256-bbb",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "@acme/shared-skill": "2.0.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        // First pack encountered wins
        expect(skills).toHaveProperty("@acme/shared-skill");
        const entry = skills["@acme/shared-skill"]!;
        expect(Option.getOrThrow(entry.source)).toBe("@acme/shared-skill");
      }),
    );

    it.effect("getConfiguredSkills unchanged — only returns direct settings entries", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
          packs: { "starter-pack": "@acme/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              scope: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              checksum: "sha256-abc123",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "@acme/transitive-skill": "1.0.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const configured = yield* ws.getConfiguredSkills();

        // Only direct settings entries, no transitive
        expect(Object.keys(configured)).toEqual(["my-skill"]);
        expect(configured).not.toHaveProperty("@acme/transitive-skill");
      }),
    );
  });
});
