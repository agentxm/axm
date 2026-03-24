/**
 * Unit tests for WorkspaceContextService.
 *
 * Tests nonInteractive resolution from Option<boolean> to plain boolean,
 * including CI environment detection fallback.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { Output, makeOutputTestLayer, type MockOutputService } from "../output/index.js";
import { makeInputTestLayer, type MockInputService } from "../input/index.js";
import YAML from "yaml";
import { AppError } from "../app-error/index.js";
import { CliFlagsTest, type CliFlagsService } from "../cli-flags/index.js";
import { CliEnvConfig } from "../config/index.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { CommandLockEntry, McpServerLockEntry, SkillLockEntry } from "../lockfile/index.js";
import type { OperationResult, Readiness, Operation } from "./plan.js";
import type { LegacyPlan, LegacyPlannedStep } from "./plan-bridge.js";
import { bridgeLegacyPlan } from "./plan-bridge.js";
import {
  Workspace,
  layer as workspaceLayer,
  type SetCommandArgs,
  type SetMcpServerArgs,
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

  const [testLogLayer] = makeOutputTestLayer();
  const [testPromptLayer] = makeInputTestLayer({
    methodBehaviors: {
      confirm: { type: "return", value: true },
      multiselect: { type: "return", value: [] },
    },
  });
  const BaseLayer = Layer.mergeAll(
    NodeServices.layer,
    testLogLayer,
    testPromptLayer,
    CliFlagsTest(),
    CliEnvConfig.testDefaults,
  );

  const makeWsLayer = (options: WorkspaceContextOptions) =>
    Layer.provide(workspaceLayer(options), BaseLayer);

  const getService = (options: WorkspaceContextOptions) =>
    Workspace.asEffect().pipe(Effect.provide(makeWsLayer(options)));

  const logMessages = (
    mockLog: MockOutputService,
    method: "message" | "info" | "success" | "warn" | "error",
  ): ReadonlyArray<string> =>
    mockLog.calls
      .filter((call) => call.method === method)
      .map((call) => String(call.args[0] ?? ""));

  const promptConfigs = (
    mockPrompt: MockInputService,
    method: "confirm" | "multiselect",
  ): ReadonlyArray<unknown> =>
    mockPrompt.calls.filter((call) => call.method === method).map((call) => call.config);

  describe("baseDir", () => {
    it.effect("returns the parent of path", () =>
      Effect.gen(function* () {
        const ws = yield* getService({
          scope: "project",
          agents: Option.none(),
        });

        expect(ws.baseDir).toBe(path.dirname(ws.path));
      }),
    );
  });

  // nonInteractive resolution is tested in cli-flags/service.test.ts
  // preview flag is now in CliFlags, tested there

  describe("resolvePlan", () => {
    type TestOp = Operation<"test-op", Record<string, never>>;
    const testStep: LegacyPlannedStep<TestOp> = {
      _tag: "PlannedJobStep",
      operation: { name: "test-op", args: {} },
      readiness: { status: "ready", message: Option.none() },
      label: "test action",
    };
    const testPlan: LegacyPlan<TestOp> = {
      name: "Test Plan",
      description: Option.none(),
      jobs: [
        {
          steps: [testStep],
          concurrency: 1,
        },
      ],
    };

    const makePlanWithReadiness = (readiness: Readiness): LegacyPlan<TestOp> => ({
      name: "Test Plan",
      description: Option.none(),
      jobs: [
        {
          steps: [
            {
              _tag: "PlannedJobStep" as const,
              operation: { name: "test-op" as const, args: {} },
              readiness,
              label: "test action",
            },
          ],
          concurrency: 1,
        },
      ],
    });

    const testHandlers = {
      "test-op": (_op: TestOp): Effect.Effect<OperationResult> =>
        Effect.succeed({ result: "success" as const, message: "Installed test action" }),
    };

    const runResolvePlan = (
      flags: Partial<CliFlagsService>,
      mockLog: MockOutputService,
      confirmValue = true,
      plan: LegacyPlan<TestOp> = testPlan,
    ) => {
      const logLayer = Layer.succeed(Output, mockLog);
      const [promptLayer, promptMock] = makeInputTestLayer({
        methodBehaviors: {
          confirm: { type: "return", value: confirmValue },
          multiselect: { type: "return", value: [] },
        },
      });
      const flagsLayer = CliFlagsTest(flags);
      const base = Layer.mergeAll(
        NodeServices.layer,
        logLayer,
        promptLayer,
        flagsLayer,
        CliEnvConfig.testDefaults,
      );
      const wsOptions: WorkspaceContextOptions = { scope: "project", agents: Option.none() };
      const wsLayer = Layer.provide(workspaceLayer(wsOptions), base);
      return {
        effect: Effect.gen(function* () {
          const ws = yield* Workspace;
          return yield* ws.resolvePlan(bridgeLegacyPlan(plan, testHandlers));
        }).pipe(Effect.provide(Layer.merge(base, wsLayer))),
        promptMock,
      };
    };

    it.effect("default mode (preview=false) applies without apply confirmation", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: false },
          mockLog,
        );
        const applied = yield* effect;

        // displayPlan logs plan name as info
        expect(logMessages(mockLog, "info")).toContain("Test Plan");
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        // applyPlan returns plan with JobStepResult steps
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
          result: { result: "success", message: "Installed test action" },
        });
      }),
    );

    it.effect("preview prompts then applies when confirmed", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const { effect } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: true },
          mockLog,
          true,
        );
        const applied = yield* effect;

        // Should show preview message
        expect(logMessages(mockLog, "info")).toContainEqual("Previewing changes...");
        // displayPlan logs plan name
        expect(logMessages(mockLog, "info")).toContain("Test Plan");
        // Confirmed preview applies changes
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("preview mode requires apply confirmation", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: true },
          mockLog,
          false,
        );
        const applied = yield* effect;

        // Should show preview message
        expect(logMessages(mockLog, "info")).toContainEqual("Previewing changes...");
        expect(promptConfigs(promptMock, "confirm")).toEqual([{ message: "Apply changes?" }]);
        // Rejected confirmation cancels apply
        expect(applied.jobs).toHaveLength(0);
      }),
    );

    it.effect("preview with --yes applies without prompt", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const { effect } = runResolvePlan(
          { yes: true, nonInteractive: false, preview: true },
          mockLog,
        );
        const applied = yield* effect;

        // Should show preview message
        expect(logMessages(mockLog, "info")).toContainEqual("Previewing changes...");
        // --yes skips apply confirmation in preview mode
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("preview with nonInteractive is a dry-run (returns empty plan)", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const { effect } = runResolvePlan(
          { yes: false, nonInteractive: true, preview: true },
          mockLog,
        );
        const result = yield* effect;

        expect(logMessages(mockLog, "info")).toContainEqual("Previewing changes...");
        expect(result.jobs).toEqual([]);
      }),
    );

    // -------------------------------------------------------------------------
    // --non-interactive implies --yes
    // -------------------------------------------------------------------------

    it.effect("nonInteractive implies yes: preview applies without prompt", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        // nonInteractive=true, yes=false, preview=false
        // Since nonInteractive implies yes, the apply confirmation should be skipped.
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: true, preview: false },
          mockLog,
        );
        const applied = yield* effect;

        // nonInteractive implies yes: no confirmation prompt in default mode
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        // Plan should be applied
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("nonInteractive implies yes: preview with explicit yes applies", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const { effect, promptMock } = runResolvePlan(
          { yes: true, nonInteractive: true, preview: true },
          mockLog,
        );
        const applied = yield* effect;

        // Both nonInteractive and yes: preview applies without prompt
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    // -------------------------------------------------------------------------
    // Readiness gates
    // -------------------------------------------------------------------------

    it.effect("error readiness blocks execution in preview mode", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const errorPlan = makePlanWithReadiness({
          status: "error",
          message: "Skill is required by pack",
        });
        const { effect } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: true },
          mockLog,
          true,
          errorPlan,
        );
        const result = yield* effect.pipe(Effect.flip);

        expect(result).toBeInstanceOf(AppError);
        expect((result as AppError).code).toBe("PLAN_BLOCKED_BY_ERRORS");
        // howToFix suggests --force
        expect(Option.getOrNull((result as AppError).howToFix)).toMatch(/--force/);
        // Plan should have been displayed
        expect(logMessages(mockLog, "info")).toContain("Test Plan");
      }),
    );

    it.effect("error readiness blocks execution in default mode", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const errorPlan = makePlanWithReadiness({
          status: "error",
          message: "Skill is required by pack",
        });
        const { effect } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: false },
          mockLog,
          true,
          errorPlan,
        );
        const result = yield* effect.pipe(Effect.flip);

        expect(result).toBeInstanceOf(AppError);
        expect((result as AppError).code).toBe("PLAN_BLOCKED_BY_ERRORS");
        // howToFix suggests --force
        expect(Option.getOrNull((result as AppError).howToFix)).toMatch(/--force/);
        // Plan should have been displayed even in default mode
        expect(logMessages(mockLog, "info")).toContain("Test Plan");
      }),
    );

    it.effect("error readiness is overridden by --force in default mode", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const errorPlan = makePlanWithReadiness({
          status: "error",
          message: "Skill is required by pack",
        });
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: false, force: true },
          mockLog,
          true,
          errorPlan,
        );
        const result = yield* effect;

        // Errors are downgraded to warnings
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Skill is required by pack"),
        );
        // No confirmation prompt (default mode)
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        // Plan is applied
        const steps = result.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("error readiness is overridden by --force in preview mode", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const errorPlan = makePlanWithReadiness({
          status: "error",
          message: "Skill is required by pack",
        });
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: true, force: true },
          mockLog,
          true,
          errorPlan,
        );
        const result = yield* effect;

        // Errors are downgraded to warnings
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Skill is required by pack"),
        );
        // --force does NOT skip confirmation — preview still prompts
        expect(promptConfigs(promptMock, "confirm")).toHaveLength(1);
        expect(promptConfigs(promptMock, "confirm")[0]).toEqual({ message: "Apply changes?" });
        // Plan is applied (confirm returns true)
        const steps = result.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("warn readiness in preview displays warnings and prompts only for apply", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const warnPlan = makePlanWithReadiness({
          status: "warn",
          message: "Skill has dependents",
        });
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: true },
          mockLog,
          true,
          warnPlan,
        );
        const applied = yield* effect;

        // Warnings are displayed via log.warn, no warn confirmation prompt
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Skill has dependents"),
        );
        // Only apply prompt (no warn prompt)
        expect(promptConfigs(promptMock, "confirm")).toHaveLength(1);
        expect(promptConfigs(promptMock, "confirm")[0]).toEqual({ message: "Apply changes?" });
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("warn readiness in default mode displays warnings and proceeds", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const warnPlan = makePlanWithReadiness({
          status: "warn",
          message: "Skill has dependents",
        });
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: false, preview: false },
          mockLog,
          true,
          warnPlan,
        );
        const applied = yield* effect;

        // No prompts at all — warnings display and proceed
        expect(promptConfigs(promptMock, "confirm")).toHaveLength(0);
        // Warnings are displayed via log.warn
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Skill has dependents"),
        );
        // Should apply without confirmation
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
      }),
    );

    it.effect("warn readiness proceeds regardless of --force", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const warnPlan = makePlanWithReadiness({
          status: "warn",
          message: "Skill has dependents",
        });
        const { effect, promptMock } = runResolvePlan(
          { yes: true, nonInteractive: false, preview: true, force: true },
          mockLog,
          true,
          warnPlan,
        );
        const applied = yield* effect;

        // --force is irrelevant for warnings — no warn prompt either way
        // --yes skips apply prompt in preview mode
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        // Warnings are still displayed
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Skill has dependents"),
        );
        const steps = applied.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("warn readiness in non-interactive preview displays warnings and is no-op", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const warnPlan = makePlanWithReadiness({
          status: "warn",
          message: "Skill has dependents",
        });
        const { effect, promptMock } = runResolvePlan(
          { yes: false, nonInteractive: true, preview: true },
          mockLog,
          true,
          warnPlan,
        );
        const result = yield* effect;

        // Warnings are displayed but don't block
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Skill has dependents"),
        );
        // No prompts — non-interactive
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        // Preview + non-interactive without --yes = display-only (no apply)
        const steps = result.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(0);
      }),
    );

    it.effect("warn readiness in non-interactive default mode proceeds", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const warnPlan = makePlanWithReadiness({
          status: "warn",
          message: "Skill has dependents",
        });
        const { effect, promptMock } = runResolvePlan(
          { yes: true, nonInteractive: true, preview: false },
          mockLog,
          true,
          warnPlan,
        );
        const result = yield* effect;

        // Warnings are displayed
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Skill has dependents"),
        );
        // No prompts — non-interactive + warnings never block
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        // Plan is applied
        const steps = result.jobs.flatMap((j) => j.steps);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    it.effect("warn readiness without --force in default mode proceeds normally", () =>
      Effect.gen(function* () {
        const [, mockLog] = makeOutputTestLayer();
        const warnPlan = makePlanWithReadiness({
          status: "warn",
          message: "Version mismatch",
        });
        const { effect, promptMock } = runResolvePlan(
          // force is deliberately omitted (undefined/false)
          { yes: true, nonInteractive: false, preview: false },
          mockLog,
          true,
          warnPlan,
        );
        const result = yield* effect;

        // No --force needed for warnings — they never block
        expect(promptConfigs(promptMock, "confirm")).toEqual([]);
        expect(logMessages(mockLog, "warn")).toContainEqual(
          expect.stringContaining("Version mismatch"),
        );
        const steps = result.jobs.flatMap((j) => j.steps);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toHaveProperty("result");
      }),
    );

    // Note: Lockfile augmentation (LOCKFILE_INVALID_IGNORED) is now handled
    // by individual handlers before calling resolvePlan, not by resolvePlan itself.
  });

  /** Default options for tests that don't care about prompting/preview. */
  const defaultOptions: WorkspaceContextOptions = {
    scope: "project",
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
          sources: [
            { name: "my-registry", type: "registry", location: "https://registry.example.com" },
          ],
        });
        writeSettingsTo(homeDir, {
          sources: [
            { name: "corp-registry", type: "registry", location: "https://corp.example.com" },
          ],
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
          sources: [
            { name: "custom", type: "registry", location: new URL("https://r.example.com") },
          ],
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

  describe("getRegistrySourceHosts", () => {
    it.effect("returns empty when no registry sources configured", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySourceHosts();

        // Built-in sources are github/gitlab/bitbucket, none are registry type
        expect(sources).toHaveLength(0);
      }),
    );

    it.effect("returns all configured registry sources", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "r1",
              type: "registry",
              location: new URL("https://r1.example.com"),
            },
            {
              name: "r2",
              type: "registry",
              location: new URL("https://r2.example.com"),
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySourceHosts();

        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["r1", "r2"]);
      }),
    );

    it.effect("returns all registry sources without namespace filtering", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "corp-reg",
              type: "registry",
              location: new URL("https://corp.example.com"),
            },
            {
              name: "public-reg",
              type: "registry",
              location: new URL("https://public.example.com"),
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySourceHosts();

        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["corp-reg", "public-reg"]);
      }),
    );
  });

  describe("getConfiguredNamespace", () => {
    it.effect("returns project namespace when configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          namespace: "@myorg",
        });

        const ws = yield* getService(defaultOptions);
        const namespace = yield* ws.getConfiguredNamespace();

        expect(namespace).toBe("@myorg");
      }),
    );

    it.effect("returns global namespace when project namespace not configured", () =>
      Effect.gen(function* () {
        // Project has no namespace
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        // Global has namespace
        writeSettingsTo(homeDir, {
          namespace: "@globalorg",
        });

        const ws = yield* getService(defaultOptions);
        const namespace = yield* ws.getConfiguredNamespace();

        expect(namespace).toBe("@globalorg");
      }),
    );

    it.effect("normalizes bare namespace by prepending @", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          namespace: "myorg",
        });

        const ws = yield* getService(defaultOptions);
        const namespace = yield* ws.getConfiguredNamespace();

        expect(namespace).toBe("@myorg");
      }),
    );

    it.effect("returns @community when no namespace configured anywhere", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        // No user-scope settings (readSettingsSafe returns defaults)

        const ws = yield* getService(defaultOptions);
        const namespace = yield* ws.getConfiguredNamespace();

        expect(namespace).toBe("@community");
      }),
    );
  });

  describe("getDefaultNamespace", () => {
    it.effect("returns Option.some with project namespace when configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          namespace: "@myorg",
        });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getDefaultNamespace();

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe("@myorg");
      }),
    );

    it.effect("returns Option.some with user namespace when project has none", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeSettingsTo(homeDir, {
          namespace: "@globalorg",
        });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getDefaultNamespace();

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe("@globalorg");
      }),
    );

    it.effect("returns Option.none when neither project nor user has namespace", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getDefaultNamespace();

        expect(Option.isNone(result)).toBe(true);
      }),
    );

    it.effect("normalizes bare namespace by prepending @", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          namespace: "myorg",
        });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getDefaultNamespace();

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe("@myorg");
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
          location: new URL("https://registry.example.com"),
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
          location: new URL("https://new.example.com"),
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
    commands?: Record<string, unknown>,
    mcpServers?: Record<string, unknown>,
  ) => {
    const axmDir = path.join(dir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    const lockfileData: Record<string, unknown> = { lockfileVersion: 1, skills };
    if (packs !== undefined) {
      lockfileData["packs"] = packs;
    }
    if (commands !== undefined) {
      lockfileData["commands"] = commands;
    }
    if (mcpServers !== undefined) {
      lockfileData["mcpServers"] = mcpServers;
    }
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfileData));
  };

  /** Read lockfile from disk for verification. */
  const readLockfileFromDisk = (dir: string) =>
    YAML.parse(fs.readFileSync(path.join(dir, ".axm", "axm-lock.yaml"), "utf-8")) as {
      lockfileVersion: number;
      skills: Record<string, unknown>;
      packs?: Record<string, unknown>;
      commands?: Record<string, unknown>;
      mcpServers?: Record<string, unknown>;
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

  describe("getLockfileState", () => {
    it.effect("returns missing when lockfile file is absent", () =>
      Effect.gen(function* () {
        fs.rmSync(path.join(projectDir, ".axm", "axm-lock.yaml"), { force: true });

        const ws = yield* getService(defaultOptions);
        const state = yield* ws.getLockfileState();

        expect(state).toBe("missing");
      }),
    );

    it.effect("returns invalid when lockfile cannot be parsed", () =>
      Effect.gen(function* () {
        fs.writeFileSync(path.join(projectDir, ".axm", "axm-lock.yaml"), "lockfileVersion: [");

        const ws = yield* getService(defaultOptions);
        const state = yield* ws.getLockfileState();

        expect(state).toBe("invalid");
      }),
    );

    it.effect("returns ok for valid lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const state = yield* ws.getLockfileState();

        expect(state).toBe("ok");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  describe("getInstalledSkills", () => {
    it.effect("returns normalized installed skills when skills are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review", "test-gen": "local:/tmp/test-gen" },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(skills).toEqual({
          "code-review": {
            lifecycle: "configured",
            source: "github:acme/code-review",
            enabled: true,
            packagingKind: "non-native",
            isBuiltIn: false,
          },
          "test-gen": {
            lifecycle: "configured",
            source: "local:/tmp/test-gen",
            enabled: true,
            packagingKind: "non-native",
            isBuiltIn: false,
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
          namespace: "@acme",
          name: "tool",
          resolvedVersion: "1.2.3",
          integrity: "sha512-AAAA==",
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
        expect(settings.skills.tool).toBe("@acme/skills/tool@^1.0.0");
      }),
    );

    it.effect("omits version constraint in settings when none provided", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          namespace: "@acme",
          name: "tool",
          resolvedVersion: "1.2.3",
          integrity: "sha512-AAAA==",
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
        expect(settings.skills.tool).toBe("@acme/skills/tool");
      }),
    );

    it.effect("preserves exact pin version constraint", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          namespace: "@acme",
          name: "tool",
          resolvedVersion: "1.2.3",
          integrity: "sha512-AAAA==",
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
        expect(settings.skills.tool).toBe("@acme/skills/tool@1.2.3");
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

    it.effect("removes lockfile-only skill when not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeLockfileTo(projectDir, {
          implicit: {
            type: "local",
            path: "/tmp/implicit",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkill("implicit");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toBeUndefined();

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).not.toHaveProperty("implicit");
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

    it.effect("fails with AppError for invalid agent ID", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.addConfiguredAgent("invalid-agent-xyz").pipe(Effect.flip);

        expect(result).toBeInstanceOf(AppError);
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
      flags: Partial<CliFlagsService>,
      multiselectBehavior?: { type: "return"; indices: readonly number[] } | { type: "cancel" },
    ) => {
      const [logLayer] = makeOutputTestLayer();
      const [promptLayer, promptMock] = makeInputTestLayer({
        methodBehaviors: {
          confirm: { type: "return", value: true },
          multiselect: multiselectBehavior
            ? multiselectBehavior.type === "cancel"
              ? { type: "cancel" }
              : { type: "return", value: [] }
            : { type: "return", value: [] },
        },
      });
      const flagsLayer = CliFlagsTest(flags);
      const wsOptions: WorkspaceContextOptions = { scope: "project", agents: Option.none() };
      const base = Layer.mergeAll(
        NodeServices.layer,
        logLayer,
        promptLayer,
        flagsLayer,
        CliEnvConfig.testDefaults,
      );
      const wsLayer = Layer.provide(workspaceLayer(wsOptions), base);
      return {
        run: Workspace.asEffect().pipe(Effect.provide(wsLayer)),
        promptMock,
      };
    };

    it.effect("interactive mode calls multiselect directly (no select prompt)", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        const { run, promptMock } = getServiceWithInit(
          { yes: false, nonInteractive: false, preview: false },
          { type: "return", indices: [] },
        );

        yield* run;

        // Should have called multiselect once (no select prompt)
        const multiselectCalls = promptConfigs(promptMock, "multiselect");
        expect(multiselectCalls).toHaveLength(1);
        expect(multiselectCalls[0]).toEqual(
          expect.objectContaining({ message: "Select agents to configure" }),
        );
      }),
    );

    it.effect("--non-interactive auto-selects detected agents without prompting", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        // Create .claude dir in project to trigger detection
        fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

        const { run, promptMock } = getServiceWithInit({
          yes: false,
          nonInteractive: true,
          preview: false,
        });

        const ws = yield* run;
        const agents = yield* ws.getConfiguredAgents();

        // --non-interactive skips prompting entirely
        expect(promptConfigs(promptMock, "multiselect")).toHaveLength(0);
        // claude-code should be auto-selected via project-level detection
        expect(agents).toContain("claude-code");
      }),
    );

    it.effect("--yes still prompts for agent selection", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        // Create .claude dir in project to trigger detection
        fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

        const { run, promptMock } = getServiceWithInit({
          yes: true,
          nonInteractive: false,
          preview: false,
        });

        yield* run;

        // --yes alone does not skip selection prompts
        expect(promptConfigs(promptMock, "multiselect")).toHaveLength(1);
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
            namespace: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
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
          refType: "registry",
          namespace: "@corp",
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
        const paths = yield* ws.getSkillDir("code-review", { refType: "git-hosted" });

        expect(paths.canonicalPath).toContain(".axm/extensions/external/skills/code-review");
        expect(paths.skillSrcPath).toBe(paths.canonicalPath);
      }),
    );

    it.effect("name-only with missing lock entry fails with SKILL_NOT_LOCKED", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getSkillDir("nonexistent").pipe(Effect.flip);

        expect(result).toBeInstanceOf(AppError);
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
          location: new URL("https://registry.example.com"),
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
    it.effect("returns all configured entries normalized", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "my-linter": { source: "github:acme/linter", enabled: false },
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getConfiguredSkills();

        expect(Object.keys(skills)).toEqual(["code-review", "my-linter"]);

        // String entry normalizes to enabled with source + metadata
        expect(skills["code-review"]).toEqual({
          source: "github:acme/code-review",
          enabled: true,
          packagingKind: "non-native",
          isBuiltIn: false,
        });

        // Object entry normalizes to disabled with source + metadata
        expect(skills["my-linter"]).toEqual({
          source: "github:acme/linter",
          enabled: false,
          packagingKind: "non-native",
          isBuiltIn: false,
        });
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
  // getInstalledSkills (normalized taxonomy shapes)
  // ---------------------------------------------------------------------------

  describe("getInstalledSkills (normalized)", () => {
    it.effect("returns all configured entries as NormalizedSkillEntry", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "my-linter": { source: "github:acme/linter", enabled: false },
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(Object.keys(skills)).toEqual(["code-review", "my-linter"]);

        expect(skills["code-review"]).toEqual({
          lifecycle: "configured",
          source: "github:acme/code-review",
          enabled: true,
          packagingKind: "non-native",
          isBuiltIn: false,
        });

        expect(skills["my-linter"]).toEqual({
          lifecycle: "configured",
          source: "github:acme/linter",
          enabled: false,
          packagingKind: "non-native",
          isBuiltIn: false,
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

    it.effect("configured entries have source as string", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        for (const entry of Object.values(skills)) {
          if (entry.lifecycle === "configured") {
            expect(typeof entry.source).toBe("string");
          }
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

    it.effect("fails with AppError for missing skill name", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"], skills: {} });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws
          .updateSkillEntry("nonexistent", (entry) => entry)
          .pipe(Effect.flip);

        expect(result).toBeInstanceOf(AppError);
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

    it.effect("fails with AppError when old name does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"], skills: {} });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.renameSkill("nonexistent", "new-name").pipe(Effect.flip);

        expect(result).toBeInstanceOf(AppError);
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

    it.effect("fails with AppError when lock entry does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws
          .updateLockEntryAgents("nonexistent", ["claude-code"])
          .pipe(Effect.flip);

        expect(result).toBeInstanceOf(AppError);
        expect(result.code).toBe("LOCK_ENTRY_NOT_FOUND");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Pack methods
  // ---------------------------------------------------------------------------

  /** Create sample SetPackArgs for testing. */
  const makeSampleSetPackArgs = (overrides?: Partial<SetPackArgs>): SetPackArgs => ({
    namespace: "@acme",
    name: "starter-pack",
    resolvedVersion: "1.0.0",
    integrity: "sha512-AAAA==",
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
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getConfiguredPacks();

        expect(packs).toEqual({
          "starter-pack": {
            source: "@acme/packs/starter-pack",
            packagingKind: "native",
            isBuiltIn: false,
          },
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
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getInstalledPacks();

        expect(packs).toEqual({
          "starter-pack": {
            lifecycle: "configured",
            source: "@acme/packs/starter-pack",
            packagingKind: "native",
            isBuiltIn: false,
          },
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
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "@acme/skills/code-review": "1.2.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getLockedPacks();

        expect(Object.keys(packs)).toEqual(["starter-pack"]);
        expect(packs["starter-pack"]?.type).toBe("registry");
        expect(packs["starter-pack"]?.resolvedSkills).toEqual({
          "@acme/skills/code-review": "1.2.0",
        });
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
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
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
        expect(settings.packs["starter-pack"]).toBe("@acme/packs/starter-pack");

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
            "starter-pack": "@acme/packs/starter-pack",
            "other-pack": "@acme/packs/other-pack",
          },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
            "other-pack": {
              type: "registry",
              namespace: "@acme",
              name: "other-pack",
              resolvedVersion: "2.0.0",
              integrity: "sha512-CCCC==",
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
          packs: { "other-pack": "@acme/packs/other-pack" },
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
    it.effect("returns registry extensions path with namespace", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getPackDir("starter-pack", "@acme");

        expect(result.canonicalPath).toContain(".axm/extensions/@acme/packs/starter-pack");
      }),
    );

    it.effect("handles different namespaces correctly", () =>
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

  describe("getInstalledSkills (taxonomy)", () => {
    it.effect("lockfile-only native skill appears as implicit", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "registry",
            namespace: "@acme",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(skills).toHaveProperty("code-review");
        expect(skills["code-review"]!.lifecycle).toBe("implicit");
      }),
    );

    it.effect("configured entry takes precedence over lockfile-only", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "registry",
            namespace: "@acme",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        expect(skills["code-review"]!.lifecycle).toBe("configured");
      }),
    );

    it.effect("getConfiguredSkills only returns direct settings entries", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
        });
        writeLockfileTo(projectDir, {
          "my-skill": {
            type: "registry",
            namespace: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "implicit-skill": {
            type: "registry",
            namespace: "@acme",
            name: "implicit-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-BBBB==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const configured = yield* ws.getConfiguredSkills();

        expect(Object.keys(configured)).toEqual(["my-skill"]);
        expect(configured).not.toHaveProperty("implicit-skill");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Taxonomy getter contracts (skills)
  // ---------------------------------------------------------------------------

  describe("getImplicitSkills", () => {
    it.effect("returns lockfile-only native skills as implicit", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {
          "implicit-skill": {
            type: "registry",
            namespace: "@acme",
            name: "implicit-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitSkills();

        expect(Object.keys(implicit)).toEqual(["implicit-skill"]);
        expect(implicit["implicit-skill"]).toEqual({
          source: Option.none(),
          enabled: true,
          packagingKind: "native",
          isBuiltIn: false,
        });
      }),
    );

    it.effect("excludes configured skills from implicit set", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "@acme/skills/my-skill" },
        });
        writeLockfileTo(projectDir, {
          "my-skill": {
            type: "registry",
            namespace: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitSkills();

        expect(implicit).toEqual({});
      }),
    );

    it.effect("returns empty when no lockfile-only native skills", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitSkills();

        expect(implicit).toEqual({});
      }),
    );
  });

  describe("getUnmanagedSkills", () => {
    it.effect("returns empty when no unmanaged skills detected", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const unmanaged = yield* ws.getUnmanagedSkills();

        expect(unmanaged).toEqual({});
      }),
    );
  });

  describe("getClassifiedSkills", () => {
    it.effect("returns all configured and implicit skills with lifecycle tag", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
        });
        writeLockfileTo(projectDir, {
          "my-skill": {
            type: "github",
            owner: "acme",
            repo: "my-skill",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "implicit-skill": {
            type: "registry",
            namespace: "@acme",
            name: "implicit-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-BBBB==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const classified = yield* ws.getClassifiedSkills();

        expect(classified["my-skill"]!.lifecycle).toBe("configured");
        expect(classified["implicit-skill"]!.lifecycle).toBe("implicit");
      }),
    );
  });

  describe("getConfiguredExternalSkills", () => {
    it.effect("returns only non-native configured skills", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "native-skill": "@acme/skills/native-skill",
            "external-skill": "github:acme/external-skill",
          },
        });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getConfiguredExternalSkills();

        expect(Object.keys(external)).toEqual(["external-skill"]);
        expect(external["external-skill"]!.packagingKind).toBe("non-native");
      }),
    );
  });

  describe("getUnmanagedExternalSkills", () => {
    it.effect("returns empty when no unmanaged skills", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getUnmanagedExternalSkills();

        expect(external).toEqual({});
      }),
    );
  });

  describe("getIgnoredSkillPatterns", () => {
    it.effect("returns configured ignored patterns", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          ignored: { skills: ["test-*", "deprecated-tool"] },
        });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredSkillPatterns();

        expect(patterns).toEqual(["test-*", "deprecated-tool"]);
      }),
    );

    it.effect("returns empty array when no ignored patterns configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredSkillPatterns();

        expect(patterns).toEqual([]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Taxonomy getter contracts (commands)
  // ---------------------------------------------------------------------------

  describe("getConfiguredCommands (taxonomy)", () => {
    it.effect("returns configured commands with source metadata", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: { "my-cmd": "github:acme/my-cmd" },
        });

        const ws = yield* getService(defaultOptions);
        const commands = yield* ws.getConfiguredCommands();

        expect(commands["my-cmd"]).toEqual({
          source: "github:acme/my-cmd",
          enabled: true,
          packagingKind: "non-native",
          isBuiltIn: false,
        });
      }),
    );

    it.effect("returns empty record when no commands configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const commands = yield* ws.getConfiguredCommands();

        expect(commands).toEqual({});
      }),
    );
  });

  describe("getImplicitCommands", () => {
    it.effect("returns lockfile-only native commands as implicit", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {}, undefined, {
          "implicit-cmd": {
            type: "registry",
            namespace: "@acme",
            name: "implicit-cmd",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitCommands();

        expect(Object.keys(implicit)).toEqual(["implicit-cmd"]);
        expect(implicit["implicit-cmd"]).toEqual({
          source: Option.none(),
          enabled: true,
          packagingKind: "native",
          isBuiltIn: false,
        });
      }),
    );

    it.effect("returns empty when no lockfile-only commands", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitCommands();

        expect(implicit).toEqual({});
      }),
    );
  });

  describe("getUnmanagedCommands", () => {
    it.effect("returns empty (phase 1 - no command unmanaged detection)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const unmanaged = yield* ws.getUnmanagedCommands();

        expect(unmanaged).toEqual({});
      }),
    );
  });

  describe("getInstalledCommands", () => {
    it.effect("includes both configured and implicit commands", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: { "configured-cmd": "github:acme/configured-cmd" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "configured-cmd": {
            type: "github",
            owner: "acme",
            repo: "configured-cmd",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "implicit-cmd": {
            type: "registry",
            namespace: "@acme",
            name: "implicit-cmd",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const installed = yield* ws.getInstalledCommands();

        expect(installed["configured-cmd"]!.lifecycle).toBe("configured");
        expect(installed["implicit-cmd"]!.lifecycle).toBe("implicit");
      }),
    );
  });

  describe("getClassifiedCommands", () => {
    it.effect("returns all classified commands with lifecycle tags", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: { "my-cmd": "github:acme/my-cmd" },
        });

        const ws = yield* getService(defaultOptions);
        const classified = yield* ws.getClassifiedCommands();

        expect(classified["my-cmd"]!.lifecycle).toBe("configured");
      }),
    );
  });

  describe("getConfiguredExternalCommands", () => {
    it.effect("returns only non-native configured commands", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: {
            "native-cmd": "@acme/commands/native-cmd",
            "external-cmd": "github:acme/external-cmd",
          },
        });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getConfiguredExternalCommands();

        expect(Object.keys(external)).toEqual(["external-cmd"]);
      }),
    );
  });

  describe("getUnmanagedExternalCommands", () => {
    it.effect("returns empty (phase 1)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getUnmanagedExternalCommands();

        expect(external).toEqual({});
      }),
    );
  });

  describe("getIgnoredCommandPatterns", () => {
    it.effect("returns configured ignored command patterns", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          ignored: { commands: ["debug-*"] },
        });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredCommandPatterns();

        expect(patterns).toEqual(["debug-*"]);
      }),
    );

    it.effect("returns empty array when no ignored patterns", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredCommandPatterns();

        expect(patterns).toEqual([]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Taxonomy getter contracts (MCP servers)
  // ---------------------------------------------------------------------------

  describe("getConfiguredMcpServers (taxonomy)", () => {
    it.effect("returns configured MCP servers with source metadata", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });

        const ws = yield* getService(defaultOptions);
        const servers = yield* ws.getConfiguredMcpServers();

        expect(servers["my-mcp"]).toEqual({
          source: "github:acme/my-mcp",
          packagingKind: "non-native",
          isBuiltIn: false,
        });
      }),
    );

    it.effect("returns empty record when no MCP servers configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const servers = yield* ws.getConfiguredMcpServers();

        expect(servers).toEqual({});
      }),
    );
  });

  describe("getImplicitMcpServers", () => {
    it.effect("returns lockfile-only native MCP servers as implicit", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "implicit-mcp": {
            type: "registry",
            namespace: "@acme",
            name: "implicit-mcp",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitMcpServers();

        expect(Object.keys(implicit)).toEqual(["implicit-mcp"]);
        expect(implicit["implicit-mcp"]).toEqual({
          source: Option.none(),
          packagingKind: "native",
          isBuiltIn: false,
        });
      }),
    );

    it.effect("returns empty when no lockfile-only MCP servers", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitMcpServers();

        expect(implicit).toEqual({});
      }),
    );
  });

  describe("getUnmanagedMcpServers", () => {
    it.effect("returns empty (phase 1 - no MCP server unmanaged detection)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const unmanaged = yield* ws.getUnmanagedMcpServers();

        expect(unmanaged).toEqual({});
      }),
    );
  });

  describe("getInstalledMcpServers", () => {
    it.effect("includes both configured and implicit MCP servers", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "configured-mcp": "github:acme/configured-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "configured-mcp": {
            type: "github",
            owner: "acme",
            repo: "configured-mcp",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "implicit-mcp": {
            type: "registry",
            namespace: "@acme",
            name: "implicit-mcp",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const installed = yield* ws.getInstalledMcpServers();

        expect(installed["configured-mcp"]!.lifecycle).toBe("configured");
        expect(installed["implicit-mcp"]!.lifecycle).toBe("implicit");
      }),
    );
  });

  describe("getClassifiedMcpServers", () => {
    it.effect("returns all classified MCP servers with lifecycle tags", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });

        const ws = yield* getService(defaultOptions);
        const classified = yield* ws.getClassifiedMcpServers();

        expect(classified["my-mcp"]!.lifecycle).toBe("configured");
      }),
    );
  });

  describe("getConfiguredExternalMcpServers", () => {
    it.effect("returns only non-native configured MCP servers", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: {
            "native-mcp": "@acme/mcp-servers/native-mcp",
            "external-mcp": "github:acme/external-mcp",
          },
        });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getConfiguredExternalMcpServers();

        expect(Object.keys(external)).toEqual(["external-mcp"]);
      }),
    );
  });

  describe("getUnmanagedExternalMcpServers", () => {
    it.effect("returns empty (phase 1)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getUnmanagedExternalMcpServers();

        expect(external).toEqual({});
      }),
    );
  });

  describe("getIgnoredMcpServerPatterns", () => {
    it.effect("returns configured ignored MCP server patterns", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          ignored: { mcpServers: ["test-*"] },
        });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredMcpServerPatterns();

        expect(patterns).toEqual(["test-*"]);
      }),
    );

    it.effect("returns empty array when no ignored patterns", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredMcpServerPatterns();

        expect(patterns).toEqual([]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Taxonomy getter contracts (packs)
  // ---------------------------------------------------------------------------

  describe("getImplicitPacks", () => {
    it.effect("returns lockfile-only packs as implicit", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(
          projectDir,
          {},
          {
            "@axm/packs/axm-builtin": {
              type: "builtin",
              namespace: "@axm",
              name: "axm-builtin",
              resolvedVersion: "1.0.0",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitPacks();

        expect(Object.keys(implicit)).toEqual(["@axm/packs/axm-builtin"]);
        expect(implicit["@axm/packs/axm-builtin"]).toEqual({
          source: Option.none(),
          packagingKind: "native",
          isBuiltIn: true,
        });
      }),
    );

    it.effect("returns empty when no lockfile-only packs", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const implicit = yield* ws.getImplicitPacks();

        expect(implicit).toEqual({});
      }),
    );
  });

  describe("getUnmanagedPacks", () => {
    it.effect("returns empty (phase 1 - no pack unmanaged detection)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const unmanaged = yield* ws.getUnmanagedPacks();

        expect(unmanaged).toEqual({});
      }),
    );
  });

  describe("getInstalledPacks (taxonomy)", () => {
    it.effect("includes lockfile-only implicit packs (builtin)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(
          projectDir,
          {},
          {
            "@axm/packs/axm-builtin": {
              type: "builtin",
              namespace: "@axm",
              name: "axm-builtin",
              resolvedVersion: "1.0.0",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const installed = yield* ws.getInstalledPacks();

        expect(installed["@axm/packs/axm-builtin"]!.lifecycle).toBe("implicit");
        expect(installed["@axm/packs/axm-builtin"]!.isBuiltIn).toBe(true);
      }),
    );

    it.effect("includes both configured and implicit packs", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "my-pack": "@acme/packs/my-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "my-pack": {
              type: "registry",
              namespace: "@acme",
              name: "my-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
            "@axm/packs/axm-builtin": {
              type: "builtin",
              namespace: "@axm",
              name: "axm-builtin",
              resolvedVersion: "1.0.0",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const installed = yield* ws.getInstalledPacks();

        expect(installed["my-pack"]!.lifecycle).toBe("configured");
        expect(installed["@axm/packs/axm-builtin"]!.lifecycle).toBe("implicit");
      }),
    );
  });

  describe("getClassifiedPacks", () => {
    it.effect("returns all classified packs with lifecycle tags", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "my-pack": "@acme/packs/my-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const classified = yield* ws.getClassifiedPacks();

        expect(classified["my-pack"]!.lifecycle).toBe("configured");
      }),
    );
  });

  describe("getConfiguredExternalPacks", () => {
    it.effect("returns empty (packs are native-only)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "my-pack": "@acme/packs/my-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getConfiguredExternalPacks();

        expect(external).toEqual({});
      }),
    );
  });

  describe("getUnmanagedExternalPacks", () => {
    it.effect("returns empty (phase 1 + packs native-only)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const external = yield* ws.getUnmanagedExternalPacks();

        expect(external).toEqual({});
      }),
    );
  });

  describe("getIgnoredPackPatterns", () => {
    it.effect("returns configured ignored pack patterns", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          ignored: { packs: ["legacy-*"] },
        });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredPackPatterns();

        expect(patterns).toEqual(["legacy-*"]);
      }),
    );

    it.effect("returns empty array when no ignored patterns", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const patterns = yield* ws.getIgnoredPackPatterns();

        expect(patterns).toEqual([]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // MCP settings API consistency (camelCase)
  // ---------------------------------------------------------------------------

  describe("MCP settings API camelCase consistency", () => {
    it.effect("setMcpServer writes to mcpServers key in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServer({
          name: "my-mcp",
          lockEntry: {
            type: "github" as const,
            owner: "acme",
            repo: "my-mcp",
            installedAt: new Date("2025-01-01T00:00:00.000Z"),
            updatedAt: new Date("2025-01-01T00:00:00.000Z"),
          },
        });

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings).toHaveProperty("mcpServers");
        expect(settings["mcpServers"]).toHaveProperty("my-mcp");
      }),
    );

    it.effect("removeMcpServer reads from mcpServers key in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp": {
            type: "github",
            owner: "acme",
            repo: "my-mcp",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("my-mcp");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).not.toHaveProperty("my-mcp");
      }),
    );

    it.effect("getConfiguredMcpServers reads from mcpServers key", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });

        const ws = yield* getService(defaultOptions);
        const servers = yield* ws.getConfiguredMcpServers();

        expect(servers).toHaveProperty("my-mcp");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Taxonomy shapes: no managed marker
  // ---------------------------------------------------------------------------

  describe("taxonomy shapes have no managed marker", () => {
    it.effect("getConfiguredSkills entries have no managed field", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getConfiguredSkills();

        for (const entry of Object.values(skills)) {
          expect(entry).not.toHaveProperty("managed");
        }
      }),
    );

    it.effect("getInstalledSkills entries have no managed field", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getInstalledSkills();

        for (const entry of Object.values(skills)) {
          expect(entry).not.toHaveProperty("managed");
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Command methods
  // ---------------------------------------------------------------------------

  /** Create a sample CommandLockEntry for testing. */
  const makeSampleCommandLockEntry = (): CommandLockEntry => ({
    type: "github" as const,
    owner: "acme",
    repo: "my-command",
    installedAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  });

  /** Create sample SetCommandArgs for testing. */
  const makeSampleSetCommandArgs = (overrides?: Partial<SetCommandArgs>): SetCommandArgs => ({
    name: "my-command",
    lockEntry: makeSampleCommandLockEntry(),
    ...overrides,
  });

  describe("getLockedCommands", () => {
    it.effect("returns commands lock map when lock entries are present", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, {
          "my-command": {
            type: "github",
            owner: "acme",
            repo: "my-command",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const commands = yield* ws.getLockedCommands();

        expect(Object.keys(commands)).toEqual(["my-command"]);
        expect(commands["my-command"]?.type).toBe("github");
      }),
    );

    it.effect("returns empty record when no command lock entries", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const commands = yield* ws.getLockedCommands();

        expect(commands).toEqual({});
      }),
    );
  });

  describe("getLockedCommand", () => {
    it.effect("returns Option.some when command exists in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, {
          "my-command": {
            type: "github",
            owner: "acme",
            repo: "my-command",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedCommand("my-command");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.type).toBe("github");
        }
      }),
    );

    it.effect("returns Option.none when command not in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedCommand("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }),
    );
  });

  describe("setCommand", () => {
    it.effect("installs new command: adds to settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setCommand(makeSampleSetCommandArgs());

        // Verify settings on disk
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).toBeDefined();
        expect(settings.commands["my-command"]).toBe("github:acme/my-command");

        // Verify lockfile on disk
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).toHaveProperty("my-command");
        expect((lockfile.commands!["my-command"] as { type: string }).type).toBe("github");
      }),
    );

    it.effect("sets updatedAt to current time", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const before = new Date();
        const ws = yield* getService(defaultOptions);
        yield* ws.setCommand(makeSampleSetCommandArgs());
        const after = new Date();

        const lockfile = readLockfileFromDisk(projectDir);
        const updatedAt = new Date(
          (lockfile.commands!["my-command"] as { updatedAt: string }).updatedAt,
        );
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }),
    );

    it.effect("updates existing command: replaces in settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: { "my-command": "github:acme/my-command" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-command": {
            type: "github",
            owner: "acme",
            repo: "my-command",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const updatedEntry: CommandLockEntry = {
          type: "github",
          owner: "acme",
          repo: "my-command-v2",
          installedAt: new Date("2025-01-01T00:00:00.000Z"),
          updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        };
        yield* ws.setCommand({
          name: "my-command",
          lockEntry: updatedEntry,
        });

        // Verify settings updated
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands["my-command"]).toBe("github:acme/my-command-v2");

        // Verify lockfile updated
        const lockfile = readLockfileFromDisk(projectDir);
        expect((lockfile.commands!["my-command"] as { repo: string }).repo).toBe("my-command-v2");
      }),
    );
  });

  describe("setCommandLock", () => {
    it.effect("writes to lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setCommandLock(makeSampleSetCommandArgs());

        // Settings should NOT have commands
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).toBeUndefined();

        // Lockfile should have the command
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).toHaveProperty("my-command");
        expect((lockfile.commands!["my-command"] as { type: string }).type).toBe("github");
      }),
    );
  });

  describe("removeCommand", () => {
    it.effect("removes existing command from both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: {
            "my-command": "github:acme/my-command",
            "other-command": "local:/tmp/other",
          },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-command": {
            type: "github",
            owner: "acme",
            repo: "my-command",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "other-command": {
            type: "local",
            path: "/tmp/other",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeCommand("my-command");

        // Verify settings: my-command removed, other-command remains
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).not.toHaveProperty("my-command");
        expect(settings.commands).toHaveProperty("other-command");

        // Verify lockfile: my-command removed, other-command remains
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).not.toHaveProperty("my-command");
        expect(lockfile.commands).toHaveProperty("other-command");
      }),
    );

    it.effect("no-op when command does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: { "other-command": "local:/tmp/other" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "other-command": {
            type: "local",
            path: "/tmp/other",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeCommand("nonexistent");

        // Verify nothing changed
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).toHaveProperty("other-command");
        expect(Object.keys(settings.commands as Record<string, string>)).toHaveLength(1);

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).toHaveProperty("other-command");
        expect(Object.keys(lockfile.commands!)).toHaveLength(1);
      }),
    );

    it.effect("removes lockfile-only command when not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeLockfileTo(projectDir, {}, undefined, {
          implicit: {
            type: "local",
            path: "/tmp/implicit-cmd",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeCommand("implicit");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).toBeUndefined();

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).not.toHaveProperty("implicit");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // MCP Server methods
  // ---------------------------------------------------------------------------

  /** Create a sample McpServerLockEntry for testing. */
  const makeSampleMcpServerLockEntry = (): McpServerLockEntry => ({
    type: "github" as const,
    owner: "acme",
    repo: "my-mcp-server",
    installedAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  });

  /** Create sample SetMcpServerArgs for testing. */
  const makeSampleSetMcpServerArgs = (overrides?: Partial<SetMcpServerArgs>): SetMcpServerArgs => ({
    name: "my-mcp-server",
    lockEntry: makeSampleMcpServerLockEntry(),
    ...overrides,
  });

  describe("getLockedMcpServers", () => {
    it.effect("returns mcp servers lock map when lock entries are present", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const mcpServers = yield* ws.getLockedMcpServers();

        expect(Object.keys(mcpServers)).toEqual(["my-mcp-server"]);
        expect(mcpServers["my-mcp-server"]?.type).toBe("github");
      }),
    );

    it.effect("returns empty record when no mcp server lock entries", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const mcpServers = yield* ws.getLockedMcpServers();

        expect(mcpServers).toEqual({});
      }),
    );
  });

  describe("getLockedMcpServer", () => {
    it.effect("returns Option.some when mcp server exists in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedMcpServer("my-mcp-server");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.type).toBe("github");
        }
      }),
    );

    it.effect("returns Option.none when mcp server not in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedMcpServer("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }),
    );
  });

  describe("setMcpServer", () => {
    it.effect("installs new mcp server: adds to settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServer(makeSampleSetMcpServerArgs());

        // Verify settings on disk
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).toBeDefined();
        expect(settings["mcpServers"]["my-mcp-server"]).toBe("github:acme/my-mcp-server");

        // Verify lockfile on disk
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("my-mcp-server");
        expect((lockfile.mcpServers!["my-mcp-server"] as { type: string }).type).toBe("github");
      }),
    );

    it.effect("sets updatedAt to current time", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const before = new Date();
        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServer(makeSampleSetMcpServerArgs());
        const after = new Date();

        const lockfile = readLockfileFromDisk(projectDir);
        const updatedAt = new Date(
          (lockfile.mcpServers!["my-mcp-server"] as { updatedAt: string }).updatedAt,
        );
        expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }),
    );

    it.effect("updates existing mcp server: replaces in settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp-server": "github:acme/my-mcp-server" },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        const updatedEntry: McpServerLockEntry = {
          type: "github",
          owner: "acme",
          repo: "my-mcp-server-v2",
          installedAt: new Date("2025-01-01T00:00:00.000Z"),
          updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        };
        yield* ws.setMcpServer({
          name: "my-mcp-server",
          lockEntry: updatedEntry,
        });

        // Verify settings updated
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]["my-mcp-server"]).toBe("github:acme/my-mcp-server-v2");

        // Verify lockfile updated
        const lockfile = readLockfileFromDisk(projectDir);
        expect((lockfile.mcpServers!["my-mcp-server"] as { repo: string }).repo).toBe(
          "my-mcp-server-v2",
        );
      }),
    );
  });

  describe("setMcpServerLock", () => {
    it.effect("writes to lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServerLock(makeSampleSetMcpServerArgs());

        // Settings should NOT have mcp-servers
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).toBeUndefined();

        // Lockfile should have the mcp server
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("my-mcp-server");
        expect((lockfile.mcpServers!["my-mcp-server"] as { type: string }).type).toBe("github");
      }),
    );
  });

  describe("removeMcpServer", () => {
    it.effect("removes existing mcp server from both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: {
            "my-mcp-server": "github:acme/my-mcp-server",
            "other-server": "local:/tmp/other",
          },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          "other-server": {
            type: "local",
            path: "/tmp/other",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("my-mcp-server");

        // Verify settings: my-mcp-server removed, other-server remains
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).not.toHaveProperty("my-mcp-server");
        expect(settings["mcpServers"]).toHaveProperty("other-server");

        // Verify lockfile: my-mcp-server removed, other-server remains
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).not.toHaveProperty("my-mcp-server");
        expect(lockfile.mcpServers).toHaveProperty("other-server");
      }),
    );

    it.effect("no-op when mcp server does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "other-server": "local:/tmp/other" },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "other-server": {
            type: "local",
            path: "/tmp/other",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("nonexistent");

        // Verify nothing changed
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).toHaveProperty("other-server");
        expect(Object.keys(settings["mcpServers"] as Record<string, string>)).toHaveLength(1);

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("other-server");
        expect(Object.keys(lockfile.mcpServers!)).toHaveLength(1);
      }),
    );

    it.effect("removes lockfile-only mcp server when not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          implicit: {
            type: "local",
            path: "/tmp/implicit-mcp",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("implicit");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).toBeUndefined();

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).not.toHaveProperty("implicit");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Granular removal methods (Phase 3)
  // ---------------------------------------------------------------------------

  describe("removeSkillLock", () => {
    it.effect("removes skill from lockfile only, not settings", () =>
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
        yield* ws.removeSkillLock("code-review");

        // Settings should still have the skill
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toHaveProperty("code-review");

        // Lockfile should NOT have the skill
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).not.toHaveProperty("code-review");
      }),
    );

    it.effect("no-op when skill not in lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkillLock("nonexistent");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(Object.keys(lockfile.skills)).toHaveLength(0);
      }),
    );
  });

  describe("removeCommandSettings", () => {
    it.effect("removes command from settings only, not lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: { "my-command": "github:acme/my-command" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-command": {
            type: "github",
            owner: "acme",
            repo: "my-command",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeCommandSettings("my-command");

        // Settings should NOT have the command
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).not.toHaveProperty("my-command");

        // Lockfile should still have the command
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).toHaveProperty("my-command");
      }),
    );

    it.effect("no-op when command not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeCommandSettings("nonexistent");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).toBeUndefined();
      }),
    );
  });

  describe("removeCommandLock", () => {
    it.effect("removes command from lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          commands: { "my-command": "github:acme/my-command" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-command": {
            type: "github",
            owner: "acme",
            repo: "my-command",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeCommandLock("my-command");

        // Settings should still have the command
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.commands).toHaveProperty("my-command");

        // Lockfile should NOT have the command
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).not.toHaveProperty("my-command");
      }),
    );

    it.effect("no-op when command not in lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeCommandLock("nonexistent");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.commands).toBeUndefined();
      }),
    );
  });

  describe("removeMcpServerSettings", () => {
    it.effect("removes mcp server from settings only, not lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp": {
            type: "github",
            owner: "acme",
            repo: "my-mcp",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerSettings("my-mcp");

        // Settings should NOT have the mcp server
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).not.toHaveProperty("my-mcp");

        // Lockfile should still have the mcp server
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("my-mcp");
      }),
    );

    it.effect("no-op when mcp server not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerSettings("nonexistent");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).toBeUndefined();
      }),
    );
  });

  describe("removeMcpServerLock", () => {
    it.effect("removes mcp server from lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp": {
            type: "github",
            owner: "acme",
            repo: "my-mcp",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerLock("my-mcp");

        // Settings should still have the mcp server
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).toHaveProperty("my-mcp");

        // Lockfile should NOT have the mcp server
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).not.toHaveProperty("my-mcp");
      }),
    );

    it.effect("no-op when mcp server not in lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerLock("nonexistent");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toBeUndefined();
      }),
    );
  });

  describe("removePackSettings", () => {
    it.effect("removes pack from settings only, not lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
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
        yield* ws.removePackSettings("starter-pack");

        // Settings should NOT have the pack
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).not.toHaveProperty("starter-pack");

        // Lockfile should still have the pack
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).toHaveProperty("starter-pack");
      }),
    );

    it.effect("no-op when pack not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removePackSettings("nonexistent");

        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toBeUndefined();
      }),
    );
  });

  describe("removePackLock", () => {
    it.effect("removes pack from lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
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
        yield* ws.removePackLock("starter-pack");

        // Settings should still have the pack
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toHaveProperty("starter-pack");

        // Lockfile should NOT have the pack
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).not.toHaveProperty("starter-pack");
      }),
    );

    it.effect("no-op when pack not in lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removePackLock("nonexistent");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).toBeUndefined();
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Pack dependency queries (Phase 3)
  // ---------------------------------------------------------------------------

  describe("isExtensionRequiredByInstalledPack", () => {
    it.effect("returns true when skill is referenced by an installed pack", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {
            "code-review": {
              type: "github",
              owner: "acme",
              repo: "code-review",
              agents: ["claude-code"],
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          },
          {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: { "@acme/skills/code-review": "1.0.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "skill",
          name: "code-review",
        });

        expect(result).toBe(true);
      }),
    );

    it.effect("returns true when command is referenced by an installed pack", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: { "@acme/commands/my-cmd": "1.0.0" },
              resolvedMcpServers: {},
            },
          },
          {
            "my-cmd": {
              type: "github",
              owner: "acme",
              repo: "my-cmd",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "command",
          name: "my-cmd",
        });

        expect(result).toBe(true);
      }),
    );

    it.effect("returns true when mcp-server is referenced by an installed pack", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
              resolvedSkills: {},
              resolvedCommands: {},
              resolvedMcpServers: { "@acme/mcp-servers/my-mcp": "1.0.0" },
            },
          },
          undefined,
          {
            "my-mcp": {
              type: "github",
              owner: "acme",
              repo: "my-mcp",
              installedAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "mcp-server",
          name: "my-mcp",
        });

        expect(result).toBe(true);
      }),
    );

    it.effect("returns false when extension is not referenced by any pack", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
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
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "skill",
          name: "orphan-skill",
        });

        expect(result).toBe(false);
      }),
    );

    it.effect("returns false when no packs are installed", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "skill",
          name: "some-skill",
        });

        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for pack target type (packs don't depend on packs)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "pack",
          name: "some-pack",
          namespace: "@acme",
        });

        expect(result).toBe(false);
      }),
    );
  });

  describe("markDependencyRetainedInLockfile", () => {
    it.effect("marks skill as retained in lockfile by setting retainedByPack flag", () =>
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
        yield* ws.markDependencyRetainedInLockfile({ type: "skill", name: "code-review" });

        const lockfile = readLockfileFromDisk(projectDir);
        const entry = lockfile.skills["code-review"] as Record<string, unknown>;
        expect(entry["retainedByPack"]).toBe(true);
      }),
    );

    it.effect("marks command as retained in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, {
          "my-cmd": {
            type: "github",
            owner: "acme",
            repo: "my-cmd",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.markDependencyRetainedInLockfile({ type: "command", name: "my-cmd" });

        const lockfile = readLockfileFromDisk(projectDir);
        const entry = lockfile.commands!["my-cmd"] as Record<string, unknown>;
        expect(entry["retainedByPack"]).toBe(true);
      }),
    );

    it.effect("marks mcp-server as retained in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          "my-mcp": {
            type: "github",
            owner: "acme",
            repo: "my-mcp",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.markDependencyRetainedInLockfile({ type: "mcp-server", name: "my-mcp" });

        const lockfile = readLockfileFromDisk(projectDir);
        const entry = lockfile.mcpServers!["my-mcp"] as Record<string, unknown>;
        expect(entry["retainedByPack"]).toBe(true);
      }),
    );

    it.effect("no-op when target not found in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.markDependencyRetainedInLockfile({ type: "skill", name: "nonexistent" });

        // Should not throw, just no-op
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).toEqual({});
      }),
    );
  });
});
