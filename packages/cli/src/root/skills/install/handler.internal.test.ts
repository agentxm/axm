/**
 * Unit tests for the skills install handler error propagation.
 *
 * Verifies that resolver errors (e.g., REGISTRY_SKILL_NOT_FOUND) are preserved
 * rather than being wrapped in a generic INVALID_SOURCE error, while true parse
 * failures still produce INVALID_SOURCE.
 */

import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { afterEach, beforeEach } from "vitest";
import { previewOrApplyPlan, deriveOperationOutcome } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/extension-workspace";
import { InstallSkillCommandWorkflowActions } from "./command-actions.js";
import { handleInstall, handleInstallWithActions, type InstallHandlerArgs } from "./handler.js";
import {
  expectNoOpPlanResult,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../../test-helpers.js";
import { writeWorkspaceFiles } from "../../../test-stubs.js";

const unsupportedRegistryHttpClient = HttpClient.make((request) =>
  Effect.succeed(
    HttpClientResponse.fromWeb(
      request,
      new Response("Registry operation is unsupported", { status: 501 }),
    ),
  ),
);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    sources?: ReadonlyArray<unknown>;
    owner?: string;
    minimumReleaseAgeExclude?: ReadonlyArray<string>;
  },
) => {
  writeWorkspaceFiles(axmDir, {
    agents: ["claude-code"],
    owner: opts?.owner,
    sources: opts?.sources,
    minimumReleaseAgeExclude: opts?.minimumReleaseAgeExclude,
  });
};

const createRegistrySkill = ({
  registryRoot,
  owner,
  name,
  published = "2025-01-01T00:00:00Z",
}: {
  readonly registryRoot: string;
  readonly owner: string;
  readonly name: string;
  readonly published?: string;
}) => {
  const skillDir = path.join(registryRoot, "extensions", owner, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  const stagingDir = path.join(skillDir, "staging");
  fs.mkdirSync(path.join(stagingDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(stagingDir, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n# Test\n`,
  );
  const archivePath = path.join(skillDir, "1.0.0.zip");
  execFileSync("zip", ["-qr", archivePath, "src"], { cwd: stagingDir });
  fs.rmSync(stagingDir, { recursive: true, force: true });
  const archive = fs.readFileSync(archivePath);
  fs.writeFileSync(
    path.join(skillDir, "index.json"),
    JSON.stringify({
      name,
      owner,
      type: "skill",
      publisherBindingId: "hbnd_test",
      deprecation: null,
      versions: [
        {
          version: "1.0.0",
          published,
          agents: [],
          integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
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
    machine?: boolean;
    httpClient?: HttpClient.HttpClient;
  }) => {
    const { machine, httpClient, ...flags } = flagsOverrides ?? {};
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
      flags,
      machine,
      ...(httpClient === undefined ? {} : { httpClient }),
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
    const FullLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      handlerTestContext.wsLayer,
      SPLayer,
      CodingAgentRepositoryLive,
      SMLayer,
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
    const actions = {
      parseArgs: () =>
        Effect.succeed({
          source: { type: "local" as const, path: tempDir },
          versionRange: Option.none(),
          requestedSkills: [],
          requestedOwner: Option.none(),
          resolutionProbes: [],
          all: false,
          force: false,
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
    } satisfies Effect.Success<typeof InstallSkillCommandWorkflowActions>;
    const fullLayer = Layer.merge(handlerTestContext.baseLayer, handlerTestContext.wsLayer);
    const provide = makeEffectProvide(fullLayer);
    const handleTestInstall = (
      args: InstallHandlerArgs,
      flags: Parameters<typeof handleInstall>[1],
    ) => handleInstallWithActions(args, flags, actions);

    return {
      provide,
      handleInstall: handleTestInstall,
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/empty-reg" }],
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
        expect(rendererState.spinnerMessages).toEqual(["Resolving extension sources", "Failed"]);
      }),
    );
  });

  it.effect(
    "discovers from the resolved registry source when an earlier registry is unsupported",
    () => {
      const { provide } = makeLayers({ httpClient: unsupportedRegistryHttpClient });

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
          { type: "registry", name: "agentxm", location: `file://${registryDir}` },
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
      httpClient: unsupportedRegistryHttpClient,
    });

    const registryDir = path.join(tempDir, "registry");
    createRegistrySkill({ registryRoot: registryDir, owner: "@myorg", name: "effect-basics" });

    initWorkspace(path.join(tempDir, ".axm"), {
      owner: "@myorg",
      sources: [
        { type: "registry", name: "remote", location: getUnavailableRegistryLocation() },
        { type: "registry", name: "agentxm", location: `file://${registryDir}` },
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
      httpClient: unsupportedRegistryHttpClient,
    });

    const registryDir = path.join(tempDir, "registry");
    createRegistrySkill({ registryRoot: registryDir, owner: "@myorg", name: "effect-basics" });

    initWorkspace(path.join(tempDir, ".axm"), {
      owner: "@myorg",
      sources: [
        { type: "registry", name: "remote", location: getUnavailableRegistryLocation() },
        { type: "registry", name: "agentxm", location: `file://${registryDir}` },
      ],
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("effect-basics"), {
          yes: false,
          force: false,
          preview: false,
        });

        expect(rendererState.spinnerMessages).toContain("Resolving extension sources");
        expect(rendererState.spinnerMessages).toContain("Resolved extension sources");
        expect(logs.info.some((line) => line.includes("Source:"))).toBe(true);
        expect(logs.info.some((line) => line.includes("Resolution:"))).toBe(true);
      }),
    );
  });

  it.effect("warns for a brand-new attended registry skill", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const registryDir = path.join(tempDir, "registry");
    createRegistrySkill({
      registryRoot: registryDir,
      owner: "@myorg",
      name: "effect-basics",
      published: "2099-01-01T00:00:00Z",
    });
    initWorkspace(path.join(tempDir, ".axm"), {
      owner: "@myorg",
      sources: [{ type: "registry", name: "agentxm", location: `file://${registryDir}` }],
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@myorg/skills/effect-basics@1.0.0"), {
          yes: true,
          force: false,
          preview: false,
        });
        const payload = expectRecord(rendererState.results[0]?.data);
        const result = expectRecord(property(payload, "result"));
        const counts = expectRecord(property(result, "counts"));
        expect(property(counts, "warnings")).toBe(1);
      }),
    );
  });

  it.effect("suppresses the brand-new advisory for an excluded attended registry skill", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const registryDir = path.join(tempDir, "registry");
    createRegistrySkill({
      registryRoot: registryDir,
      owner: "@myorg",
      name: "effect-basics",
      published: "2099-01-01T00:00:00Z",
    });
    initWorkspace(path.join(tempDir, ".axm"), {
      owner: "@myorg",
      minimumReleaseAgeExclude: ["@myorg/skills/effect-basics"],
      sources: [{ type: "registry", name: "agentxm", location: `file://${registryDir}` }],
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@myorg/skills/effect-basics@1.0.0"), {
          yes: true,
          force: false,
          preview: false,
        });
        const payload = expectRecord(rendererState.results[0]?.data);
        const result = expectRecord(property(payload, "result"));
        const counts = expectRecord(property(result, "counts"));
        expect(property(counts, "warnings")).toBe(0);
      }),
    );
  });

  it.effect("reports no-op when interactive selection chooses no skills", () => {
    const { provide, handleInstall, logs } = makeNoSelectionLayers();

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
    const { provide, handleInstall, logs, rendererState } = makeNoSelectionLayers({
      machine: true,
    });

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

  it.effect("preserves source discovery failures with a concrete cause", () => {
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
      }),
    );
  });

  it.effect("reports discovered skill names when no local selector matches", () => {
    const { provide } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));
    const sourceDir = path.join(tempDir, "portable-skills");
    const skillDir = path.join(sourceDir, ".agents", "skills", "review-pr");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: review-pr\ndescription: Review a pull request\n---\n\n# Review PR\n",
    );

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(defaultArgs(sourceDir, { skills: ["missing"] }), {
          yes: false,
          force: false,
          preview: false,
        }).pipe(Effect.flip);

        const appError = getAppError(error);
        expect(appError.code).toBe("not_found");
        expect(appError.detail).toBe("No skills matched: missing. Source contains: review-pr");
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

  it.effect("rejects --bundled for any identifier except the official AXM skill", () => {
    const { provide } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        const error = yield* handleInstall(defaultArgs("@acme/skills/axm", { bundled: true }), {
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.flip);
        expect(getAppError(error).code).toBe("usage");
      }),
    );
  });

  it.effect("previews bundled recovery without changing workspace bytes", () => {
    const { provide } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    initWorkspace(axmDir);
    const settingsBefore = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
    const lockBefore = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8");

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@agentxm/skills/axm", { bundled: true }), {
          yes: false,
          force: false,
          preview: true,
        });

        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsBefore);
        expect(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8")).toBe(lockBefore);
        expect(fs.existsSync(path.join(tempDir, "skills", "axm"))).toBe(false);
      }),
    );
  });

  it.effect("installs bundled recovery with a workspace source and no Registry request", () => {
    const { provide } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    initWorkspace(axmDir, {
      sources: [{ type: "registry", name: "offline", location: getUnavailableRegistryLocation() }],
    });

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@agentxm/skills/axm", { bundled: true }), {
          yes: true,
          force: false,
          preview: false,
        });

        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"),
        );
        expect(settings).toMatchObject({
          skills: {
            axm: {
              source: "workspace",
              origin: "bundled",
            },
          },
        });
        expect(
          fs.existsSync(
            path.join(
              tempDir,
              "agent_extensions",
              "agentxm",
              "@agentxm",
              "skills",
              "axm",
              "src",
              "SKILL.md",
            ),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("refuses to overwrite an authored official AXM skill", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    const axmDir = path.join(tempDir, ".axm");
    initWorkspace(axmDir);
    const settingsPath = path.join(tempDir, "axm.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        agents: ["claude-code"],
        skills: {
          axm: {
            source: "workspace",
            enabled: true,
          },
        },
      }),
    );
    const skillPath = path.join(tempDir, "skills", "axm", "src", "SKILL.md");
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, "authored in-flight bytes\n");
    const settingsBefore = fs.readFileSync(settingsPath, "utf8");
    const skillBefore = fs.readFileSync(skillPath, "utf8");

    return provide(
      Effect.gen(function* () {
        yield* handleInstall(defaultArgs("@agentxm/skills/axm", { bundled: true }), {
          yes: true,
          force: true,
          preview: false,
        });

        expect(rendererState.results[0]?.ok).toBe(false);
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "failed",
            counts: expect.objectContaining({ failed: 1 }),
          },
        });
        expect(JSON.stringify(rendererState.results[0]?.data)).toContain("workspace-authored");
        expect(rendererState.suggestions).toContainEqual({
          description: "Preserve the authored skill and inspect executable compatibility guidance",
          cmd: "axm help upgrade",
        });
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(settingsBefore);
        expect(fs.readFileSync(skillPath, "utf8")).toBe(skillBefore);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Readiness gate
  // ---------------------------------------------------------------------------

  it.effect("rejects plan errors even when confirmation is bypassed", () => {
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
        const resolution = yield* previewOrApplyPlan(plan, {
          execution: preapprovedPlanExecution,
        });
        expect(logs.warn).toEqual([]);
        expect(deriveOperationOutcome(resolution)).toBe("blocked");
        expect(resolution).toMatchObject({
          _tag: "OperationResolution",
          blocking: {
            class: "precondition-unmet",
            subject: "test-step",
            phase: "planning",
            detail: "Test error step",
            causeCode: "conflict",
          },
        });
      }),
    );
  });
});
