import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { afterEach } from "vitest";
import { deriveOperationOutcome } from "../../../transitions/planning/index.js";
import { applyInstall, installRequest } from "../../../lifecycle/install/test-helpers.js";
import { applyUninstall, uninstallRequest } from "../../../lifecycle/uninstall/test-helpers.js";
import { makeLifecycleFixture } from "../../../lifecycle/testing.js";

const LIVE_SMOKE_ENV = "AXM_RUN_CHROME_DEVTOOLS_MCP_LIVE_SMOKE";
const LIVE_REGISTRY_URL_ENV = "AXM_CHROME_DEVTOOLS_MCP_REGISTRY_URL";
const LIVE_VERSION_ENV = "AXM_CHROME_DEVTOOLS_MCP_VERSION";
const LIVE_NAMESPACE_ENV = "AXM_CHROME_DEVTOOLS_MCP_NAMESPACE";

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

// The production install and uninstall routes run against a real Registry:
// the same lifecycle the CLI drives, over a workspace with no configured
// agents so nothing is projected beyond settings and the lockfile.
describeLiveSmoke("chrome-devtools-mcp live smoke", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("installs then uninstalls with live registry fetch when gate is enabled", () => {
    const liveRegistryUrl = requiredLiveEnv(LIVE_REGISTRY_URL_ENV);
    const liveVersion = requiredLiveEnv(LIVE_VERSION_ENV);
    const liveOwner = process.env[LIVE_NAMESPACE_ENV] ?? "@community";
    const workspace = makeLifecycleFixture({
      sources: "live",
      httpClient: FetchHttpClient.layer,
      settings: {
        owner: "@acme",
        agents: [],
        defaultRegistry: "live",
        sources: [{ name: "live", type: "registry", location: liveRegistryUrl }],
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          const installed = yield* applyInstall(
            installRequest({
              type: "mcp-server",
              subject: {
                kind: "source",
                source: `live:${liveOwner}/mcps/chrome-devtools-mcp@${liveVersion}`,
              },
            }),
          );
          expect(deriveOperationOutcome(installed)).toBe("applied");
          expect(workspace.readFile("axm.json")).toContain("chrome-devtools-mcp");

          const uninstalled = yield* applyUninstall(
            uninstallRequest({ type: "mcp-server", selector: "chrome-devtools-mcp" }),
          );
          expect(deriveOperationOutcome(uninstalled)).toBe("applied");
          expect(workspace.readFile("axm.json")).not.toContain("chrome-devtools-mcp");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
