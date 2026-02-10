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
import type { SourceConfig } from "../settings/index.js";
import type { OperationResult } from "./plan.js";
import type { Operation, Plan, PlannedJobStep } from "./plan.js";
import { Workspace, layer as workspaceLayer, type WorkspaceContextOptions } from "./service.js";

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

  describe("getSources", () => {
    it.effect("returns only built-in defaults when no sources configured", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getSources();

        expect(sources).toHaveLength(3);
        expect(sources.map((s) => s.name)).toEqual(["github", "gitlab", "bitbucket"]);
      }),
    );

    it.effect("merge ordering: project first, then global, then built-in", () =>
      Effect.gen(function* () {
        const projectSource: SourceConfig = {
          name: "my-registry",
          source: "registry",
          location: "https://registry.example.com",
        };
        const globalSource: SourceConfig = {
          name: "corp-registry",
          source: "registry",
          location: "https://corp.example.com",
        };

        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [projectSource],
        });
        writeSettingsTo(homeDir, {
          sources: [globalSource],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getSources();

        const names = sources.map((s) => s.name);
        expect(names).toEqual(["my-registry", "corp-registry", "github", "gitlab", "bitbucket"]);
      }),
    );

    it.effect("project source overrides global source with same name", () =>
      Effect.gen(function* () {
        const projectSource: SourceConfig = {
          name: "github",
          source: "github",
          url: "https://github.mycompany.com",
        };
        const globalSource: SourceConfig = {
          name: "github",
          source: "github",
          url: "https://github.example.com",
        };

        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [projectSource],
        });
        writeSettingsTo(homeDir, {
          sources: [globalSource],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getSources();

        const githubSource = sources.find((s) => s.name === "github");
        expect(githubSource).toBeDefined();
        // Project wins over global
        expect((githubSource as SourceConfig & { url: string }).url).toBe(
          "https://github.mycompany.com",
        );
        // Built-in github is also overridden (only one "github" entry)
        expect(sources.filter((s) => s.name === "github")).toHaveLength(1);
      }),
    );

    it.effect("global source overrides built-in source with same name", () =>
      Effect.gen(function* () {
        const globalSource: SourceConfig = {
          name: "gitlab",
          source: "gitlab",
          url: "https://gitlab.corp.example.com",
        };

        writeSettingsTo(homeDir, {
          sources: [globalSource],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getSources();

        const gitlabSource = sources.find((s) => s.name === "gitlab");
        expect(gitlabSource).toBeDefined();
        expect((gitlabSource as SourceConfig & { url: string }).url).toBe(
          "https://gitlab.corp.example.com",
        );
        expect(sources.filter((s) => s.name === "gitlab")).toHaveLength(1);
      }),
    );

    it.effect("caches result across multiple calls", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [{ name: "custom", source: "registry", location: "https://r.example.com" }],
        });

        const ws = yield* getService(defaultOptions);
        const first = yield* ws.getSources();
        const second = yield* ws.getSources();

        // Same reference (cached)
        expect(first).toBe(second);
      }),
    );
  });

  describe("getSourceByName", () => {
    it.effect("returns Some when source exists", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getSourceByName("github");

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result).name).toBe("github");
      }),
    );

    it.effect("returns None when source does not exist", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getSourceByName("nonexistent");

        expect(Option.isNone(result)).toBe(true);
      }),
    );
  });

  describe("getRegistrySources", () => {
    it.effect("returns empty when no registry sources configured", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySources(Option.none());

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
              source: "registry",
              location: "https://r1.example.com",
              scopes: ["@corp"],
            },
            {
              name: "r2",
              source: "registry",
              location: "https://r2.example.com",
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySources(Option.none());

        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["r1", "r2"]);
      }),
    );

    it.effect("scope filtering returns scope-matched sources only", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "corp-reg",
              source: "registry",
              location: "https://corp.example.com",
              scopes: ["@corp"],
            },
            {
              name: "public-reg",
              source: "registry",
              location: "https://public.example.com",
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySources(Option.some("@corp"));

        // Only corp-reg matches @corp scope
        expect(sources).toHaveLength(1);
        expect(sources[0]!.name).toBe("corp-reg");
      }),
    );

    it.effect("catch-all fallback when no scope match found", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "corp-reg",
              source: "registry",
              location: "https://corp.example.com",
              scopes: ["@corp"],
            },
            {
              name: "public-reg",
              source: "registry",
              location: "https://public.example.com",
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySources(Option.some("@unknown"));

        // No scope match for @unknown, falls back to catch-all (no scopes field)
        expect(sources).toHaveLength(1);
        expect(sources[0]!.name).toBe("public-reg");
      }),
    );

    it.effect("mutual exclusivity: scope-matched exists so catch-all not returned", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "corp-reg",
              source: "registry",
              location: "https://corp.example.com",
              scopes: ["@corp"],
            },
            {
              name: "public-reg",
              source: "registry",
              location: "https://public.example.com",
            },
            {
              name: "another-corp",
              source: "registry",
              location: "https://another.example.com",
              scopes: ["@corp", "@internal"],
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySources(Option.some("@corp"));

        // Two scope-matched sources, catch-all (public-reg) excluded
        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["corp-reg", "another-corp"]);
      }),
    );
  });

  describe("getScope", () => {
    it.effect("returns project scope when configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          scope: "@myorg",
        });

        const ws = yield* getService(defaultOptions);
        const scope = yield* ws.getScope();

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
        const scope = yield* ws.getScope();

        expect(scope).toBe("@globalorg");
      }),
    );

    it.effect("returns @community when no scope configured anywhere", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        // No global settings (readSettingsSafe returns defaults)

        const ws = yield* getService(defaultOptions);
        const scope = yield* ws.getScope();

        expect(scope).toBe("@community");
      }),
    );
  });

  describe("addSource", () => {
    it.effect("appends source to project settings", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        const newSource: SourceConfig = {
          name: "my-registry",
          source: "registry",
          location: "https://registry.example.com",
        };
        yield* ws.addSource(newSource);

        // Verify it was written to disk
        const settingsPath = path.join(projectDir, ".axm", "settings.json");
        const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(content.sources).toBeDefined();
        expect(content.sources).toHaveLength(1);
        expect(content.sources[0].name).toBe("my-registry");
      }),
    );

    it.effect("source visible in subsequent getSources calls (cache invalidated)", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        // Populate cache
        const before = yield* ws.getSources();
        expect(before.find((s) => s.name === "new-source")).toBeUndefined();

        // Add a new source
        const newSource: SourceConfig = {
          name: "new-source",
          source: "registry",
          location: "https://new.example.com",
        };
        yield* ws.addSource(newSource);

        // Cache should be invalidated, new source visible
        const after = yield* ws.getSources();
        expect(after.find((s) => s.name === "new-source")).toBeDefined();
      }),
    );
  });
});
