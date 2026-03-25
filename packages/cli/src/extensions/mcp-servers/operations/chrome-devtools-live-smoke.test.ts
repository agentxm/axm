import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { DefaultCodingAgentRepository } from "../../../agents/repository.js";
import { makeOutputTestLayer } from "@axm.sh/core/unstable/output";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { uninstallMcpServer } from "./uninstall.js";
import { installMcpServer } from "./install.js";

const LIVE_SMOKE_ENV = "AXM_RUN_CHROME_DEVTOOLS_MCP_LIVE_SMOKE";
const LIVE_REGISTRY_URL_ENV = "AXM_CHROME_DEVTOOLS_MCP_REGISTRY_URL";
const LIVE_VERSION_ENV = "AXM_CHROME_DEVTOOLS_MCP_VERSION";
const LIVE_NAMESPACE_ENV = "AXM_CHROME_DEVTOOLS_MCP_NAMESPACE";
const LIVE_INTEGRITY_ENV = "AXM_CHROME_DEVTOOLS_MCP_INTEGRITY";

const isLiveSmokeEnabled = (env: Record<string, string | undefined>): boolean => {
  const raw = env[LIVE_SMOKE_ENV]?.toLowerCase();
  return raw === "1" || raw === "true";
};

const requiredLiveEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required live smoke env var: ${key}`);
  }
  return value;
};

describe("chrome-devtools-mcp live smoke gate", () => {
  it("is disabled by default, including CI, until explicitly enabled", () => {
    expect(isLiveSmokeEnabled({})).toBe(false);
    expect(isLiveSmokeEnabled({ CI: "true" })).toBe(false);
    expect(isLiveSmokeEnabled({ [LIVE_SMOKE_ENV]: "0" })).toBe(false);
    expect(isLiveSmokeEnabled({ [LIVE_SMOKE_ENV]: "false" })).toBe(false);
  });

  it("enables only when explicit gate env var is true/1", () => {
    expect(isLiveSmokeEnabled({ [LIVE_SMOKE_ENV]: "1" })).toBe(true);
    expect(isLiveSmokeEnabled({ [LIVE_SMOKE_ENV]: "true" })).toBe(true);
  });
});

const describeLiveSmoke = isLiveSmokeEnabled(process.env) ? describe : describe.skip;

describeLiveSmoke("chrome-devtools-mcp live smoke", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "chrome-devtools-mcp-live-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.effect("installs then uninstalls with live registry fetch when gate is enabled", () =>
    Effect.gen(function* () {
      const base = path.join(tmpDir, "project");
      const axmDir = path.join(base, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });

      const wsMock = {
        scope: "project",
        path: axmDir,
        baseDir: base,
        getConfiguredAgents: () => Effect.succeed([]),
        getLockedMcpServer: () => Effect.succeed(Option.none()),
        setMcpServer: () => Effect.void,
        setMcpServerLock: () => Effect.void,
        removeMcpServer: () => Effect.void,
      } as unknown as WorkspaceContextService;

      vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
        Effect.succeed([]),
      );
      vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
        Effect.succeed([]),
      );

      const liveRegistryUrl = requiredLiveEnv(LIVE_REGISTRY_URL_ENV);
      const liveVersion = requiredLiveEnv(LIVE_VERSION_ENV);
      const liveProfile = process.env[LIVE_NAMESPACE_ENV] ?? "@community";
      const liveIntegrity = process.env[LIVE_INTEGRITY_ENV] ?? "";

      const installResult = yield* installMcpServer({
        name: "install-mcp-server",
        args: {
          ref: {
            type: "mcp-server",
            refType: "registry",
            source: {
              type: "registry",
              location: new URL(liveRegistryUrl),
              profile: Option.none(),
            },
            server: { name: "chrome-devtools-mcp" },
            profile: liveProfile,
            name: "chrome-devtools-mcp",
            version: liveVersion,
            integrity: liveIntegrity,
          },
          force: false,
          versionConstraint: Option.none(),
          skipSettings: Option.some(true),
          strictAgentSync: Option.some(false),
        },
      }).pipe(
        Effect.provide(
          Layer.mergeAll(NodeServices.layer, Workspace.layer(wsMock), makeOutputTestLayer()[0]),
        ),
      );

      expect(installResult.result).toBe("success");

      const uninstallResult = yield* uninstallMcpServer({
        name: "uninstall-mcp-server",
        args: {
          serverName: "chrome-devtools-mcp",
          strictAgentSync: Option.some(false),
        },
      }).pipe(
        Effect.provide(
          Layer.mergeAll(NodeServices.layer, Workspace.layer(wsMock), makeOutputTestLayer()[0]),
        ),
      );

      expect(uninstallResult.result).toBe("success");
    }),
  );
});
