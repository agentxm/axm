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
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
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

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext();
    const fullLayer = Layer.mergeAll(ctx.fullLayer, CodingAgentRepositoryLive);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  it.effect("creates MCP manifest, registers it, writes lockfile, and emits edit hint", () => {
    const { provide, rendererState } = makeLayers();
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
        const manifest = JSON.parse(
          fs.readFileSync(path.join(packageDir, "mcp-server.json"), "utf-8"),
        );
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
        expect(rendererState.suggestions).toEqual([
          {
            description:
              "Edit `.axm/extensions/@acme/mcps/context/mcp-server.json` to configure the MCP server",
          },
        ]);
      }),
    );
  });
});
