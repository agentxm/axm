import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { RuleManagerLive } from "@agentxm/extension-lifecycle/live";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../test-helpers.js";
import { handleInstructionsDisable, handleInstructionsStatus } from "./instructions.js";
import { writeWorkspaceFiles } from "../test-stubs.js";

const initWorkspace = (
  baseDir: string,
  agents: ReadonlyArray<string>,
  instructionFiles?: false | Readonly<Record<string, unknown>>,
) => {
  writeWorkspaceFiles(path.join(baseDir, ".axm"), { agents });
  if (instructionFiles !== undefined) {
    const settingsPath = path.join(baseDir, "axm.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, instructionFiles }, null, 2));
  }
};

describe("instructions handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    // Canonicalized like the production workspace root: status reports
    // canonical paths, and macOS resolves /var to /private/var.
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "instructions-handler-")));
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

  it.effect("emits a structured disabled status in human mode", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(tempDir, ["claude-code"], false);

    return provide(
      Effect.gen(function* () {
        yield* handleInstructionsStatus();

        expect(rendererState.logs).toEqual([]);
        expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual({
          _tag: "paragraph",
          text: "Instruction-file management is disabled.",
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
        expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual({
          _tag: "paragraph",
          text: "No configured agents need instruction-file propagation.",
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

        expect(rendererState.logs).toEqual([]);
        expect(rendererState.docs.flatMap((entry) => entry.doc)).toContainEqual(
          expect.objectContaining({
            _tag: "table",
            rows: expect.arrayContaining([expect.arrayContaining(["claude-code"])]),
          }),
        );
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

        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8"));
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
