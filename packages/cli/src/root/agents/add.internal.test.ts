import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as ServiceMap from "effect/Context";
import { afterEach, beforeEach } from "vitest";
import {
  AgentExecutableResolver,
  CodingAgentRepositoryLive,
} from "@agentxm/extension-management/unstable/agents";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { HookManager } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import { McpServerManager } from "@agentxm/extension-management/unstable/mcps";
import { PackManager } from "@agentxm/extension-management/unstable/packs";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";
import { SkillManager } from "@agentxm/extension-management/unstable/skills";
import { SubagentManager } from "@agentxm/extension-management/unstable/subagents";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-helpers.js";
import { managerLifecycleStubs, writeWorkspaceFiles } from "../../test-stubs.js";
import { handleAgentsAdd } from "./add.js";

const cursorSuggestion = {
  description: "Allow AXM in Cursor by adding `axm` to `~/.cursor/permissions.json`",
  url: "https://cursor.com/docs/cli/reference/permissions.md",
};

const emptySkillManager = {
  ...managerLifecycleStubs,
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

const emptyMcpServerManager = {
  ...managerLifecycleStubs,
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

const emptyHookManager = {
  ...managerLifecycleStubs,
  type: "hook",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  projectionPlans: () => Effect.succeed([]),
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof HookManager>;

const emptyRuleManager = {
  ...managerLifecycleStubs,
  type: "rule",
  projectionPlans: () => Effect.succeed([]),
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
  ...managerLifecycleStubs,
  type: "subagent",
  projectionObservation: () => Effect.succeed({ present: false, current: false }),
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
  ...managerLifecycleStubs,
  type: "knowledge",
  refreshCatalog: () => Effect.void,
  sync: () => Effect.succeed({ changed: false, warnings: [], artifacts: [] }),
  install: () => Effect.void,
  projectionPlans: () => Effect.succeed([]),
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
  ...managerLifecycleStubs,
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

const managersLayer = (
  skillManager: ServiceMap.Service.Shape<typeof SkillManager> = emptySkillManager,
) =>
  Layer.mergeAll(
    Layer.succeed(SkillManager, skillManager),
    Layer.succeed(McpServerManager, emptyMcpServerManager),
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

  const makeLayers = (opts?: {
    readonly machine?: boolean;
    readonly quiet?: boolean;
    readonly skillManager?: ServiceMap.Service.Shape<typeof SkillManager>;
    readonly scope?: "project" | "user";
  }) => {
    const context = makeWorkspaceHandlerTestContext({
      machine: opts?.machine,
      wsOptions: { scope: opts?.scope ?? "project" },
      ...(opts?.quiet === undefined ? {} : { flags: { quiet: opts.quiet } }),
    });
    const fullLayer = Layer.mergeAll(
      context.fullLayer,
      managersLayer(opts?.skillManager),
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

  const readConfiguredAgents = (root = tempDir): ReadonlyArray<string> => {
    const projectSettings = path.join(root, "axm.json");
    const settings: { readonly agents?: unknown } = JSON.parse(
      fs.readFileSync(
        fs.existsSync(projectSettings)
          ? projectSettings
          : path.join(root, ".axm", "workspace", "axm.json"),
        "utf8",
      ),
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
          yes: true,
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
          yes: true,
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Add coding agents",
        });
        expect(result).toMatchObject({
          units: [
            expect.objectContaining({
              id: "Add cursor",
              label: "Add cursor",
              state: "committed",
              artifact: expect.objectContaining({
                path: "axm.json",
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

  it.effect("blocks without replacing an unreadable authoritative lockfile", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, { agents: [] });
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: 4\nskills: []\n");

    return provide(
      Effect.gen(function* () {
        const error = yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.flip);

        expect(error.code).toBe("validation");
        expect(rendererState.results).toEqual([]);
        expect(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8")).toBe(
          "lockfileVersion: 4\nskills: []\n",
        );
      }),
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
          yes: true,
          force: false,
          preview: false,
        });

        expect(rendererState.logs).toEqual([{ _tag: "success", message: "Configured 1 agent" }]);
        // --quiet keeps next-step guidance: the filter drops progress and
        // decoration only.
        expect(rendererState.suggestions).toEqual([cursorSuggestion]);
      }),
    );
  });

  it.effect("reports materialization failure instead of a configured-agent success", () => {
    const failingSkillManager = {
      ...emptySkillManager,
      materializeInstall: () =>
        makeAppError({
          code: "not_found",
          detail: "Injected review skill materialization failure",
        }),
    } satisfies ServiceMap.Service.Shape<typeof SkillManager>;
    const { provide, rendererState } = makeLayers({ skillManager: failingSkillManager });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      agents: [],
      skills: { review: "workspace" },
    });
    const skillDir = path.join(tempDir, "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n",
    );

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: true,
          force: false,
          preview: false,
        });

        expect(rendererState.logs).toContainEqual({
          _tag: "error",
          message: "Failed to configure 2 agents",
        });
        expect(rendererState.logs).not.toContainEqual({
          _tag: "success",
          message: "Configured 1 agent",
        });
        expect(rendererState.logs).toContainEqual(
          expect.objectContaining({
            _tag: "error",
            message: expect.stringContaining("Injected review skill materialization failure"),
          }),
        );
        expect(readConfiguredAgents()).toEqual([]);
      }),
    );
  });

  it.effect("keeps machine failure outcome aligned with the materialization step", () => {
    const failingSkillManager = {
      ...emptySkillManager,
      materializeInstall: () =>
        makeAppError({
          code: "not_found",
          detail: "Injected review skill materialization failure",
        }),
    } satisfies ServiceMap.Service.Shape<typeof SkillManager>;
    const { provide, rendererState } = makeLayers({
      machine: true,
      skillManager: failingSkillManager,
    });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), {
      agents: [],
      skills: { review: "workspace" },
    });
    const skillDir = path.join(tempDir, "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n",
    );

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["cursor"],
          detected: false,
          yes: true,
          force: false,
          preview: false,
        });

        const payload = expectRecord(rendererState.results[0]?.data);
        const result = expectRecord(property(payload, "result"));
        expect(result).toMatchObject({
          outcome: "failed",
          planName: "Add coding agents",
          counts: expect.objectContaining({
            total: 2,
            committed: 0,
            failed: 2,
            blocked: 0,
          }),
          units: [
            { label: "Add cursor", state: "failed" },
            {
              label: expect.stringContaining("review"),
              state: "failed",
              message: expect.stringContaining("Injected review skill materialization failure"),
            },
          ],
        });
        expect(readConfiguredAgents()).toEqual([]);
      }),
    );
  });

  it.effect("does not auto-add a detected retired agent", () => {
    const { provide, rendererState } = makeLayers({ scope: "user" });
    writeWorkspaceFiles(path.join(homeDir, ".axm"), { scope: "user", agents: [] });
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

        expect(readConfiguredAgents(homeDir)).toEqual([]);
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

  it.effect("requires the named warning policy even when --yes is present", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: [] });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsAdd({
          ids: ["gemini-cli"],
          detected: false,
          yes: true,
          force: false,
          preview: false,
        });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: { outcome: "blocked", blocking: { class: "override-required" } },
        });
        expect(readConfiguredAgents()).toEqual([]);

        yield* handleAgentsAdd({
          ids: ["gemini-cli"],
          detected: false,
          yes: false,
          force: true,
          preview: false,
        });

        expect(readConfiguredAgents()).toEqual(["gemini-cli"]);
      }),
    );
  });
});
