import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { handleAgentsList } from "./list.js";

const initWorkspace = (axmDir: string, agents: ReadonlyArray<string>) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({ agents }, null, 2));
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
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
    const baseLayer = Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer());
    const wsLayer = Layer.provide(
      coreWorkspaceLayer({
        scope: "project",
        ...opts?.wsOverrides,
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

        expect(rendererState.tables[0]?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "claude-code", configured: true }),
            expect.objectContaining({ id: "cursor", detected: true, configured: false }),
          ]),
        );
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
      }),
    );
  });
});
