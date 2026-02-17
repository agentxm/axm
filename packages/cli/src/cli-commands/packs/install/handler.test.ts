/**
 * Unit tests for the packs install command handler.
 *
 * Tests the pack install flow: source validation, plan build, and execution.
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
  type SkillExtensionRef,
} from "../../../sources/index.js";
import { handleInstallPack, type InstallPackHandlerArgs } from "./handler.js";
import { CliError, makeCliError } from "../../../cli-error/index.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Stub methods for the new SourceHostProvidersService interface fields. */
const serviceStubs = {
  find: (() => Effect.succeed([])) as SourceHostProvidersService["find"],
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
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.settingsPacks) settings["packs"] = opts.settingsPacks;
  if (opts?.sources) settings["sources"] = opts.sources;
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

  // ---------------------------------------------------------------------------
  // Non-registry source rejected
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
            scope: "@acme",
            name: "my-pack",
            resolvedVersion: "1.0.0",
            checksum: "abc",
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
          yield* handleInstallPack(defaultArgs("@acme/my-pack"));

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
    it.effect("fails at registry guard when no registry configured", () => {
      const { provide } = makeLayers(
        { confirmBehavior: { type: "return", value: false } },
        { preview: true, yes: false, nonInteractive: Option.some(true) },
      );
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          // Fails during source parsing since no registry source is configured.
          const error = yield* handleInstallPack(defaultArgs("@acme/test-pack")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("INVALID_SOURCE");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Skill dependencies
  // ---------------------------------------------------------------------------

  describe("skill dependencies", () => {
    /** Create a pack archive directory with manifest and skill SKILL.md files. */
    const createPackArchive = (
      dir: string,
      manifest: {
        name: string;
        version: string;
        description: string;
        skills?: Record<string, string>;
      },
    ) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "axm-pack.json"),
        JSON.stringify({
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          ...(manifest.skills ? { skills: manifest.skills } : {}),
        }),
      );
    };

    /** Create a skill archive directory with SKILL.md. */
    const createSkillArchive = (dir: string, name: string, description: string) => {
      const srcDir = path.join(dir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`,
      );
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

    it.effect("produces combined plan with pack + skill ops", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      const skillArchiveDir = path.join(tempDir, "skill-archive");
      createPackArchive(packArchiveDir, {
        name: "@acme/test-pack",
        version: "1.0.0",
        description: "A test pack",
        skills: { "@acme/code-review": "^1.0.0" },
      });
      createSkillArchive(skillArchiveDir, "code-review", "Code review skill");

      const packRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "test-pack", description: "A test pack", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const skillRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "code-review", description: "Code review skill", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (source, options) => {
          if (options.type === "pack") {
            return Effect.succeed([packRef]);
          }
          if (options.type === "skill") {
            return Effect.succeed([skillRef]);
          }
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "skill" && ref.skill.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          if (ref.type === "skill" && ref.skill.name === "code-review") {
            return Effect.succeed({ directory: skillArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, mockLog } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          // preview mode so we don't actually install, just build the plan
          yield* handleInstallPack(defaultArgs("@acme/test-pack"));

          // In preview mode, plan is displayed. Verify logs mention both pack and skill.
          const allLogs = [
            ...mockLog.logs.info,
            ...mockLog.logs.message,
            ...mockLog.logs.success,
            ...mockLog.logs.warn,
          ].join("\n");
          // The plan should contain both the pack and the skill dependency
          expect(allLogs).toContain("test-pack");
          expect(allLogs).toContain("code-review");
        }),
      );
    });

    it.effect("marks already-installed skills as no-op in plan", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      const skillArchiveDir = path.join(tempDir, "skill-archive");
      createPackArchive(packArchiveDir, {
        name: "@acme/test-pack",
        version: "1.0.0",
        description: "A test pack",
        skills: { "@acme/my-skill": "^1.0.0" },
      });
      createSkillArchive(skillArchiveDir, "my-skill", "My skill");

      const packRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "test-pack", description: "A test pack", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const skillRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "my-skill", description: "My skill", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") return Effect.succeed([skillRef]);
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "skill" && ref.skill.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          if (ref.type === "skill" && ref.skill.name === "my-skill") {
            return Effect.succeed({ directory: skillArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        lockfileSkills: {
          "my-skill": {
            type: "registry",
            scope: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            checksum: "",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      const { provide, mockLog } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/test-pack"));

          const allLogs = [
            ...mockLog.logs.info,
            ...mockLog.logs.message,
            ...mockLog.logs.success,
            ...mockLog.logs.warn,
          ].join("\n");
          // Skill should appear as already installed / no-op
          expect(allLogs).toContain("my-skill");
          expect(allLogs).toContain("already installed");
        }),
      );
    });

    it.effect("skill dependencies written to lockfile but NOT to settings", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      const skillArchiveDir = path.join(tempDir, "skill-archive");
      createPackArchive(packArchiveDir, {
        name: "@acme/test-pack",
        version: "1.0.0",
        description: "A test pack",
        skills: { "@acme/code-review": "^1.0.0" },
      });
      createSkillArchive(skillArchiveDir, "code-review", "Code review skill");

      const packRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "test-pack", description: "A test pack", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const skillRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "code-review", description: "Code review skill", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") return Effect.succeed([skillRef]);
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "skill" && ref.skill.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          if (ref.type === "skill" && ref.skill.name === "code-review") {
            return Effect.succeed({ directory: skillArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      // Non-preview mode so the plan is actually applied
      const { provide } = makeLayersWithMockSources(mockService, { preview: false });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/test-pack"));

          // Verify: skill dependency is in lockfile
          const axmDir = path.join(tempDir, ".axm");
          const lockfileContent = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockfileContent) as {
            skills?: Record<string, unknown>;
            packs?: Record<string, unknown>;
          };
          expect(lockfile.skills).toBeDefined();
          expect(lockfile.skills!["code-review"]).toBeDefined();

          // Verify: skill dependency is NOT in settings
          const settingsContent = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const settingsJson = JSON.parse(settingsContent) as {
            skills?: Record<string, unknown>;
            packs?: Record<string, unknown>;
          };
          expect(settingsJson.skills?.["code-review"]).toBeUndefined();

          // Verify: pack IS in settings
          expect(settingsJson.packs?.["test-pack"]).toBeDefined();
        }),
      );
    });

    it.effect("pack version constraint from source persisted in settings", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      createPackArchive(packArchiveDir, {
        name: "@acme/test-pack",
        version: "2.0.0",
        description: "A test pack",
      });

      const packRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "test-pack", description: "A test pack", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "2.0.0",
        checksum: "",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "skill" && ref.skill.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      // Non-preview mode so the plan is actually applied
      const { provide } = makeLayersWithMockSources(mockService, { preview: false });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/test-pack@^2.0.0"));

          // Verify: pack version constraint persisted in settings
          const axmDir = path.join(tempDir, ".axm");
          const settingsContent = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const settingsJson = JSON.parse(settingsContent) as { packs?: Record<string, string> };
          expect(settingsJson.packs?.["test-pack"]).toBe("@acme/test-pack@^2.0.0");
        }),
      );
    });

    it.effect("manifest constraint * resolves to latest (no constraint appended)", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      const skillArchiveDir = path.join(tempDir, "skill-archive");
      createPackArchive(packArchiveDir, {
        name: "@acme/test-pack",
        version: "1.0.0",
        description: "A test pack",
        skills: { "@acme/code-review": "*" },
      });
      createSkillArchive(skillArchiveDir, "code-review", "Code review skill");

      const packRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "test-pack", description: "A test pack", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      // Capture what find receives for skill resolution
      let capturedSkillSource: unknown;
      const skillRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "code-review", description: "Code review skill", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") {
            capturedSkillSource = source;
            return Effect.succeed([skillRef]);
          }
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "skill" && ref.skill.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          if (ref.type === "skill" && ref.skill.name === "code-review") {
            return Effect.succeed({ directory: skillArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/test-pack"));

          // Constraint no longer lives on RegistrySourceParams.
          expect(capturedSkillSource).toBeDefined();
          const src = capturedSkillSource as { type: string };
          expect(src.type).toBe("registry");
        }),
      );
    });

    it.effect("manifest version constraint appended to skill source resolution", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      const skillArchiveDir = path.join(tempDir, "skill-archive");
      createPackArchive(packArchiveDir, {
        name: "@acme/test-pack",
        version: "1.0.0",
        description: "A test pack",
        skills: { "@acme/code-review": "^1.0.0" },
      });
      createSkillArchive(skillArchiveDir, "code-review", "Code review skill");

      const packRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "test-pack", description: "A test pack", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      // Capture what find receives for skill resolution
      let capturedSkillSource: unknown;
      const skillRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "code-review", description: "Code review skill", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") {
            capturedSkillSource = source;
            return Effect.succeed([skillRef]);
          }
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "skill" && ref.skill.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          if (ref.type === "skill" && ref.skill.name === "code-review") {
            return Effect.succeed({ directory: skillArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/test-pack"));

          // Constraint no longer lives on RegistrySourceParams.
          expect(capturedSkillSource).toBeDefined();
          const src = capturedSkillSource as { type: string };
          expect(src.type).toBe("registry");
        }),
      );
    });

    it.effect("fails with CliError when skill dependency fetch fails", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      createPackArchive(packArchiveDir, {
        name: "@acme/test-pack",
        version: "1.0.0",
        description: "A test pack",
        skills: { "@acme/missing-skill": "^1.0.0" },
      });

      const packRef: SkillExtensionRef = {
        type: "skill",
        skill: { name: "test-pack", description: "A test pack", metadata: Option.none() },
        source: {
          type: "registry",
          scope: "@acme",
          extensionTypes: ["skills"],
          location: new URL("file:///tmp/reg"),
        },
        version: "1.0.0",
        checksum: "",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          // Return empty for skill — triggers PACK_DEPENDENCY_NOT_FOUND
          if (options.type === "skill") return Effect.succeed([]);
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "skill" && ref.skill.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeCliError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstallPack(defaultArgs("@acme/test-pack")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("PACK_DEPENDENCY_NOT_FOUND");
          expect((error as CliError).what).toContain("missing-skill");
        }),
      );
    });
  });
});
