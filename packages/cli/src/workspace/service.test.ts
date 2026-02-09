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
import type { OperationResult } from "./plan.js";
import type { Operation, Plan, PlannedJobStep } from "./plan.js";
import { Workspace, layer as workspaceLayer, type WorkspaceContextOptions } from "./service.js";

describe("WorkspaceContextService", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-service-test-"));
    process.chdir(tempDir);

    // Pre-create an initialized workspace so the service doesn't prompt
    const axmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(
      path.join(axmDir, "settings.json"),
      JSON.stringify({ agents: ["claude-code"] }),
    );
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
  });

  afterEach(() => {
    process.chdir(originalCwd);
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
});
