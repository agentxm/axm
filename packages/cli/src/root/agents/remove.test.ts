import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import {
  CodingAgentRepository,
  makeProjectOnlyCodingAgent,
} from "@agentxm/client-core/unstable/agents";
import type { CodingAgentRepositoryService } from "@agentxm/client-core/unstable/agents";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { handleAgentsRemove } from "./remove.js";

const writeWorkspace = (
  axmDir: string,
  options: { readonly agents: ReadonlyArray<string>; readonly lockfile: string },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({ agents: options.agents }, null, 2),
  );
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), options.lockfile);
};

describe("agents remove.handler", () => {
  let tempDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-remove-handler-test-"));
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

  const makeLayers = (opts?: { readonly wsOverrides?: Partial<WorkspaceMutationsOptions> }) => {
    const renderer = TestRenderer.make();
    const baseLayer = Layer.mergeAll(NodeServices.layer, renderer.layer, TestFlagsLayer());
    const wsLayer = Layer.provide(
      coreWorkspaceLayer({
        scope: "project",
        ...opts?.wsOverrides,
      }),
      baseLayer,
    );
    const opencode = makeProjectOnlyCodingAgent({
      agentId: "opencode",
      displayName: "OpenCode",
      skillsProjectDir: ".opencode/skills",
      commandsProjectDir: ".opencode/command",
      subagentsProjectDir: ".opencode/agent",
    });
    const agentRepo: CodingAgentRepositoryService = {
      get: () => Effect.succeed(opencode),
      all: Effect.succeed([opencode]),
      getConfiguredAgents: () => Effect.succeed([]),
      getMaterializationAgents: () => Effect.succeed([]),
      getUnknownConfiguredAgentIds: () => Effect.succeed([]),
    };
    const fullLayer = Layer.mergeAll(
      baseLayer,
      wsLayer,
      Layer.succeed(CodingAgentRepository, agentRepo),
    );

    return {
      provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(fullLayer)),
      rendererState: renderer.state,
    };
  };

  it.effect("previews removal when the lockfile needs reconciliation", () => {
    const { provide, rendererState } = makeLayers();
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 1\nskills: []\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          yes: false,
          force: false,
          preview: true,
        });

        expect(rendererState.logs).toEqual(
          expect.arrayContaining([expect.objectContaining({ _tag: "success", message: "Done" })]),
        );
      }),
    );
  });
});
