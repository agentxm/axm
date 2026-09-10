import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
  property,
} from "../../test-helpers.js";
import { handleMcpServersNew } from "./new.js";
import { afterEach, beforeEach } from "vitest";

const initWorkspace = (axmDir: string, opts: { owner?: string; agents?: string[] } = {}) => {
  writeWorkspaceFiles(axmDir, { agents: opts.agents, owner: opts.owner });
};

describe("mcps-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  it.effect("emits JSON artifact targets for created source and workspace config", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: ["claude-code"] });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpServersNew({
          name: extensionName("context"),
          description: "Context server",
          owner: Option.none(),
          preview: false,
        });

        expect(logs.success).toEqual(["Created 1 MCP server"]);
        const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
        const result = expectAppliedPlanResult(renderedResult.data, {
          planName: "New MCP server",
        });
        const units = planResultUnits(result);
        const firstUnit = expectRecord(expectDefined(units[0], "Expected first unit"));
        const artifact = expectRecord(property(firstUnit, "artifact"));
        const targets = property(artifact, "targets");
        if (!Array.isArray(targets)) {
          throw new Error("Expected artifact.targets array");
        }
        const targetPaths = targets.map((target) => property(expectRecord(target), "path"));
        expect(targetPaths).toEqual(["mcps/context/mcp.json", "axm.json", ".mcp.json"]);
        const mcpConfigTarget = expectRecord(
          expectDefined(
            targets.find((target) => property(expectRecord(target), "path") === ".mcp.json"),
            "Expected MCP config target",
          ),
        );
        expect(property(mcpConfigTarget, "agentIds")).toEqual(["claude-code"]);
      }),
    );
  });
});
