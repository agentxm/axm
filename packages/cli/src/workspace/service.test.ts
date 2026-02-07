/**
 * Unit tests for WorkspaceContextService.
 *
 * Tests nonInteractive resolution from Option<boolean> to plain boolean,
 * including CI environment detection fallback.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { makeClackTestLayer, type MockClackService } from "../clack-effect/index.js";
import { Clack } from "../clack-effect/service.js";
import type { Plan } from "./plan.js";
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

  const [TestClackLayer] = makeClackTestLayer();
  const BaseLayer = Layer.mergeAll(NodeFileSystem.layer, TestClackLayer);

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
        });

        expect(ws.preview).toBe(true);
      }),
    );
  });

  describe("resolvePlan", () => {
    const testPlan: Plan<string> = {
      name: "Test Plan",
      description: Option.none(),
      jobs: [
        {
          steps: [
            { op: "test-op", action: "execute", reason: Option.none(), label: "test action" },
          ],
          concurrency: 1,
        },
      ],
    };

    const runResolvePlan = (options: WorkspaceContextOptions, mockClack: MockClackService) => {
      const clackLayer = Layer.succeed(Clack, mockClack);
      const base = Layer.mergeAll(NodeFileSystem.layer, clackLayer);
      const wsLayer = Layer.provide(workspaceLayer(options), base);
      return Effect.gen(function* () {
        const ws = yield* Workspace;
        yield* ws.resolvePlan(testPlan);
      }).pipe(Effect.provide(Layer.merge(base, wsLayer)));
    };

    it.effect("default mode (preview=false) displays plan and applies", () =>
      Effect.gen(function* () {
        const [, mockClack] = makeClackTestLayer();
        yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(false),
            preview: false,
          },
          mockClack,
        );

        // displayPlan logs plan name as info
        expect(mockClack.logs.info).toContain("Test Plan");
        // applyPlan logs success for each execute action
        expect(mockClack.logs.success).toContainEqual("Installed test action");
      }),
    );

    it.effect("preview interactive confirms and applies", () =>
      Effect.gen(function* () {
        const [, mockClack] = makeClackTestLayer({
          confirmBehavior: Option.some({ type: "return", value: true }),
          selectBehavior: Option.none(),
          multiselectBehavior: Option.none(),
        });
        yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(false),
            preview: true,
          },
          mockClack,
        );

        // Should show preview message
        expect(mockClack.logs.info).toContainEqual("Previewing changes...");
        // displayPlan logs plan name
        expect(mockClack.logs.info).toContain("Test Plan");
        // Confirmed, so applyPlan runs
        expect(mockClack.logs.success).toContainEqual("Installed test action");
      }),
    );

    it.effect("preview interactive cancels when user declines", () =>
      Effect.gen(function* () {
        const [, mockClack] = makeClackTestLayer({
          confirmBehavior: Option.some({ type: "return", value: false }),
          selectBehavior: Option.none(),
          multiselectBehavior: Option.none(),
        });
        yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(false),
            preview: true,
          },
          mockClack,
        );

        // Should show preview message
        expect(mockClack.logs.info).toContainEqual("Previewing changes...");
        // User declined, should show cancelled outro
        expect(mockClack.logs.outro).toContainEqual("Cancelled.");
        // Should NOT apply
        expect(mockClack.logs.success).not.toContainEqual("Installed test action");
      }),
    );

    it.effect("preview with --yes auto-applies without confirming", () =>
      Effect.gen(function* () {
        const [, mockClack] = makeClackTestLayer();
        yield* runResolvePlan(
          {
            global: false,
            yes: true,
            nonInteractive: Option.some(false),
            preview: true,
          },
          mockClack,
        );

        // Should show preview message
        expect(mockClack.logs.info).toContainEqual("Previewing changes...");
        // Should show pre-approved message
        expect(mockClack.logs.info).toContainEqual("Pre-approved via --yes, applying changes...");
        // Should apply
        expect(mockClack.logs.success).toContainEqual("Installed test action");
      }),
    );

    it.effect("preview with nonInteractive warns and does not apply", () =>
      Effect.gen(function* () {
        const [, mockClack] = makeClackTestLayer();
        yield* runResolvePlan(
          {
            global: false,
            yes: false,
            nonInteractive: Option.some(true),
            preview: true,
          },
          mockClack,
        );

        // Should show preview message
        expect(mockClack.logs.info).toContainEqual("Previewing changes...");
        // Should warn about non-interactive mode
        expect(mockClack.logs.warn).toContainEqual(
          "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.",
        );
        // Should NOT apply
        expect(mockClack.logs.success).not.toContainEqual("Installed test action");
      }),
    );
  });
});
