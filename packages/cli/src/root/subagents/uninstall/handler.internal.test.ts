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
import type { WorkspaceMutationsOptions } from "@agentxm/workspace-state";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/extension-management/unstable/subagents";
import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/extension-workspace";
import { type UninstallSubagentHandlerArgs } from "./command-actions.js";
import { handleUninstall } from "./handler.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";
import { writeWorkspaceFiles } from "../../../test-stubs.js";

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
  writeWorkspaceFiles(axmDir, {
    agents,
    subagents: Object.fromEntries(
      Object.keys(lockfileSubagents).map((name) => [name, "./installed"]),
    ),
    lockfileSubagents,
    lockfilePacks,
  });
};

/** Create a canonical subagent directory with <name>.md. */
const createCanonicalSubagent = (base: string, name: string) => {
  const dir = path.join(base, "agent_extensions", "local", "installed");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), `# ${name}`);
  return dir;
};

const makeLockEntry = (name: string) => ({
  type: "local",
  sourceType: "local",
  sourceName: "local",
  extensionType: "subagent",
  workspaceName: name,
  packageFormat: "agentxm",
  packageOwner: "@acme",
  packageName: name,
  path: "installed",
  contentIdentity: "test-content",
  treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
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

  const makeLayers = (options?: {
    readonly wsOverrides?: Partial<WorkspaceMutationsOptions>;
    readonly machine?: boolean;
  }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      machine: options?.machine,
      wsOptions: options?.wsOverrides,
    });
    const BaseLayer = handlerTestContext.baseLayer;
    const WsLayer = handlerTestContext.wsLayer;
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const SMLayer = Layer.provide(
      SubagentManagerLive,
      Layer.mergeAll(BaseLayer, WsLayer, SPLayer, CodingAgentRepositoryLive),
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SMLayer, CodingAgentRepositoryLive);
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
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
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.subagents?.["nonexistent"]).toBeUndefined();
          expect(logs.warn).toEqual([]);
          expect(logs.success).toEqual(["No subagents uninstalled."]);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Glob expansion
  // ---------------------------------------------------------------------------

  describe("glob expansion", () => {
    it.effect("reports no-op when glob matches no subagents", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-subagent": makeLockEntry("my-subagent"),
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent-*"), {
            yes: false,
            preview: false,
          });

          expect(logs.warn).toEqual([]);
          expect(logs.success.some((m) => m.includes("No subagents uninstalled"))).toBe(true);
        }),
      );
    });

    it.effect("emits JSON no-op when glob matches no subagents in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-subagent": makeLockEntry("my-subagent"),
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent-*"), {
            yes: false,
            preview: false,
          });

          expect(logs.warn).toEqual([]);
          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Uninstall subagents",
            message: "No subagents uninstalled.",
          });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Full uninstall flow
  // ---------------------------------------------------------------------------

  describe("full uninstall flow", () => {
    it.effect("uninstalls a subagent from lockfile and settings", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-subagent": makeLockEntry("my-subagent"),
      });
      createCanonicalSubagent(tempDir, "my-subagent");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-subagent"), {
            yes: true,
            preview: false,
          });

          // Lockfile should not have the subagent
          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.subagents?.["my-subagent"]).toBeUndefined();

          // Settings should not have the subagent
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.subagents?.["my-subagent"]).toBeUndefined();
        }),
      );
    });

    it.effect("emits removed artifact targets in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-subagent": makeLockEntry("my-subagent"),
      });
      createCanonicalSubagent(tempDir, "my-subagent");
      const renderedDir = path.join(tempDir, ".claude", "agents");
      fs.mkdirSync(renderedDir, { recursive: true });
      fs.writeFileSync(
        path.join(renderedDir, "my-subagent.md"),
        "<!-- axm:file v=1 ext=@acme/subagents/my-subagent src=source.md\n     AXM managed file. -->\n# my-subagent",
      );

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-subagent"), {
            yes: true,
            preview: false,
          });

          expect(logs.warn).toEqual([]);
          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Uninstall subagent",
          });
          expect(result).toMatchObject({
            units: [
              {
                id: "my-subagent",
                label: "my-subagent",
                state: "committed",
                artifact: {
                  scope: "project",
                  agents: ["claude-code"],
                  change: "removed",
                  fileCount: 4,
                  targets: [
                    {
                      path: "axm.json",
                      change: "updated",
                    },
                    {
                      path: "agent_extensions/local/installed",
                      change: "removed",
                    },
                    {
                      path: ".claude/agents/my-subagent.md",
                      change: "removed",
                      agentIds: ["claude-code"],
                    },
                  ],
                },
              },
            ],
          });
        }),
      );
    });
  });
});
