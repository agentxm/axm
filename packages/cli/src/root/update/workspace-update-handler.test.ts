import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as ServiceMap from "effect/Context";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
} from "../../test-helpers.js";
import { InstallHookCommandWorkflowActions } from "../hooks/install/command-actions.js";
import { InstallKnowledgeCommandWorkflowActions } from "../knowledge/install/command-actions.js";
import { InstallMcpServerCommandWorkflowActions } from "../mcps/install/command-actions.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";

const unusedInstallHookActions = {
  parseArgs: () => Effect.die("unused"),
  resolveSourceRequests: () => Effect.die("unused"),
  discoverRefs: () => Effect.die("unused"),
  finalizeIntent: () => Effect.die("unused"),
  buildPlan: () => Effect.die("unused"),
} satisfies ServiceMap.Service.Shape<typeof InstallHookCommandWorkflowActions>;

const unusedInstallKnowledgeActions = {
  parseArgs: () => Effect.die("unused"),
  resolveSourceRequests: () => Effect.die("unused"),
  discoverRefs: () => Effect.die("unused"),
  finalizeIntent: () => Effect.die("unused"),
  buildPlan: () => Effect.die("unused"),
} satisfies ServiceMap.Service.Shape<typeof InstallKnowledgeCommandWorkflowActions>;

const unusedInstallMcpServerActions = {
  parseArgs: () => Effect.die("unused"),
  resolveSourceRequests: () => Effect.die("unused"),
  discoverRefs: () => Effect.die("unused"),
  finalizeIntent: () => Effect.die("unused"),
  buildPlan: () => Effect.die("unused"),
} satisfies ServiceMap.Service.Shape<typeof InstallMcpServerCommandWorkflowActions>;

describe("workspace update handler output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("emits hooks update JSON no-op for an empty hooks configuration", () => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: true });
    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.succeed(InstallHookCommandWorkflowActions, unusedInstallHookActions),
    );
    const provide = makeEffectProvide(fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "hooks.update",
          type: Option.some("hook"),
          planName: "Update hooks",
          planDescription: Option.some("Update configured hooks packages"),
          flags: { yes: false, preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update hooks",
          message: "No configured hooks.",
        });
        expect(result).toMatchObject({
          planDescription: "Update configured hooks packages",
        });
      }),
    );
  });

  it.effect("emits knowledge update JSON no-op for an empty knowledge configuration", () => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: true });
    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.succeed(InstallKnowledgeCommandWorkflowActions, unusedInstallKnowledgeActions),
    );
    const provide = makeEffectProvide(fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "knowledge.update",
          type: Option.some("knowledge"),
          planName: "Update Knowledge",
          planDescription: Option.some("Update configured Knowledge bundles"),
          flags: { yes: false, preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update Knowledge",
          message: "No configured knowledge bundles.",
        });
        expect(result).toMatchObject({
          planDescription: "Update configured Knowledge bundles",
        });
      }),
    );
  });

  it.effect("emits MCP update JSON no-op for an empty MCP server configuration", () => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: true });
    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.succeed(InstallMcpServerCommandWorkflowActions, unusedInstallMcpServerActions),
    );
    const provide = makeEffectProvide(fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "mcps.update",
          type: Option.some("mcp-server"),
          planName: "Update configured MCP servers",
          planDescription: Option.some("Update configured MCP servers"),
          flags: { yes: false, preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update configured MCP servers",
          message: "No configured MCP servers.",
        });
        expect(result).toMatchObject({
          planDescription: "Update configured MCP servers",
        });
      }),
    );
  });

  it.effect("reports inline MCP servers as sync-owned without source resolution", () => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: true });
    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.succeed(InstallMcpServerCommandWorkflowActions, unusedInstallMcpServerActions),
    );
    const provide = makeEffectProvide(fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      mcps: {
        linear: { command: "npx", args: ["-y", "linear-mcp-server"] },
        sentry: { url: "https://mcp.sentry.dev/sse" },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "mcps.update",
          type: Option.some("mcp-server"),
          planName: "Update configured MCP servers",
          planDescription: Option.some("Update configured MCP servers"),
          flags: { yes: false, preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update configured MCP servers",
          totalSteps: 2,
        });
        expect(planResultUnits(result)).toEqual([
          expect.objectContaining({
            label: "linear",
            state: "skipped",
            message: "linear is inline workspace configuration; run axm sync to reconcile it",
          }),
          expect.objectContaining({
            label: "sentry",
            state: "skipped",
            message: "sentry is inline workspace configuration; run axm sync to reconcile it",
          }),
        ]);
      }),
    );
  });

  it.effect("keeps independent MCP planning results when one source is invalid", () => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: true });
    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.succeed(InstallMcpServerCommandWorkflowActions, unusedInstallMcpServerActions),
    );
    const provide = makeEffectProvide(fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      mcps: {
        linear: { command: "npx", args: ["-y", "linear-mcp-server"] },
        broken: "missing-server",
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "mcps.update",
          type: Option.some("mcp-server"),
          planName: "Update configured MCP servers",
          planDescription: Option.some("Update configured MCP servers"),
          flags: { yes: false, preview: false },
        });

        expect(ctx.rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "failed",
            counts: { total: 2, failed: 1 },
            units: expect.arrayContaining([
              expect.objectContaining({ label: "linear", state: "skipped" }),
              expect.objectContaining({
                label: "broken",
                state: "failed",
                message: expect.stringContaining('Unknown MCP server "missing-server"'),
              }),
            ]),
          },
        });
      }),
    );
  });
});
