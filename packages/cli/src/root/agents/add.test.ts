import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as ServiceMap from "effect/Context";
import { afterEach, beforeEach } from "vitest";
import YAML from "yaml";
import {
  AgentExecutableResolver,
  CodingAgentRepositoryLive,
} from "@agentxm/client-core/unstable/agents";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import { FilesManager } from "@agentxm/client-core/unstable/files";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { withDegradedLockfileReads } from "@agentxm/client-core/unstable/workspace";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleAgentsAdd } from "./add.js";

const cursorSuggestion = {
  description: "Allow AXM in Cursor by adding `axm` to `~/.cursor/permissions.json`",
  url: "https://cursor.com/docs/cli/reference/permissions.md",
};

const emptySkillManager = {
  type: "skill",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof SkillManager>;

const emptyCommandManager = {
  type: "command",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof CommandManager>;

const emptyMcpServerManager = {
  type: "mcp-server",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof McpServerManager>;

const emptyFilesManager = {
  type: "files",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof FilesManager>;

const emptyHookManager = {
  type: "hook",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof HookManager>;

const emptyRuleManager = {
  type: "rule",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof RuleManager>;

const emptySubagentManager = {
  type: "subagent",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof SubagentManager>;

const emptyKnowledgeManager = {
  type: "knowledge",
  refreshCatalog: () => Effect.void,
  sync: () => Effect.succeed({ changed: false, warnings: [], artifacts: [] }),
  install: () => Effect.void,
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof KnowledgeManager>;

const emptyPackManager = {
  type: "pack",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof PackManager>;

const emptyManagersLayer = Layer.mergeAll(
  Layer.succeed(SkillManager, emptySkillManager),
  Layer.succeed(CommandManager, emptyCommandManager),
  Layer.succeed(McpServerManager, emptyMcpServerManager),
  Layer.succeed(FilesManager, emptyFilesManager),
  Layer.succeed(HookManager, emptyHookManager),
  Layer.succeed(RuleManager, emptyRuleManager),
  Layer.succeed(SubagentManager, emptySubagentManager),
  Layer.succeed(KnowledgeManager, emptyKnowledgeManager),
  Layer.succeed(PackManager, emptyPackManager),
);

describe("agents add.handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-add-handler-test-"));
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });
    process.chdir(tempDir);
    process.env["HOME"] = homeDir;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: { readonly machine?: boolean; readonly quiet?: boolean }) => {
    const context = makeWorkspaceHandlerTestContext({
      machine: opts?.machine,
      ...(opts?.quiet === undefined ? {} : { flags: { quiet: opts.quiet } }),
    });
    const fullLayer = Layer.mergeAll(
      context.fullLayer,
      emptyManagersLayer,
      CodingAgentRepositoryLive,
      Layer.succeed(AgentExecutableResolver, {
        exists: () => Effect.succeed(false),
      }),
    );

    return {
      provide: makeEffectProvide(fullLayer),
      logs: context.logs,
      rendererState: context.rendererState,
    };
  };

  const readConfiguredAgents = (): ReadonlyArray<string> => {
    const settings: { readonly agents?: unknown } = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf8"),
    );
    return Array.isArray(settings.agents)
      ? settings.agents.filter((agent): agent is string => typeof agent === "string")
      : [];
  };

  it.effect("surfaces permission suggestions in the human renderer", () => {
    const { provide, rendererState } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: false,
          force: false,
          preview: false,
        });

        expect(rendererState.suggestions).toEqual([cursorSuggestion]);
        expect(rendererState.spinnerMessages).toEqual(
          expect.arrayContaining([
            "Resolving installed extension materialization",
            "Resolved installed extension materialization",
          ]),
        );
      }),
    );
  });

  it.effect("surfaces permission suggestions in machine-mode output", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: false,
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Add coding agents",
        });
        expect(result).toMatchObject({
          steps: [
            expect.objectContaining({
              label: "Add cursor",
              artifact: expect.objectContaining({
                path: ".axm/settings.json",
                scope: "project",
                agents: ["cursor"],
                change: "updated",
                fileCount: 1,
              }),
            }),
          ],
        });
        expect(rendererState.suggestions).toEqual([cursorSuggestion]);
      }),
    );
  });

  it.effect("emits JSON no-op when all requested agents are already configured", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["cursor"] });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Add coding agents",
          message: "All requested agents are already configured",
        });
        expect(result).toMatchObject({
          planDescription: "Configure coding agents and materialize installed extensions",
        });
      }),
    );
  });

  it.effect("recovers an unreadable lockfile instead of skipping materialization", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, { agents: [] });
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 3\nskills: []\n");

    // Mirrors the CLI's `withWorkspace` boundary, which degrades lockfile reads
    // so a corrupt file cannot abort the command before recovery runs.
    return provide(
      withDegradedLockfileReads(
        Effect.gen(function* () {
          yield* handleAgentsAdd({
            ids: ["cursor"],
            detected: false,
            yes: false,
            force: false,
            preview: false,
          });

          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Add coding agents",
            totalSteps: 3,
            warningCount: 2,
          });
          expect(result).toMatchObject({
            steps: [
              { label: "Recover lockfile (invalid)", status: "applied" },
              { label: "Reconcile lockfile (invalid)", status: "applied" },
              { label: "Add cursor", status: "applied", message: "Configured cursor" },
            ],
          });

          const rewritten = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
          expect(rewritten.lockfileVersion).toBe(3);
        }),
      ),
    );
  });

  it.effect("does not surface permission suggestions for previewed plans", () => {
    const { provide, rendererState } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: false,
          force: false,
          preview: true,
        });

        expect(rendererState.suggestions).toEqual([]);
      }),
    );
  });

  it.effect("keeps quiet output to the applied plan outcome", () => {
    const { provide, rendererState } = makeLayers({ quiet: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: false,
          force: false,
          preview: false,
        });

        expect(rendererState.logs).toEqual([{ _tag: "success", message: "Configured 1 agent" }]);
        expect(rendererState.suggestions).toEqual([]);
      }),
    );
  });

  it.effect("does not auto-add a detected retired agent", () => {
    const { provide, rendererState } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });
    fs.mkdirSync(path.join(homeDir, ".gemini"), { recursive: true });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: [],
          detected: true,
          yes: false,
          force: false,
          preview: false,
        });

        expect(readConfiguredAgents()).toEqual([]);
        expect(rendererState.logs).toContainEqual(
          expect.objectContaining({
            _tag: "warn",
            message: expect.stringContaining("was not added automatically"),
          }),
        );
        expect(rendererState.logs).toContainEqual({
          _tag: "success",
          message: "No active detected agents to configure",
        });
      }),
    );
  });

  it.effect("allows an explicit retired agent to be configured", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["gemini-cli"],
          detected: false,
          yes: false,
          force: false,
          preview: false,
        });

        expect(readConfiguredAgents()).toEqual(["gemini-cli"]);
      }),
    );
  });
});
