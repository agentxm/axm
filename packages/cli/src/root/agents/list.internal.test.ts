import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer, TestRenderer } from "../../screen/index.js";
import { AgentExecutableResolver } from "@agentxm/agent-integration";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";
import type { WorkspaceMutationsOptions } from "@agentxm/workspace-state";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-operations/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { expectNoPlanEnvelope } from "../../test-helpers.js";
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

  const makeLayers = (opts?: {
    readonly machine?: boolean;
    readonly wsOverrides?: Partial<WorkspaceMutationsOptions>;
  }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
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
        ...opts?.wsOverrides,
        projectRoot: opts?.wsOverrides?.projectRoot ?? decodeAbsolutePathSync(tempDir),
      }),
      baseLayer,
    );
    const fullLayer = Layer.mergeAll(baseLayer, wsLayer);

    return {
      provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(fullLayer)),
      rendererState: renderer.state,
    };
  };

  it.effect("shows configured and detected agents by default", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), ["claude-code"]);
    fs.mkdirSync(path.join(tempDir, ".cursor"), { recursive: true });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsList({ detected: false, available: false });

        const table = rendererState.docs[0]?.doc.find((node) => node._tag === "table");
        expect(table).toMatchObject({
          _tag: "table",
          rows: expect.arrayContaining([
            expect.arrayContaining(["claude-code", "yes"]),
            expect.arrayContaining(["cursor", "no", "yes"]),
          ]),
          caption: "2 coding agents",
        });
      }),
    );
  });

  it.effect("emits structured JSON in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), ["claude-code"]);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsList({ detected: false, available: true });

        expect(rendererState.results[0]).toEqual(
          expect.objectContaining({
            data: expect.objectContaining({
              configured: ["claude-code"],
              available: expect.arrayContaining(["claude-code", "cursor"]),
            }),
          }),
        );
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });

  it.effect("pins the machine payload shape and key order", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), ["claude-code"]);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsList({ detected: false, available: false });

        const data = rendererState.results[0]?.data;
        expect(Object.keys(data as object)).toEqual([
          "items",
          "configured",
          "detected",
          "available",
          "count",
        ]);
        const { available, ...rest } = data as { readonly available: ReadonlyArray<string> };
        expect(JSON.stringify(rest)).toBe(
          '{"items":[{"id":"claude-code","name":"Claude Code","configured":true,"detected":false,' +
            '"instructions":"manual","lifecycle":"active"}],' +
            '"configured":["claude-code"],"detected":[],"count":1}',
        );
        expect(available).toEqual([...CONFIGURABLE_AGENT_IDS]);
      }),
    );
  });

  it.effect("reports lifecycle for retired agents and their successors", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), ["gemini-cli", "roo"]);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsList({ detected: false, available: false });

        const data = rendererState.results[0]?.data as {
          readonly items: ReadonlyArray<{ readonly id: string; readonly lifecycle: string }>;
        };
        const byId = new Map(data.items.map((item) => [item.id, item.lifecycle]));
        expect(byId.get("gemini-cli")).toBe("retired");
        expect(byId.get("roo")).toBe("retired");
        expect(lifecycleCell("gemini-cli")).toBe("retired -> antigravity");
        expect(lifecycleCell("roo")).toBe("retired");
        expect(lifecycleCell("claude-code")).toBe("");
      }),
    );
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

  it.effect("emits setup suggestion for empty machine output", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(path.join(tempDir, ".axm"), []);

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsList({ detected: false, available: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
        expect(rendererState.suggestions).toEqual([SET_UP_AXM_WORKSPACE]);
      }),
    );
  });
});
