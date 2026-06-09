import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
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

  it.effect("creates MCP manifest, registers it, writes lockfile, and emits edit hint", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpServersNew({
          name: extensionName("context"),
          description: "Context server",
          owner: Option.none(),
          yes: false,
          force: false,
          preview: false,
        });

        const packageDir = path.join(tempDir, ".axm", "extensions", "@acme", "mcps", "context");
        const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "mcp.json"), "utf-8"));
        expect(manifest).toMatchObject({
          owner: "@acme",
          type: "mcp-server",
          name: "context",
          version: "0.1.0",
          description: "Context server",
        });

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.mcpServers?.context).toEqual({
          source: "@acme/mcps/context",
          authored: true,
        });

        const lockfile = YAML.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
        );
        expect(lockfile.mcpServers.context).toMatchObject({
          type: "registry",
          owner: "@acme",
          name: "context",
          resolvedVersion: "0.1.0",
        });
        expect(logs.success).toEqual(["Created MCP server @acme/mcps/context with 2 targets"]);
        expect(rendererState.suggestions).toEqual([
          {
            description:
              "Edit `.axm/extensions/@acme/mcps/context/mcp.json` to configure the MCP server",
          },
        ]);
      }),
    );
  });

  it.effect("emits JSON artifact targets for created source and workspace config", () => {
    const { provide, logs, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: ["claude-code"] });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpServersNew({
          name: extensionName("context"),
          description: "Context server",
          owner: Option.none(),
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.success).toEqual(["Created MCP server @acme/mcps/context for 1 agent"]);
        const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
        const result = expectAppliedPlanResult(renderedResult.data, {
          planName: "New MCP server",
        });
        const steps = planResultSteps(result);
        const firstStep = expectRecord(expectDefined(steps[0], "Expected first step"));
        const artifact = expectRecord(property(firstStep, "artifact"));
        const targets = property(artifact, "targets");
        if (!Array.isArray(targets)) {
          throw new Error("Expected artifact.targets array");
        }
        const targetPaths = targets.map((target) => property(expectRecord(target), "path"));
        expect(targetPaths).toEqual([".axm (config/lockfile)", ".mcp.json"]);
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

  it.effect("guides the user when the managed MCP server directory already exists", () => {
    const { provide } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpServersNew({
          name: extensionName("context"),
          description: "Context server",
          owner: Option.none(),
          yes: true,
          force: false,
          preview: false,
        });

        const error = yield* handleMcpServersNew({
          name: extensionName("context"),
          description: "Context server",
          owner: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.flip);

        expect(error).toMatchObject({
          code: "conflict",
          suggestions: [
            {
              description: "Choose a different name or remove the existing directory first",
            },
          ],
        });
      }),
    );
  });
});
