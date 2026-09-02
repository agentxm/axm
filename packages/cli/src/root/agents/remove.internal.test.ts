import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { codingAgentForId, CodingAgentRepository } from "@agentxm/extension-workspace";
import type { CodingAgentRepositoryService } from "@agentxm/extension-workspace";
import { makeAppError } from "../../app-error/index.js";
import { coupleAppError } from "../../app-error/conversions.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer, TestRenderer } from "../../cli-renderer/index.js";
import type { WorkspaceMutationsOptions } from "@agentxm/workspace-state";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-operations/live";
import { ResolvePlanInteractionTest } from "@agentxm/workspace-operations/testing";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  planResultUnits,
} from "../../test-helpers.js";
import { handleAgentsRemove } from "./remove.js";

const writeWorkspace = (
  axmDir: string,
  options: { readonly agents: ReadonlyArray<string>; readonly lockfile: string },
) => {
  const projectRoot = path.dirname(axmDir);
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "axm.json"),
    JSON.stringify({ owner: "@acme", agents: options.agents }, null, 2),
  );
  fs.writeFileSync(path.join(projectRoot, "axm-lock.yaml"), options.lockfile);
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
    readonly failCleanupAtApply?: boolean;
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
        projectRoot: opts?.wsOverrides?.projectRoot ?? decodeAbsolutePathSync(tempDir),
      }),
      baseLayer,
    );
    const opencode = codingAgentForId("opencode");
    let skillsResolutionCount = 0;
    const cleanupAgent =
      opts?.failCleanupAtApply === true
        ? {
            ...opencode,
            resolveEffectiveSkillsDir: (args: { readonly workspaceRoot: string }) => {
              skillsResolutionCount += 1;
              return skillsResolutionCount === 1
                ? opencode.resolveEffectiveSkillsDir(args)
                : coupleAppError(
                    makeAppError({
                      code: "internal",
                      detail: "Injected managed artifact cleanup failure",
                    }),
                  );
            },
          }
        : opencode;
    const agentRepo: CodingAgentRepositoryService = {
      get: () => Effect.succeed(opencode),
      all: Effect.succeed([cleanupAgent]),
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
      lockfile: "lockfileVersion: 6\nskills: {}\n",
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
      lockfile: "lockfileVersion: 6\nskills: {}\n",
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
          units: [
            { label: "Remove managed agent artifacts", state: "ready" },
            { label: "Remove opencode", state: "ready" },
          ],
        });
      }),
    );
  });

  it.effect("emits applied plan JSON in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 6\nskills: {}\n",
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
          units: [
            {
              label: "Remove managed agent artifacts",
              state: "unchanged",
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
              state: "committed",
              message: "Removed opencode",
              artifact: {
                path: "axm.json",
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

  it.effect("reports cleanup failure instead of a removed-agent success", () => {
    const { provide, rendererState } = makeLayers({ failCleanupAtApply: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 6\nskills: {}\n",
    });

    return provide(
      Effect.gen(function* () {
        yield* handleAgentsRemove({
          ids: ["opencode"],
          yes: true,
          force: false,
          preview: false,
        });

        expect(rendererState.logs).toContainEqual({
          _tag: "error",
          message: "Failed to remove 2 agents",
        });
        expect(rendererState.logs).toContainEqual(
          expect.objectContaining({
            _tag: "error",
            message: expect.stringContaining("Injected managed artifact cleanup failure"),
          }),
        );
        expect(rendererState.logs).not.toContainEqual({
          _tag: "success",
          message: "Removed 1 agent",
        });
        const settings: { readonly agents?: unknown } = JSON.parse(
          fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"),
        );
        expect(settings.agents).toEqual(["opencode"]);
      }),
    );
  });

  it.effect("reports removed managed artifact targets as workspace-relative paths", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspace(path.join(tempDir, ".axm"), {
      agents: ["opencode"],
      lockfile: "lockfileVersion: 6\nskills: {}\n",
    });
    const sourceDir = path.join(
      tempDir,
      "agent_extensions",
      "agentxm",
      "@agentxm",
      "skills",
      "axm",
      "src",
    );
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
        const units = planResultUnits(result);
        expect(units[0]).toMatchObject({
          label: "Remove managed agent artifacts",
          state: "committed",
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
      lockfile: "lockfileVersion: 4\nskills: []\n",
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
