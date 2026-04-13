/**
 * Unit tests for the subagent uninstall command handler.
 *
 * Tests the plan build -> display -> confirm -> apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import type { WorkspaceContextOptions } from "@agentxm/client-core/unstable/workspace";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import {
  UninstallSubagentCommandWorkflowActionsLive,
  type UninstallSubagentHandlerArgs,
} from "./command-actions.js";
import { handleUninstall } from "./handler.js";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  lockfileSubagents: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
  lockfilePacks: Record<string, unknown> = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settingsSubagents: Record<string, string> = {};
  for (const name of Object.keys(lockfileSubagents)) {
    const entry = lockfileSubagents[name];
    const entryType =
      typeof entry === "object" &&
      entry !== null &&
      "type" in entry &&
      typeof entry.type === "string"
        ? entry.type
        : undefined;
    settingsSubagents[name] = entryType ?? "local";
  }
  const settings: Record<string, unknown> = { agents };
  if (Object.keys(settingsSubagents).length > 0) {
    settings["subagents"] = settingsSubagents;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = {
    lockfileVersion: 1,
    skills: {},
    subagents: lockfileSubagents,
  };
  if (Object.keys(lockfilePacks).length > 0) {
    lockfile["packs"] = lockfilePacks;
  }
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

/** Create a canonical subagent directory with SUBAGENT.md. */
const createCanonicalSubagent = (base: string, name: string) => {
  const dir = path.join(base, ".axm", "extensions", "external", "subagents", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SUBAGENT.md"), `# ${name}`);
  return dir;
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "/installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  subagent: string,
  overrides: Partial<UninstallSubagentHandlerArgs> = {},
): UninstallSubagentHandlerArgs => ({
  subagent,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("uninstall.handler (subagents)", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-uninstall-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({ wsOptions: wsOverrides });
    const BaseLayer = handlerTestContext.baseLayer;
    const WsLayer = handlerTestContext.wsLayer;
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const SMLayer = Layer.provide(
      SubagentManagerLive,
      Layer.mergeAll(BaseLayer, WsLayer, SPLayer, CodingAgentRepositoryLive),
    );
    const ActionsLayer = Layer.provide(
      UninstallSubagentCommandWorkflowActionsLive,
      Layer.mergeAll(BaseLayer, WsLayer, SMLayer, CodingAgentRepositoryLive),
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, ActionsLayer);
    const provide = makeEffectProvide(FullLayer);

    return { provide, logs: handlerTestContext.logs };
  };

  // ---------------------------------------------------------------------------
  // Literal name not in lockfile
  // ---------------------------------------------------------------------------

  describe("literal name not in lockfile", () => {
    it.effect("reports a no-op for literal names absent from the lockfile", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent"), {
            yes: false,
            force: false,
            preview: false,
          });

          expect(logs.success.length > 0).toBe(true);
          const allLogs = [...logs.success, ...logs.info, ...logs.message];
          expect(allLogs.some((m) => m.includes("not installed"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Glob expansion
  // ---------------------------------------------------------------------------

  describe("glob expansion", () => {
    it.effect("shows warning when glob matches no subagents", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-subagent": makeLockEntry(),
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent-*"), {
            yes: false,
            force: false,
            preview: false,
          });

          expect(logs.warn.some((m) => m.includes("No subagents matched"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to uninstall"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Full uninstall flow
  // ---------------------------------------------------------------------------

  describe("full uninstall flow", () => {
    it.effect("uninstalls a subagent from lockfile and settings", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-subagent": makeLockEntry(),
      });
      createCanonicalSubagent(tempDir, "my-subagent");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-subagent"), {
            yes: false,
            force: false,
            preview: false,
          });

          // Lockfile should not have the subagent
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.subagents?.["my-subagent"]).toBeUndefined();

          // Settings should not have the subagent
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.subagents?.["my-subagent"]).toBeUndefined();

          // Should show completed step
          expect(logs.success.some((m) => m.includes("my-subagent"))).toBe(true);
        }),
      );
    });
  });
});
