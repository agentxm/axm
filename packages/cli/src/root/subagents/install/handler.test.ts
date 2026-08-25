/**
 * Unit tests for the subagents install handler error propagation.
 *
 * Verifies that resolver errors (e.g., REGISTRY_SUBAGENT_NOT_FOUND) are preserved
 * rather than being wrapped in a generic INVALID_SOURCE error, while true parse
 * failures still produce INVALID_SOURCE.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { operationPresentation } from "@agentxm/client-core/unstable/plan";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import {
  InstallSubagentCommandWorkflowActions,
  InstallSubagentCommandWorkflowActionsLive,
} from "./command-actions.js";
import { handleInstall, type InstallSubagentHandlerArgs } from "./handler.js";
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
    YAML.stringify({ lockfileVersion: 6, skills: {}, subagents: {} }),
  );
};

const defaultArgs = (
  source: string,
  overrides: Partial<InstallSubagentHandlerArgs> = {},
): InstallSubagentHandlerArgs => ({
  source: Option.some(source),
  subagents: [],
  all: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("subagents install handler — error propagation", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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
      SubagentManagerLive,
      Layer.mergeAll(
        handlerTestContext.baseLayer,
        handlerTestContext.wsLayer,
        SPLayer,
        CodingAgentRepositoryLive,
      ),
    );
    const ActionsLayer = Layer.provide(
      InstallSubagentCommandWorkflowActionsLive,
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
      ActionsLayer,
    );
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  const makeNoSelectionLayers = (options?: { readonly machine?: boolean }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      machine: options?.machine,
    });
    const actionsLayer = Layer.succeed(InstallSubagentCommandWorkflowActions, {
      parseArgs: () =>
        Effect.succeed({
          source: { type: "local" as const, path: tempDir },
          versionRange: Option.none(),
          requestedSubagents: [],
          requestedOwner: Option.none(),
          resolutionProbes: [],
          all: false,
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({ subagentsToInstall: [] }),
      buildPlan: () =>
        Effect.succeed({
          _tag: "Plan" as const,
          name: "Install subagents",
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

  const makeUnchangedInstallLayers = () => {
    const handlerTestContext = makeWorkspaceHandlerTestContext();
    const actionsLayer = Layer.succeed(InstallSubagentCommandWorkflowActions, {
      parseArgs: () =>
        Effect.succeed({
          source: { type: "local" as const, path: tempDir },
          versionRange: Option.none(),
          requestedSubagents: [],
          requestedOwner: Option.none(),
          resolutionProbes: [],
          all: false,
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () =>
        Effect.succeed({
          subagentsToInstall: [],
        }),
      buildPlan: () =>
        Effect.succeed({
          _tag: "Plan" as const,
          name: "Install subagent",
          description: Option.none<string>(),
          presentation: operationPresentation(
            { imperative: "install", past: "Installed", gerund: "Installing" },
            "subagent",
          ),
          jobs: [
            {
              concurrency: 1 as const,
              steps: [
                {
                  key: "subagent:planner",
                  readiness: "ready" as const,
                  label: "planner",
                  run: Effect.succeed({
                    result: "success" as const,
                    message: "Applied install operation",
                    artifact: {
                      path: ".claude/agents/planner.md",
                      scope: "project" as const,
                      agents: ["claude-code"],
                      version: "1.2.3",
                      change: "unchanged" as const,
                      fileCount: 1,
                    },
                  }),
                },
              ],
            },
          ],
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
    "preserves REGISTRY_SUBAGENT_NOT_FOUND from resolver instead of wrapping in INVALID_SOURCE",
    () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/empty-reg" }],
        owner: "@myorg",
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstall(defaultArgs("nonexistent-subagent"), {
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
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(defaultArgs(""), {
          yes: false,
          force: false,
          preview: false,
        }).pipe(Effect.flip);
        const appError = getAppError(error);
        expect(appError.code).toBe("validation");
        expect(rendererState.spinnerMessages).toEqual(["Resolving extension sources", "Failed"]);
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
        expect(appError.code).toBe("not_found");
        expect(appError.detail).toBe("No subagents found in source");
      }),
    );
  });

  it.effect("reports no-op when interactive selection chooses no subagents", () => {
    const { provide, logs } = makeNoSelectionLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@myorg/subagents"), {
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expect(logs.success).toEqual(["No subagents installed."]);
      }),
    );
  });

  it.effect("does not append the empty-selection message when install is unchanged", () => {
    const { provide, logs, rendererState } = makeUnchangedInstallLayers();

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@myorg/subagents/planner"), {
          yes: true,
          force: false,
          preview: false,
        });

        expect(logs.success).toEqual(["Already up to date — 1 subagent"]);
        expect(rendererState.summaries).toEqual([
          "planner   1.2.3   unchanged   1 file   .claude/agents/planner.md",
        ]);
      }),
    );
  });

  it.effect("emits JSON no-op when interactive selection chooses no subagents", () => {
    const { provide, logs, rendererState } = makeNoSelectionLayers({ machine: true });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@myorg/subagents"), {
          yes: false,
          force: false,
          preview: false,
        });

        expect(logs.warn).toEqual([]);
        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Install subagents",
          message: "No subagents installed.",
        });
      }),
    );
  });

  it.effect("rejects --subagent without a source", () => {
    const { provide } = makeLayers();

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(
          {
            source: Option.none(),
            subagents: ["researcher"],
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
            subagents: [],
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
});
