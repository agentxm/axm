import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleRulesDisable, handleRulesEnable, handleRulesStatus } from "./command.js";

const initWorkspace = (
  baseDir: string,
  agents: ReadonlyArray<string>,
  rulesConfig?: Readonly<Record<string, unknown>>,
) => {
  const axmDir = path.join(baseDir, ".axm");
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify(
      {
        agents,
        ...(rulesConfig === undefined ? {} : { rulesConfig }),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
};

describe("rules handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-handler-"));
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
    return {
      provide: context.provide,
      logs: context.logs,
      rendererState: context.rendererState,
    };
  };

  it.effect("enables instruction-file management", () => {
    const { provide } = makeLayers();
    initWorkspace(tempDir, ["claude-code"]);
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

    return provide(
      Effect.gen(function* () {
        yield* handleRulesEnable({ fileName: "AGENTS.md", gitignore: true });

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.rulesConfig.instructions).toEqual({
          fileName: "AGENTS.md",
          gitignoreAliases: true,
        });
      }),
    );
  });

  it.effect("emits applied JSON when enabling instruction-file management", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"]);

    return provide(
      Effect.gen(function* () {
        yield* handleRulesEnable({ fileName: "AGENTS.md", gitignore: true });

        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Enable instruction-file management",
        });
      }),
    );
  });

  it.effect("emits a structured disabled status in human mode", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(tempDir, ["claude-code"], {
      instructions: false,
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRulesStatus();

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
      instructions: {
        fileName: "AGENTS.md",
        gitignoreAliases: true,
      },
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

    return provide(
      Effect.gen(function* () {
        yield* handleRulesStatus();

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
      instructions: {
        fileName: "AGENTS.md",
        gitignoreAliases: true,
      },
    });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

    return provide(
      Effect.gen(function* () {
        yield* handleRulesStatus();

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
      instructions: {
        fileName: "AGENTS.md",
        gitignoreAliases: true,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRulesStatus();

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
      instructions: {
        fileName: "AGENTS.md",
        gitignoreAliases: true,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRulesEnable({ fileName: "AGENTS.md", gitignore: true });

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
    initWorkspace(tempDir, ["claude-code"], {
      instructions: false,
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRulesDisable();

        expect(logs.success).toEqual(["Instruction-file management is already disabled."]);
      }),
    );
  });

  it.effect("emits JSON no-op when instruction-file management is already disabled", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    initWorkspace(tempDir, ["claude-code"], {
      instructions: false,
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRulesDisable();

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
      instructions: {
        fileName: "AGENTS.md",
        gitignoreAliases: true,
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleRulesDisable();

        const settings = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
        );
        expect(settings.rulesConfig.instructions).toBe(false);
        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Disable instruction-file management",
        });
      }),
    );
  });
});
