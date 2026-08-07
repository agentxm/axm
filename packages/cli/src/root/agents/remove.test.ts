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
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { ResolvePlanInteractionTest } from "@agentxm/client-core/unstable/workspace";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  planResultSteps,
} from "../../test-helpers.js";
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

  const makeLayers = (opts?: {
    readonly wsOverrides?: Partial<WorkspaceMutationsOptions>;
    readonly machine?: boolean;
  }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const interaction = ResolvePlanInteractionTest();
    const baseLayer = Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer(),
      interaction.layer,
    );
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
      lockfile: "lockfileVersion: 3\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          yes: false,
          force: false,
          preview: true,
        });

        expect(
          rendererState.logs.some(
            (entry) => entry._tag === "success" && entry.message.includes("Done"),
          ),
        ).toBe(false);
      }),
    );
  });

  it.effect("emits previewed plan JSON in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 3\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          yes: false,
          force: false,
          preview: true,
        });

        const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          totalSteps: 2,
        });
        expect(result).toMatchObject({
          steps: [
            { label: "Remove managed agent artifacts", status: "ready" },
            { label: "Remove opencode", status: "ready" },
          ],
        });
      }),
    );
  });

  it.effect("emits applied plan JSON in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 3\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          yes: false,
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          totalSteps: 2,
          appliedCount: 1,
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Remove managed agent artifacts",
              status: "unchanged",
              message: "Removed 0 managed artifacts",
              artifact: {
                path: "managed agent artifacts",
                scope: "project",
                agents: ["opencode"],
                change: "unchanged",
                fileCount: 0,
              },
            },
            {
              label: "Remove opencode",
              status: "applied",
              message: "Removed opencode",
              artifact: {
                path: ".axm/settings.json",
                scope: "project",
                agents: ["opencode"],
                change: "updated",
                fileCount: 1,
              },
            },
          ],
        });
      }),
    );
  });

  it.effect("reports removed managed artifact targets as workspace-relative paths", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 3\nskills: {}\n",
    });
    const sourceDir = path.join(tempDir, ".axm", "extensions", "@agentxm", "skills", "axm", "src");
    const skillsDir = path.join(tempDir, ".opencode", "skills");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.symlinkSync(path.relative(skillsDir, sourceDir), path.join(skillsDir, "axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          yes: false,
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          totalSteps: 2,
        });
        const steps = planResultSteps(result);
        expect(steps[0]).toMatchObject({
          label: "Remove managed agent artifacts",
          status: "applied",
          artifact: {
            path: "managed agent artifacts",
            scope: "project",
            agents: ["opencode"],
            change: "removed",
            fileCount: 1,
            targets: [
              {
                path: ".opencode/skills/axm",
                change: "removed",
              },
            ],
          },
        });
      }),
    );
  });

  it.effect("emits no-op JSON when all requested agents are already absent", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["claude-code"],
      lockfile: "lockfileVersion: 3\nskills: []\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          yes: false,
          force: false,
          preview: false,
        });

        const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          message: "All requested agents are already absent",
        });
        expect(result).toMatchObject({
          planDescription: "Remove opencode and clean up managed artifacts",
        });
      }),
    );
  });
});
