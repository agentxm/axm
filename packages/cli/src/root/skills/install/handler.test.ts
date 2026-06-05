/**
 * Unit tests for the skills install handler error propagation.
 *
 * Verifies that resolver errors (e.g., REGISTRY_SKILL_NOT_FOUND) are preserved
 * rather than being wrapped in a generic INVALID_SOURCE error, while true parse
 * failures still produce INVALID_SOURCE.
 */

import { createServer, type Server } from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import {
  InstallSkillCommandWorkflowActions,
  InstallSkillCommandWorkflowActionsLive,
} from "./command-actions.js";
import { handleInstall, type InstallHandlerArgs } from "./handler.js";
import {
  expectNoOpPlanResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    sources?: ReadonlyArray<unknown>;
    owner?: string;
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.sources) settings["sources"] = opts.sources;
  if (opts?.owner) settings["owner"] = opts.owner;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

const createRegistrySkill = ({
  registryRoot,
  owner,
  name,
}: {
  readonly registryRoot: string;
  readonly owner: string;
  readonly name: string;
}) => {
  const skillDir = path.join(registryRoot, "extensions", owner, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "index.json"),
    JSON.stringify({
      name,
      owner,
      type: "skill",
      versions: [
        {
          version: "1.0.0",
          published: "2025-01-01T00:00:00Z",
          agents: [],
          integrity: "sha512-AAAA==",
        },
      ],
    }),
  );
};

interface UnavailableRegistry {
  readonly location: string;
  readonly server: Server;
}

const startUnavailableRegistry = () =>
  new Promise<UnavailableRegistry>((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ code: "registry_unavailable" }));
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        reject(new Error("Failed to bind test registry server"));
        return;
      }

      resolve({
        location: `http://127.0.0.1:${String(address.port)}`,
        server,
      });
    });
  });

const stopUnavailableRegistry = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const defaultArgs = (
  source: string,
  overrides: Partial<InstallHandlerArgs> = {},
): InstallHandlerArgs => ({
  source: Option.some(source),
  skills: [],
  all: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("skills install handler — error propagation", () => {
  let tempDir: string;
  let originalCwd: string;
  let unavailableRegistry: UnavailableRegistry | undefined;

  beforeEach(async () => {
    unavailableRegistry = await startUnavailableRegistry();
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (unavailableRegistry !== undefined) {
      await stopUnavailableRegistry(unavailableRegistry.server);
      unavailableRegistry = undefined;
    }
  });

  const getUnavailableRegistryLocation = () => {
    if (unavailableRegistry === undefined) {
      throw new Error("Expected unavailable registry test server");
    }

    return unavailableRegistry.location;
  };

  const makeLayers = (flagsOverrides?: {
    verbose?: boolean;
    debug?: boolean;
    nonInteractive?: boolean;
  }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
      flags: flagsOverrides,
    });
    const SPLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(handlerTestContext.baseLayer, handlerTestContext.wsLayer),
    );
    const SMLayer = Layer.provide(
      SkillManagerLive,
      Layer.mergeAll(
        handlerTestContext.baseLayer,
        handlerTestContext.wsLayer,
        SPLayer,
        CodingAgentRepositoryLive,
      ),
    );
    const ActionsLayer = Layer.provide(
      InstallSkillCommandWorkflowActionsLive,
      Layer.mergeAll(
        handlerTestContext.baseLayer,
        handlerTestContext.wsLayer,
        SPLayer,
        SMLayer,
        CodingAgentRepositoryLive,
      ),
    );
    const FullLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      handlerTestContext.wsLayer,
      SPLayer,
      CodingAgentRepositoryLive,
      ActionsLayer,
    );
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      multiselectMock: handlerTestContext.promptState,
      rendererState: handlerTestContext.rendererState,
    };
  };

  const makeNoSelectionLayers = (options?: { readonly machine?: boolean }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      machine: options?.machine,
    });
    const actionsLayer = Layer.succeed(InstallSkillCommandWorkflowActions, {
      parseArgs: () =>
        Effect.succeed({
          source: { type: "local" as const, path: tempDir },
          versionRange: Option.none(),
          requestedSkills: [],
          requestedOwner: Option.none(),
          resolutionProbes: [],
          all: false,
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({ skillsToInstall: [] }),
      buildPlan: () =>
        Effect.succeed({
          _tag: "Plan" as const,
          name: "Install skills",
          description: Option.none<string>(),
          jobs: [{ concurrency: 1 as const, steps: [] }],
        }),
    });
    const fullLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      handlerTestContext.wsLayer,
      actionsLayer,
    );
    const provide = makeEffectProvide(fullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  it.effect(
    "preserves REGISTRY_SKILL_NOT_FOUND from resolver instead of wrapping in INVALID_SOURCE",
    () => {
      const { provide } = makeLayers();
      // WorkspaceMutations has a default owner but no registries contain the skill
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/empty-reg" }],
        owner: "@myorg",
      });

      return provide(
        Effect.gen(function* () {
          // "nonexistent-skill" is a bare name — it will go through resolveSkillRegistrySourceByName
          // which will fail with REGISTRY_SKILL_NOT_FOUND when no registry has it
          const error = yield* handleInstall(defaultArgs("nonexistent-skill"), {
            yes: false,
            force: false,
            preview: false,
          }).pipe(Effect.flip);
          const appError = getAppError(error);
          expect(appError.code).toBe("not_found");
        }),
      );
    },
  );

  it.effect("returns INVALID_SOURCE for unparseable input", () => {
    const { provide, rendererState } = makeLayers({ verbose: true });
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        // Empty string cannot be parsed — parseInputPattern returns Option.none()
        const error = yield* handleInstall(defaultArgs(""), {
          yes: false,
          force: false,
          preview: false,
        }).pipe(Effect.flip);
        const appError = getAppError(error);
        expect(appError.code).toBe("validation");
        expect(rendererState.spinnerMessages).toEqual([]);
      }),
    );
  });

  it.effect(
    "discovers from the resolved registry source when an earlier registry is unsupported",
    () => {
      const { provide } = makeLayers();

      const registryDir = path.join(tempDir, "registry");
      createRegistrySkill({
        registryRoot: registryDir,
        owner: "@myorg",
        name: "effect-basics",
      });

      initWorkspace(path.join(tempDir, ".axm"), {
        owner: "@myorg",
        sources: [
          { type: "registry", name: "remote", location: getUnavailableRegistryLocation() },
          { type: "registry", name: "local", location: `file://${registryDir}` },
        ],
      });

      return provide(
        handleInstall(defaultArgs("effect-basics", { all: true }), {
          yes: false,
          force: false,
          preview: false,
        }),
      );
    },
  );

  it.effect("auto-selects a uniquely matched bare-name skill without multiselect prompt", () => {
    const { provide, logs, multiselectMock } = makeLayers({
      nonInteractive: false,
    });

    const registryDir = path.join(tempDir, "registry");
    createRegistrySkill({ registryRoot: registryDir, owner: "@myorg", name: "effect-basics" });

    initWorkspace(path.join(tempDir, ".axm"), {
      owner: "@myorg",
      sources: [
        { type: "registry", name: "remote", location: getUnavailableRegistryLocation() },
        { type: "registry", name: "local", location: `file://${registryDir}` },
      ],
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("effect-basics"), {
          yes: false,
          force: false,
          preview: false,
        });

        expect(multiselectMock.multiselectCalls).toHaveLength(0);
        expect(logs.message.some((line) => line.startsWith("Resolution:"))).toBe(false);
      }),
    );
  });

  it.effect("shows resolution plumbing for bare-name install in verbose mode", () => {
    const { provide, logs, rendererState } = makeLayers({
      nonInteractive: false,
      verbose: true,
    });

    const registryDir = path.join(tempDir, "registry");
    createRegistrySkill({ registryRoot: registryDir, owner: "@myorg", name: "effect-basics" });

    initWorkspace(path.join(tempDir, ".axm"), {
      owner: "@myorg",
      sources: [
        { type: "registry", name: "remote", location: getUnavailableRegistryLocation() },
        { type: "registry", name: "local", location: `file://${registryDir}` },
      ],
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("effect-basics"), {
          yes: false,
          force: false,
          preview: false,
        });

        expect(rendererState.spinnerMessages).toEqual([]);
        expect(logs.info.some((line) => line.includes("Source:"))).toBe(true);
        expect(logs.info.some((line) => line.includes("Resolution:"))).toBe(true);
      }),
    );
  });

  it.effect("reports no-op when interactive selection chooses no skills", () => {
    const { provide, logs } = makeNoSelectionLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@myorg/skills"), {
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expect(logs.success).toEqual(["No skills installed."]);
      }),
    );
  });

  it.effect("emits JSON no-op when interactive selection chooses no skills", () => {
    const { provide, logs, rendererState } = makeNoSelectionLayers({ machine: true });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@myorg/skills"), {
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Install skills",
          message: "No skills installed.",
        });
      }),
    );
  });

  it.effect("returns DISCOVER_FAILED with a concrete reason detail", () => {
    const { provide } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(defaultArgs("/path/does/not/exist"), {
          yes: false,
          force: false,
          preview: false,
        }).pipe(Effect.flip);
        const appError = getAppError(error);
        expect(appError.code).toBe("usage");
        expect(appError.cause).toBeDefined();
      }),
    );
  });

  it.effect("rejects --skill without a source", () => {
    const { provide } = makeLayers();

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(
          {
            source: Option.none(),
            skills: ["effect-basics"],
            all: false,
          },
          {
            yes: false,
            force: false,
            preview: false,
          },
        ).pipe(Effect.flip);

        const appError = getAppError(error);
        expect(appError.code).toBe("usage");
      }),
    );
  });

  it.effect("rejects --all without a source", () => {
    const { provide } = makeLayers();

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(
          {
            source: Option.none(),
            skills: [],
            all: true,
          },
          {
            yes: false,
            force: false,
            preview: false,
          },
        ).pipe(Effect.flip);

        const appError = getAppError(error);
        expect(appError.code).toBe("usage");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // --force propagation to workspace previewOrApplyPlan
  // ---------------------------------------------------------------------------

  it.effect("--force in workspace options applies and reports plan errors structurally", () => {
    const { provide, logs } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        const plan = {
          _tag: "Plan" as const,
          name: "test-plan",
          description: Option.none<string>(),
          jobs: [
            {
              concurrency: 1 as const,
              steps: [
                {
                  readiness: "error" as const,
                  errorMessage: "Test error step",
                  label: "test-step",
                },
              ],
            },
          ],
        };
        const result = yield* previewOrApplyPlan(plan, { yes: false, force: true, preview: false });
        expect(logs.warn).toEqual([]);
        expect(result._tag).toBe("ExecutedPlan");
        if (result._tag === "ExecutedPlan") {
          expect(result.jobs[0]?.steps[0]).toMatchObject({
            label: "test-step",
            result: { result: "error", message: "Test error step" },
          });
        }
      }),
    );
  });
});
