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
} from "../../test-helpers.js";
import { InstallFilesCommandWorkflowActions } from "../files/install/command-actions.js";
import { InstallHookCommandWorkflowActions } from "../hooks/install/command-actions.js";
import { InstallKnowledgeCommandWorkflowActions } from "../knowledge/install/command-actions.js";
import { InstallMcpServerCommandWorkflowActions } from "../mcps/install/command-actions.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";

const unusedInstallFilesActions = {
  parseArgs: () => Effect.die("unused"),
  resolveSourceRequests: () => Effect.die("unused"),
  discoverRefs: () => Effect.die("unused"),
  finalizeIntent: () => Effect.die("unused"),
  buildPlan: () => Effect.die("unused"),
} satisfies ServiceMap.Service.Shape<typeof InstallFilesCommandWorkflowActions>;

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

  it.effect("emits files update JSON no-op for an empty files configuration", () => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: true });
    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.succeed(InstallFilesCommandWorkflowActions, unusedInstallFilesActions),
    );
    const provide = makeEffectProvide(fullLayer);
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleWorkspaceUpdate({
          command: "files.update",
          type: Option.some("files"),
          planName: "Update files",
          planDescription: Option.some("Update configured files packages"),
          flags: { yes: false, preview: false },
        });

        const result = expectNoOpPlanResult(ctx.rendererState.results[0]?.data, {
          planName: "Update files",
          message: "No configured context files.",
        });
        expect(result).toMatchObject({
          planDescription: "Update configured files packages",
        });
      }),
    );
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
});
