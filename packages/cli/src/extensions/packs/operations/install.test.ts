/**
 * Unit tests for the install-pack operation handler.
 *
 * Verifies that installPack fetches the archive via sources.fetch(),
 * extracts to the managed pack location, and writes lockfile/settings.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import { makeOutputTestLayer } from "@axm.sh/core/unstable/output";
import { makeActivityTestLayer } from "@axm.sh/core/unstable/activity";
import { makeInputTestLayer } from "@axm.sh/core/unstable/input";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import type { ExtensionFiles, RegistryPackRef } from "@axm.sh/core/unstable/sources";
import { SourceHostProviders } from "../../../sources/index.js";
import type { SourceHostProvidersService } from "../../../sources/index.js";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
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
      profile: "@test",
      type: "pack",
      name: "my-pack",
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
  source: { type: "registry", location: new URL("file:///tmp/reg"), profile: Option.none() },
  profile: "@test",
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
    profile: ref.refType === "registry" ? ref.profile : "",
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

  // process.chdir is needed because workspace layer resolves .axm via process.cwd().
  // WorkspaceContextOptions has no `cwd` parameter. See finding #49.
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "install-pack-op-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    try {
      process.chdir(originalCwd);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const makeLayers = (mockService: SourceHostProvidersService) => {
    const [outputLayer, mockLog] = makeOutputTestLayer();
    const [activityLayer] = makeActivityTestLayer();
    const [inputLayer] = makeInputTestLayer({
      methodBehaviors: {
        confirm: { type: "return", value: true },
        select: { type: "select", index: 0 },
        multiselect: { type: "multiselect", indices: [] },
      },
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      outputLayer,
      activityLayer,
      inputLayer,
      CliEnvironmentTest(),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
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
        const result = yield* installPack(op);
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
        const result = yield* installPack(op);
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

  it.effect("persists exact resolved maps in pack lockfile entry", () => {
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
    const op = makeOperation(ref, {
      resolvedSkills: { "@acme/skills/code-review": "1.2.0" },
      resolvedCommands: { "@acme/commands/format": "2.0.0" },
      resolvedMcpServers: { "@acme/mcp-servers/local-tools": "3.0.1" },
    });
    const { provide } = makeLayers(mockService);

    return provide(
      Effect.gen(function* () {
        const result = yield* installPack(op);
        expect(result.result).toBe("success");

        const axmDir = nodePath.join(tempDir, ".axm");
        const lockfile = YAML.parse(
          fs.readFileSync(nodePath.join(axmDir, "axm-lock.yaml"), "utf-8"),
        ) as {
          packs?: Record<
            string,
            {
              resolvedSkills: Record<string, string>;
              resolvedCommands: Record<string, string>;
              resolvedMcpServers: Record<string, string>;
            }
          >;
        };
        const entry = lockfile.packs?.["my-pack"];
        expect(entry).toBeDefined();
        expect(entry?.resolvedSkills).toEqual({ "@acme/skills/code-review": "1.2.0" });
        expect(entry?.resolvedCommands).toEqual({ "@acme/commands/format": "2.0.0" });
        expect(entry?.resolvedMcpServers).toEqual({ "@acme/mcp-servers/local-tools": "3.0.1" });
      }),
    );
  });

  it.effect("fails when a pack resolved map contains a range", () => {
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
    const op = makeOperation(ref, {
      resolvedSkills: { "@acme/skills/code-review": "^1.2.0" },
    });
    const { provide } = makeLayers(mockService);

    return provide(
      Effect.gen(function* () {
        const result = yield* installPack(op);
        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("LOCKFILE_RESOLVED_VERSION_INVALID");
          expect(result.error.what).toContain("exact semver");
          expect(result.error.details.join("\n")).toContain(
            "resolvedSkills.@acme/skills/code-review",
          );
        }
      }),
    );
  });

  it.effect("returns error result when fetch fails", () => {
    const mockService: SourceHostProvidersService = {
      find: () => Effect.succeed([]),
      fetch: () => Effect.fail(makeAppError({ code: "PACK_FETCH_FAILED", what: "Network error" })),
      cloneUrl: () => Option.none(),
      origin: () => "unknown",
    };

    initWorkspace(nodePath.join(tempDir, ".axm"));

    const ref = makePackRef();
    const op = makeOperation(ref);
    const { provide } = makeLayers(mockService);

    return provide(
      Effect.gen(function* () {
        const result = yield* installPack(op);
        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to install pack");
      }),
    );
  });
});
