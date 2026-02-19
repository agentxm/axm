/**
 * Unit tests for the install-pack operation handler.
 *
 * Verifies that installPack fetches the archive via sources.fetch(),
 * extracts to the managed pack location, and writes lockfile/settings.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import {
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  makeConfirmTestLayer,
  makeSpinnerTestLayer,
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
  type ExtensionFiles,
  type RegistryPackRef,
} from "../../../sources/index.js";
import { makeCliError } from "../../../cli-error/index.js";
import { installPack, type InstallPackOperation } from "./install.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Initialize a workspace directory with settings and lockfile. */
const initWorkspace = (axmDir: string) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    nodePath.join(axmDir, "settings.json"),
    JSON.stringify({ agents: ["claude-code"] }),
  );
  fs.writeFileSync(
    nodePath.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

/** Create a pack archive directory with a manifest file. */
const createPackArchive = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    nodePath.join(dir, "axm-pack.json"),
    JSON.stringify({
      name: "@test/packs/my-pack",
      version: "1.0.0",
      description: "Test pack",
    }),
  );
  fs.writeFileSync(nodePath.join(dir, "some-file.txt"), "content");
};

const makePackRef = (): RegistryPackRef => ({
  type: "pack",
  refType: "registry",
  pack: { name: "my-pack", skills: {}, commands: {}, mcpServers: {} },
  source: { type: "registry", location: new URL("file:///tmp/reg"), scope: Option.none() },
  scope: "@test",
  name: "my-pack",
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makeOperation = (
  ref: RegistryPackRef,
  overrides?: Partial<InstallPackOperation["args"]>,
): InstallPackOperation => ({
  name: "install-pack",
  args: {
    packName: ref.pack.name,
    scope: ref.refType === "registry" ? ref.scope : "",
    resolvedVersion: ref.refType === "registry" ? ref.version : "",
    integrity: ref.refType === "registry" ? ref.integrity : "",
    sourceName: "default",
    resolvedSkills: {},
    resolvedCommands: {},
    resolvedMcpServers: {},
    versionConstraint: Option.none(),
    ref,
    ...overrides,
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("installPack operation handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "install-pack-op-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (mockService: SourceHostProvidersService) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer] = makeSpinnerTestLayer();
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
      preview: false,
      agents: Option.none(),
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.succeed(SourceHostProviders, mockService);
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

  it.effect("fetches archive and extracts to managed pack directory", () => {
    const archiveDir = nodePath.join(tempDir, "archive");
    createPackArchive(archiveDir);

    const fetchSpy = vi.fn(() =>
      Effect.succeed({ directory: archiveDir } satisfies ExtensionFiles),
    );

    const mockService: SourceHostProvidersService = {
      find: () => Effect.succeed([]),
      fetch: fetchSpy as SourceHostProvidersService["fetch"],
      cloneUrl: () => Option.none(),
      origin: () => "unknown",
    };

    initWorkspace(nodePath.join(tempDir, ".axm"));

    const ref = makePackRef();
    const op = makeOperation(ref);
    const { provide } = makeLayers(mockService);

    return provide(
      Effect.gen(function* () {
        const result = yield* installPack(op).pipe(Effect.scoped);
        expect(result.result).toBe("success");

        // Verify fetch was called with the ref
        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(fetchSpy).toHaveBeenCalledWith(ref);

        // Verify files were extracted to the managed location
        const packDir = nodePath.join(tempDir, ".axm", "extensions", "@test", "packs", "my-pack");
        expect(fs.existsSync(packDir)).toBe(true);
        expect(fs.existsSync(nodePath.join(packDir, "some-file.txt"))).toBe(true);
      }),
    );
  });

  it.effect("writes lockfile and settings entries", () => {
    const archiveDir = nodePath.join(tempDir, "archive");
    createPackArchive(archiveDir);

    const mockService: SourceHostProvidersService = {
      find: () => Effect.succeed([]),
      fetch: () => Effect.succeed({ directory: archiveDir } satisfies ExtensionFiles),
      cloneUrl: () => Option.none(),
      origin: () => "unknown",
    };

    initWorkspace(nodePath.join(tempDir, ".axm"));

    const ref = makePackRef();
    const op = makeOperation(ref, { versionConstraint: Option.some("^1.0.0") });
    const { provide } = makeLayers(mockService);

    return provide(
      Effect.gen(function* () {
        const result = yield* installPack(op).pipe(Effect.scoped);
        expect(result.result).toBe("success");

        // Verify lockfile was updated
        const axmDir = nodePath.join(tempDir, ".axm");
        const lockfileContent = fs.readFileSync(nodePath.join(axmDir, "axm-lock.yaml"), "utf-8");
        const lockfile = YAML.parse(lockfileContent) as {
          packs?: Record<string, unknown>;
        };
        expect(lockfile.packs).toBeDefined();
        expect(lockfile.packs!["my-pack"]).toBeDefined();

        // Verify settings was updated
        const settingsContent = fs.readFileSync(nodePath.join(axmDir, "settings.json"), "utf-8");
        const settings = JSON.parse(settingsContent) as {
          packs?: Record<string, string>;
        };
        expect(settings.packs).toBeDefined();
        expect(settings.packs!["my-pack"]).toBe("@test/packs/my-pack@^1.0.0");
      }),
    );
  });

  it.effect("returns error result when fetch fails", () => {
    const mockService: SourceHostProvidersService = {
      find: () => Effect.succeed([]),
      fetch: () => Effect.fail(makeCliError({ code: "PACK_FETCH_FAILED", what: "Network error" })),
      cloneUrl: () => Option.none(),
      origin: () => "unknown",
    };

    initWorkspace(nodePath.join(tempDir, ".axm"));

    const ref = makePackRef();
    const op = makeOperation(ref);
    const { provide } = makeLayers(mockService);

    return provide(
      Effect.gen(function* () {
        const result = yield* installPack(op).pipe(Effect.scoped);
        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to install pack");
      }),
    );
  });
});
