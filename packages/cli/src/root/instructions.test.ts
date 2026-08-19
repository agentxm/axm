import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../test-helpers.js";
import {
  handleInstructionsDisable,
  handleInstructionsEnable,
  handleInstructionsStatus,
} from "./instructions.js";

const initWorkspace = (
  baseDir: string,
  agents: ReadonlyArray<string>,
  instructionFiles?: false | Readonly<Record<string, unknown>>,
) => {
  const axmDir = path.join(baseDir, ".axm");
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify(
      {
        agents,
        ...(instructionFiles === undefined ? {} : { instructionFiles }),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 4\nskills: {}\n");
};

describe("instructions handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "instructions-handler-"));
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

  const makeLayers = (options?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const context = makeWorkspaceHandlerTestContext(options);
    const sourceLayer = Layer.provide(SourceHostProvidersLive, context.fullLayer);
    const foundation = Layer.mergeAll(context.fullLayer, sourceLayer);
    const fullLayer = Layer.provideMerge(RuleManagerLive, foundation);
    return {
      provide: makeEffectProvide(fullLayer),
      logs: context.logs,
      rendererState: context.rendererState,
    };
  };

  it.effect("enables instruction-file management", () => {
    const { provide } = makeLayers();
    initWorkspace(tempDir, ["claude-code"]);
    fs.mkdirSync(path.join(tempDir, ".git"));
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true });

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.instructionFiles).toEqual({
          fileName: "AGENTS.md",
          gitignoreAliases: true,
        });
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toContain(
          "# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases",
        );
      }),
    );
  });

  it.effect("emits applied JSON when enabling instruction-file management", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"]);

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true });

        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Enable instruction-file management",
        });
      }),
    );
  });

  it.effect("previews enable without changing settings or instruction aliases", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"]);
    const settingsPath = path.join(tempDir, ".axm", "settings.json");
    const settingsBefore = fs.readFileSync(settingsPath, "utf-8");

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsEnable({
          fileName: "AGENTS.md",
          gitignore: true,
          preview: true,
        });

        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsBefore);
        expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
        expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Enable instruction-file management",
          totalSteps: 1,
        });
      }),
    );
  });

  it.effect("rolls back settings and aliases when gitignore reconciliation fails", () => {
    const { provide } = makeLayers();
    initWorkspace(tempDir, ["claude-code"]);
    fs.mkdirSync(path.join(tempDir, ".git"));
    fs.mkdirSync(path.join(tempDir, ".gitignore"));
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Human instructions\n");
    const settingsBefore = fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8");

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true });

        expect(fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8")).toBe(
          settingsBefore,
        );
        expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8")).toBe(
          "# Human instructions\n",
        );
        expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
        expect(fs.statSync(path.join(tempDir, ".gitignore")).isDirectory()).toBe(true);
      }),
    );
  });

  it.effect("atomically changes the canonical instruction source", () => {
    const { provide } = makeLayers();
    initWorkspace(tempDir, ["claude-code"], {
      fileName: "AGENTS.md",
      gitignoreAliases: false,
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Original source\n");
    fs.writeFileSync(path.join(tempDir, "TEAM.md"), "# Team source\n");
    fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsEnable({ fileName: "TEAM.md", gitignore: false });

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.instructionFiles).toEqual({
          fileName: "TEAM.md",
          gitignoreAliases: false,
        });
        expect(fs.readlinkSync(path.join(tempDir, "CLAUDE.md"))).toBe("TEAM.md");
        expect(fs.readFileSync(path.join(tempDir, "TEAM.md"), "utf-8")).toBe("# Team source\n");
        expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8")).toBe(
          "# Original source\n",
        );
      }),
    );
  });

  it.effect("emits a structured disabled status in human mode", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(tempDir, ["claude-code"], false);

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsStatus();

        expect(rendererState.logs).toEqual([]);
        expect(rendererState.results[1]?.data).toMatchObject({
          count: 0,
          items: [],
          emptyMessage: "Instruction-file management is disabled.",
        });
      }),
    );
  });

  it.effect("emits a structured empty status when no agents need propagation", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(tempDir, [], {
      fileName: "AGENTS.md",
      gitignoreAliases: true,
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsStatus();

        expect(rendererState.logs).toEqual([]);
        expect(rendererState.results[1]?.data).toMatchObject({
          count: 0,
          items: [],
          emptyMessage: "No configured agents need instruction-file propagation.",
        });
      }),
    );
  });

  it.effect("emits configured agent status as a single list payload in human mode", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(tempDir, ["claude-code"], {
      fileName: "AGENTS.md",
      gitignoreAliases: true,
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsStatus();

        expect(rendererState.tables).toEqual([]);
        expect(rendererState.logs).toEqual([]);
        expect(rendererState.results[1]?.data).toMatchObject({
          count: 1,
          items: [
            expect.objectContaining({
              agentId: "claude-code",
              mechanism: expect.any(String),
              health: expect.any(String),
            }),
          ],
        });
      }),
    );
  });

  it.effect("emits machine-readable status in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"], {
      fileName: "AGENTS.md",
      gitignoreAliases: true,
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsStatus();

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          enabled: true,
          sourceFileName: "AGENTS.md",
          items: expect.arrayContaining([
            expect.objectContaining({
              agentId: "claude-code",
            }),
          ]),
        });
      }),
    );
  });

  it.effect("emits JSON no-op when instruction-file management is already enabled", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"], {
      fileName: "AGENTS.md",
      gitignoreAliases: true,
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
    fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsEnable({ fileName: "AGENTS.md", gitignore: true });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Enable instruction-file management",
          message: "Instruction-file management is already enabled.",
        });
      }),
    );
  });

  it.effect("reports no-op when instruction-file management is already disabled", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(tempDir, ["claude-code"], false);

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsDisable();

        expect(logs.success).toEqual(["Instruction-file management is already disabled."]);
      }),
    );
  });

  it.effect("emits JSON no-op when instruction-file management is already disabled", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"], false);

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsDisable();

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Disable instruction-file management",
          message: "Instruction-file management is already disabled.",
        });
      }),
    );
  });

  it.effect("emits applied JSON when disabling instruction-file management", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"], {
      fileName: "AGENTS.md",
      gitignoreAliases: true,
    });
    fs.mkdirSync(path.join(tempDir, ".git"));
    fs.writeFileSync(
      path.join(tempDir, "AGENTS.md"),
      "# Human instructions\n\n<!-- axm:start v=1 region=knowledge ext=@agentxm/knowledge/discovery -->\n## Knowledge Base\n<!-- axm:end v=1 region=knowledge -->\n",
    );
    fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));
    fs.writeFileSync(
      path.join(tempDir, ".gitignore"),
      "dist/\n\n# axm:start v=1 region=instruction-aliases ext=@agentxm/instructions/aliases\n**/CLAUDE.md\n# axm:end v=1 region=instruction-aliases\n",
    );

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsDisable();

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.instructionFiles).toBe(false);
        expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8")).toContain(
          "# Human instructions",
        );
        expect(fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf-8")).toContain(
          "region=knowledge",
        );
        expect(fs.readFileSync(path.join(tempDir, ".gitignore"), "utf-8")).toBe("dist/\n\n");
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Disable instruction-file management",
        });
      }),
    );
  });

  it.effect("previews disable without changing settings or instruction aliases", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"], {
      fileName: "AGENTS.md",
      gitignoreAliases: false,
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
    fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));
    const settingsPath = path.join(tempDir, ".axm", "settings.json");
    const settingsBefore = fs.readFileSync(settingsPath, "utf-8");

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsDisable({ preview: true });

        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsBefore);
        expect(fs.readlinkSync(path.join(tempDir, "CLAUDE.md"))).toBe("AGENTS.md");
        expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Disable instruction-file management",
          totalSteps: 1,
        });
      }),
    );
  });

  it.effect("blocks disable when an instruction alias is unowned", () => {
    const { provide } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"], {
      fileName: "AGENTS.md",
      gitignoreAliases: false,
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
    fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Human override\n");

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsDisable();

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.instructionFiles).toEqual({
          fileName: "AGENTS.md",
          gitignoreAliases: false,
        });
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf-8")).toBe(
          "# Human override\n",
        );
      }),
    );
  });
});
