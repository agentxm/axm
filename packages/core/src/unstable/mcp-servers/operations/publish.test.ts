/**
 * Unit tests for the publishMcpServer operation handler.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { publishMcpServer, type PublishMcpServerOperation } from "./publish.js";
import { handle } from "../../test-helpers.js";

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (axmDir: string, registryRoot: string) => {
  const registrySource = {
    name: "local",
    type: "registry" as const,
    location: new URL(`file://${registryRoot}`),
  };

  const mockWs: WorkspaceMutationsService = makeBaseWorkspaceMock(axmDir, {
    getConfiguredSources: () => Effect.succeed([registrySource]),
    getConfiguredSourceByName: (name: string) =>
      Effect.succeed(name === "local" ? Option.some(registrySource) : Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([registrySource]),
    getConfiguredAgents: () => Effect.succeed([]),
    getConfiguredOwner: () => Effect.succeed(Option.some(handle("@community"))),
  });
  return Layer.mergeAll(NodeServices.layer, WorkspaceMutations.layer(mockWs));
};

/** Creates a minimal PublishMcpServerOperation for testing. */
const makeOp = (
  overrides: Partial<PublishMcpServerOperation["args"]> = {},
): PublishMcpServerOperation => ({
  name: "publish-mcp-server",
  args: {
    name: overrides.name ?? "@community/mcp-servers/my-mcp",
    registryName: overrides.registryName ?? "local",
  },
});

describe("publishMcpServer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publish-mcp-server-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with an installed MCP server and registry. */
  const setup = (owner = "@community", name = "my-mcp", manifest: Record<string, unknown> = {}) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const extensionDir = path.join(base, ".axm", "extensions", owner, "mcp-servers", name);
    const registryRoot = path.join(tmpDir, "registry");

    const srcDir = path.join(extensionDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    const defaultManifest = {
      owner,
      type: "mcp-server",
      name,
      version: "0.1.0",
      ...manifest,
    };
    fs.writeFileSync(
      path.join(extensionDir, "mcp-server.json"),
      JSON.stringify(defaultManifest, null, 2),
    );

    fs.writeFileSync(path.join(srcDir, "content.md"), `# ${name}`);

    return { base, axmDir, extensionDir, registryRoot };
  };

  it.effect("publishes an mcp-server extension to the registry", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup();

      const result = yield* publishMcpServer(
        makeOp({ name: "@community/mcp-servers/my-mcp", registryName: "local" }),
      ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

      expect(result.result).toBe("success");
      expect(result.message).toContain("@community/mcp-servers/my-mcp@0.1.0");

      const indexPath = path.join(
        registryRoot,
        "extensions",
        "@community",
        "mcp-servers",
        "my-mcp",
        "index.json",
      );
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      expect(index.name).toBe("my-mcp");
      expect(index.owner).toBe("@community");
      expect(index.type).toBe("mcp-server");
      expect(index.versions).toHaveLength(1);
    }),
  );

  it.effect("rejects unrecognized manifest keys before publishing", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "bad-keys", {
        companionPackages: [{ purl: "pkg:npm/example" }],
      });

      const result = yield* publishMcpServer(
        makeOp({ name: "@community/mcp-servers/bad-keys", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("mcp-server/manifest-keys-recognized");
      expect(result.message).toContain("companionPackages");
    }),
  );

  describe("packages propagation", () => {
    it.effect("propagates packages from manifest to VersionEntry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup("@community", "compat-mcp", {
          packages: [{ purl: "pkg:npm/claude-code" }, { purl: "pkg:npm/%40openai/codex" }],
        });

        yield* publishMcpServer(
          makeOp({ name: "@community/mcp-servers/compat-mcp", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "mcp-servers",
          "compat-mcp",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions[0].packages).toEqual([
          { purl: "pkg:npm/claude-code" },
          { purl: "pkg:npm/%40openai/codex" },
        ]);
      }),
    );

    it.effect("omits packages when manifest does not include it", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup();

        yield* publishMcpServer(
          makeOp({ name: "@community/mcp-servers/my-mcp", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "mcp-servers",
          "my-mcp",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions[0]).not.toHaveProperty("packages");
      }),
    );
  });

  it.effect("fails when extension directory does not exist", () =>
    Effect.gen(function* () {
      const base = path.join(tmpDir, "project");
      const axmDir = path.join(base, ".axm");
      const registryRoot = path.join(tmpDir, "registry");
      fs.mkdirSync(axmDir, { recursive: true });
      fs.mkdirSync(registryRoot, { recursive: true });

      const result = yield* publishMcpServer(
        makeOp({ name: "@community/mcp-servers/nonexistent", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("Managed extension not found");
    }),
  );

  it.effect("is idempotent when same version + same integrity published twice", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "idem-mcp");

      const layer = withServices(axmDir, registryRoot);

      yield* publishMcpServer(
        makeOp({ name: "@community/mcp-servers/idem-mcp", registryName: "local" }),
      ).pipe(Effect.provide(layer));

      const result = yield* publishMcpServer(
        makeOp({ name: "@community/mcp-servers/idem-mcp", registryName: "local" }),
      ).pipe(Effect.provide(layer));

      expect(result.result).toBe("success");

      const indexPath = path.join(
        registryRoot,
        "extensions",
        "@community",
        "mcp-servers",
        "idem-mcp",
        "index.json",
      );
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      expect(index.versions).toHaveLength(1);
    }),
  );
});
