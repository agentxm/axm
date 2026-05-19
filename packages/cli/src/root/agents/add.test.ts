import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as ServiceMap from "effect/Context";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import { ContextFilesManager } from "@agentxm/client-core/unstable/context-files";
import { McpServerManager } from "@agentxm/client-core/unstable/mcp-servers";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleAgentsAdd } from "./add.js";

const cursorSuggestion = {
  description: "Allow AXM in Cursor by adding `axm` to `~/.cursor/permissions.json`",
  url: "https://cursor.com/docs/reference/permissions",
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

const emptyContextFilesManager = {
  type: "file",
  isInstalled: () => Effect.succeed(false),
  materializeInstall: () => Effect.void,
  listMaterializable: () => Effect.succeed([]),
  materializeUninstall: () => Effect.void,
  upsertSettingsEntry: () => Effect.void,
  removeSettingsEntry: () => Effect.void,
  upsertLockfileEntry: () => Effect.void,
  removeLockfileEntry: () => Effect.void,
} satisfies ServiceMap.Service.Shape<typeof ContextFilesManager>;

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
  Layer.succeed(ContextFilesManager, emptyContextFilesManager),
  Layer.succeed(SubagentManager, emptySubagentManager),
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

  const makeLayers = (opts?: { readonly machine?: boolean }) => {
    const context = makeWorkspaceHandlerTestContext({ machine: opts?.machine });
    const fullLayer = Layer.mergeAll(
      context.fullLayer,
      emptyManagersLayer,
      CodingAgentRepositoryLive,
    );

    return {
      provide: makeEffectProvide(fullLayer),
      rendererState: context.rendererState,
    };
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

        expect(rendererState.results[0]?.data).toEqual(
          expect.objectContaining({
            result: expect.objectContaining({
              outcome: "applied",
              appliedCount: 1,
            }),
          }),
        );
        expect(rendererState.suggestions).toEqual([cursorSuggestion]);
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
});
