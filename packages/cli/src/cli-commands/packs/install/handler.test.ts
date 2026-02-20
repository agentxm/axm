/**
 * Unit tests for the packs install command handler.
 *
 * Tests the pack install flow: input validation, plan build, and execution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  makeSpinnerTestLayer,
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import {
  SourceHostProvidersLive,
  SourceHostProviders,
  type SourceHostProvidersService,
  type ExtensionFiles,
  type PackExtensionRef,
} from "../../../sources/index.js";
import { handleInstallPack, parsePackInput, type InstallPackHandlerArgs } from "./handler.js";
import { CliError, makeCliError } from "../../../cli-error/index.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Stub methods for SourceHostProvidersService. */
const serviceStubs = {
  find: (() => Effect.succeed([])) as SourceHostProvidersService["find"],
  fetch: (() =>
    Effect.fail(
      makeCliError({ code: "FETCH_FAILED", what: "stub" }),
    )) as SourceHostProvidersService["fetch"],
  cloneUrl: () => Option.none() as Option.Option<string>,
  origin: () => "unknown",
};

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    lockfileSkills?: Record<string, unknown>;
    lockfilePacks?: Record<string, unknown>;
    settingsPacks?: Record<string, unknown>;
    sources?: ReadonlyArray<unknown>;
    namespace?: string;
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.settingsPacks) settings["packs"] = opts.settingsPacks;
  if (opts?.sources) settings["sources"] = opts.sources;
  if (opts?.namespace) settings["namespace"] = opts.namespace;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({
      lockfileVersion: 1,
      skills: opts?.lockfileSkills ?? {},
      ...(opts?.lockfilePacks ? { packs: opts.lockfilePacks } : {}),
    }),
  );
};

const defaultArgs = (
  source: string,
  overrides: Partial<InstallPackHandlerArgs> = {},
): InstallPackHandlerArgs => ({
  source,
  global: false,
  yes: true,
  force: false,
  nonInteractive: Option.some(true),
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs install handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (
    tuiConfig?: {
      confirmBehavior?: import("../../../tui/index.js").ConfirmBehavior;
      selectBehavior?: import("../../../tui/index.js").SelectBehavior;
      multiselectBehavior?: import("../../../tui/index.js").MultiselectBehavior;
    },
    wsOverrides?: Partial<WorkspaceContextOptions>,
  ) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer(
      tuiConfig?.confirmBehavior ?? { type: "return", value: true },
    );
    const [selectLayer] = makeSelectTestLayer(
      tuiConfig?.selectBehavior ?? { type: "return", index: 0 },
    );
    const [multiselectLayer] = makeMultiselectTestLayer(
      tuiConfig?.multiselectBehavior ?? { type: "return", indices: [] },
    );
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      global: false,
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  const makeLayersWithMockSources = (
    mockService: SourceHostProvidersService,
    wsOverrides?: Partial<WorkspaceContextOptions>,
  ) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer({ type: "return", value: true });
    const [selectLayer] = makeSelectTestLayer({ type: "return", index: 0 });
    const [multiselectLayer] = makeMultiselectTestLayer({ type: "return", indices: [] });
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      global: false,
      yes: true,
      nonInteractive: Option.some(true),
      preview: true,
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.succeed(SourceHostProviders, mockService);
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  // ---------------------------------------------------------------------------
  // Input parsing
  // ---------------------------------------------------------------------------

  describe("input parsing", () => {
    it.effect("accepts @namespace/packs/pack-name format", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const result = yield* parsePackInput("@acme/packs/my-pack");
          expect(result.namespace).toBe("@acme");
          expect(result.packName).toBe("my-pack");
          expect(result.versionConstraint).toEqual(Option.none());
        }),
      );
    });

    it.effect("accepts @namespace/packs/pack-name@^2.0.0 with version constraint", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const result = yield* parsePackInput("@acme/packs/my-pack@^2.0.0");
          expect(result.namespace).toBe("@acme");
          expect(result.packName).toBe("my-pack");
          expect(result.versionConstraint).toEqual(Option.some("^2.0.0"));
        }),
      );
    });

    it.effect("resolves bare pack-name to @defaultScope/packs/pack-name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        namespace: "@myorg",
      });

      return provide(
        Effect.gen(function* () {
          const result = yield* parsePackInput("my-pack");
          expect(result.namespace).toBe("@myorg");
          expect(result.packName).toBe("my-pack");
          expect(result.resolvedInput).toBe("@myorg/packs/my-pack");
        }),
      );
    });

    it.effect("resolves bare pack-name@version with default namespace", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        namespace: "@myorg",
      });

      return provide(
        Effect.gen(function* () {
          const result = yield* parsePackInput("my-pack@^2.0.0");
          expect(result.namespace).toBe("@myorg");
          expect(result.packName).toBe("my-pack");
          expect(result.versionConstraint).toEqual(Option.some("^2.0.0"));
          expect(result.resolvedInput).toBe("@myorg/packs/my-pack@^2.0.0");
        }),
      );
    });

    it.effect("rejects @namespace/pack-name without /packs/ segment", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* parsePackInput("@acme/my-pack").pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });

    it.effect("rejects local path sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* parsePackInput("./local-path").pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });

    it.effect("rejects github shorthand sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* parsePackInput("github:owner/repo").pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Non-registry source rejected (handler level)
  // ---------------------------------------------------------------------------

  describe("non-registry source rejection", () => {
    it.effect("rejects local path sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("./local-path")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("registry");
        }),
      );
    });

    it.effect("rejects github sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("github:owner/repo")).pipe(
            Effect.flip,
          );
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("registry");
        }),
      );
    });

    it.effect("rejects @namespace/pack-name without /packs/ segment", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("@acme/my-pack")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Already installed (no --force)
  // ---------------------------------------------------------------------------

  describe("already installed", () => {
    it.effect("skips when pack already installed and no --force", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [
          {
            name: "default",
            type: "registry",
            location: "https://registry.example.com",
          },
        ],
        lockfilePacks: {
          "my-pack": {
            type: "registry",
            namespace: "@acme",
            name: "my-pack",
            resolvedVersion: "1.0.0",
            integrity: "abc",
            sourceName: "default",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/my-pack"));

          expect(mockLog.logs.warn.some((m) => m.includes("already installed"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to install"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  describe("preview mode", () => {
    it.effect("fails at source resolution when no registry configured", () => {
      const { provide } = makeLayers(
        { confirmBehavior: { type: "return", value: false } },
        { preview: true, yes: false, nonInteractive: Option.some(true) },
      );
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("@acme/packs/test-pack")).pipe(
            Effect.flip,
          );
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("INVALID_SOURCE");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Pack install plan
  // ---------------------------------------------------------------------------

  describe("pack install plan", () => {
    const makePackRef = (
      name: string,
      opts?: {
        skills?: Record<string, string>;
        commands?: Record<string, string>;
        mcpServers?: Record<string, string>;
      },
    ): PackExtensionRef => ({
      type: "pack",
      refType: "registry",
      pack: {
        name,
        skills: opts?.skills ?? {},
        commands: opts?.commands ?? {},
        mcpServers: opts?.mcpServers ?? {},
      },
      source: { type: "registry", location: new URL("file:///tmp/reg"), namespace: Option.none() },
      namespace: "@acme",
      name,
      version: "1.0.0",
      integrity: "",
    });

    it.effect("builds plan from pack ref returned by sources.find", () => {
      const packRef = makePackRef("test-pack", {
        skills: { "@acme/skills/code-review": "^1.0.0" },
      });

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, mockLog } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/test-pack"));

          const allLogs = [
            ...mockLog.logs.info,
            ...mockLog.logs.message,
            ...mockLog.logs.success,
            ...mockLog.logs.warn,
          ].join("\n");
          expect(allLogs).toContain("test-pack");
        }),
      );
    });

    it.effect("pack version constraint from source persisted in settings", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      fs.mkdirSync(packArchiveDir, { recursive: true });

      const packRef = makePackRef("test-pack");

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "pack" && ref.pack.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService, { preview: false });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/test-pack@^2.0.0"));

          const axmDir = path.join(tempDir, ".axm");
          const settingsContent = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const settingsJson = JSON.parse(settingsContent) as { packs?: Record<string, string> };
          expect(settingsJson.packs?.["test-pack"]).toBe("@acme/packs/test-pack@^2.0.0");
        }),
      );
    });

    it.effect("marks already-installed packs as no-op in plan", () => {
      const packRef = makePackRef("test-pack");

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        lockfilePacks: {
          "test-pack": {
            type: "registry",
            namespace: "@acme",
            name: "test-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      // Use --force to bypass the early installed check, so we can see the plan
      const { provide, mockLog } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/test-pack", { force: true }));

          const allLogs = [
            ...mockLog.logs.info,
            ...mockLog.logs.message,
            ...mockLog.logs.success,
            ...mockLog.logs.warn,
          ].join("\n");
          expect(allLogs).toContain("test-pack");
          expect(allLogs).toContain("already installed");
        }),
      );
    });

    it.effect("fails when pack not found in registry", () => {
      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: () => Effect.succeed([]),
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("@acme/packs/nonexistent")).pipe(
            Effect.flip,
          );
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("PACK_NOT_FOUND");
        }),
      );
    });

    it.effect("builds skill, command, and mcp-server ops from pack resolved maps", () => {
      const packRef = makePackRef("multi-pack", {
        skills: { "@acme/skills/code-review": "1.0.0" },
        commands: { "@acme/commands/lint": "2.0.0" },
        mcpServers: { "@acme/mcp-servers/analytics": "3.0.0" },
      });

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, mockLog } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/multi-pack"));

          const allLogs = [
            ...mockLog.logs.info,
            ...mockLog.logs.message,
            ...mockLog.logs.success,
            ...mockLog.logs.warn,
          ].join("\n");
          // Plan should include the pack and all extension steps
          expect(allLogs).toContain("multi-pack");
          expect(allLogs).toContain("code-review");
          expect(allLogs).toContain("lint");
          expect(allLogs).toContain("analytics");
        }),
      );
    });

    it.effect("skips already-installed extension dependencies", () => {
      const packRef = makePackRef("dep-pack", {
        skills: { "@acme/skills/existing-skill": "1.0.0" },
        commands: { "@acme/commands/existing-cmd": "1.0.0" },
      });

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        lockfileSkills: {
          "existing-skill": {
            type: "registry",
            namespace: "@acme",
            name: "existing-skill",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            agents: [],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      const { provide, mockLog } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/dep-pack"));

          const allLogs = [
            ...mockLog.logs.info,
            ...mockLog.logs.message,
            ...mockLog.logs.success,
            ...mockLog.logs.warn,
          ].join("\n");
          expect(allLogs).toContain("existing-skill");
          expect(allLogs).toContain("already installed");
        }),
      );
    });
  });
});
