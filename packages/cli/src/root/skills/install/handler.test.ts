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
import { previewOrApplyPlan } from "@axm.sh/core/unstable/workspace";
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import { SkillManagerLive } from "@axm.sh/core/unstable/skills";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { InstallSkillCommandWorkflowActionsLive } from "./command-actions.js";
import { handleInstall, type InstallHandlerArgs } from "./handler.js";
import {
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
  if (opts?.owner) settings["profile"] = opts.owner;
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
      Layer.mergeAll(handlerTestContext.baseLayer, handlerTestContext.wsLayer, SPLayer, SMLayer),
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
      multiselectMock: handlerTestContext.promptState,
      rendererState: handlerTestContext.rendererState,
    };
  };

  it.effect(
    "preserves REGISTRY_SKILL_NOT_FOUND from resolver instead of wrapping in INVALID_SOURCE",
    () => {
      const { provide } = makeLayers();
      // Workspace has a default owner but no registries contain the skill
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
          expect(appError.code).toBe("REGISTRY_SKILL_NOT_FOUND");
        }),
      );
    },
  );

  it.effect("returns INVALID_SOURCE for unparseable input", () => {
    const { provide, rendererState } = makeLayers();
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
        expect(appError.code).toBe("INVALID_SOURCE");
        expect(rendererState.spinnerMessages).toContain("Parsing source...");
        expect(rendererState.spinnerMessages).toContain("Failed");
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
        expect(logs.message.some((line) => line.startsWith("Resolution:"))).toBe(true);
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
        expect(appError.code).toBe("DISCOVER_FAILED");
        const details = appError.details;
        const reason = details.find((d) => d.startsWith("Reason:"));
        expect(reason).toBeDefined();
        expect(reason).not.toBe("Reason:");
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
        expect(appError.code).toBe("SKILLS_INSTALL_SELECTOR_REQUIRES_SOURCE");
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
        expect(appError.code).toBe("SKILLS_INSTALL_ALL_REQUIRES_SOURCE");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // --force propagation to workspace previewOrApplyPlan
  // ---------------------------------------------------------------------------

  it.effect("--force in workspace options downgrades plan errors to warnings", () => {
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
        // --force downgrades errors to warnings and proceeds
        expect(logs.warn.some((m: string) => m.includes("Test error step"))).toBe(true);
        expect(result._tag).toBe("ExecutedPlan");
      }),
    );
  });
});
