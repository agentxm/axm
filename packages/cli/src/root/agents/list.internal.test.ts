import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestRenderer } from "../../screen/index.js";
import { AgentExecutableResolver } from "@agentxm/agent-integration";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-operations/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { SET_UP_AXM_WORKSPACE } from "../suggested-actions.js";
import { lifecycleCell } from "./lifecycle.js";
import { handleAgentsList } from "./list.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";

const initWorkspace = (axmDir: string, agents: ReadonlyArray<string>) => {
  writeWorkspaceFiles(axmDir, { agents });
};

describe("agents list.handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-list-handler-test-"));
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

  const makeLayers = () => {
    const renderer = TestRenderer.make();
    const baseLayer = Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer(),
      Layer.succeed(AgentExecutableResolver, {
        exists: () => Effect.succeed(false),
      }),
    );
    const wsLayer = Layer.provide(
      coreWorkspaceLayer({
        scope: "project",
        projectRoot: decodeAbsolutePathSync(tempDir),
      }),
      baseLayer,
    );
    const fullLayer = Layer.mergeAll(baseLayer, wsLayer);

    return {
      provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(fullLayer)),
      rendererState: renderer.state,
    };
  };

  it("formats lifecycle cells with optional successor text", () => {
    expect(lifecycleCell("gemini-cli")).toBe("retired -> antigravity");
    expect(lifecycleCell("roo")).toBe("retired");
    expect(lifecycleCell("claude-code")).toBe("");
  });

  it.effect("emits a single empty list payload for the human empty state", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), []);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsList({ detected: false, available: false });

        expect(rendererState.tables).toEqual([]);
        expect(rendererState.logs).toEqual([]);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.docs[0]?.doc).toContainEqual({
          _tag: "paragraph",
          text: "No coding agents configured or detected.",
        });
        expect(rendererState.suggestions).toEqual([SET_UP_AXM_WORKSPACE]);
      }),
    );
  });
});
