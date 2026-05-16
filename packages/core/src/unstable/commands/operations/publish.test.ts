/**
 * Unit tests for the publishCommand operation handler.
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
import { publishCommand, type PublishCommandOperation } from "./publish.js";
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

/** Creates a minimal PublishCommandOperation for testing. */
const makeOp = (
  overrides: Partial<PublishCommandOperation["args"]> = {},
): PublishCommandOperation => ({
  name: "publish-command",
  args: {
    name: overrides.name ?? "@community/commands/my-cmd",
    registryName: overrides.registryName ?? "local",
  },
});

describe("publishCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publish-command-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with an installed command and registry. */
  const setup = (owner = "@community", name = "my-cmd", manifest: Record<string, unknown> = {}) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const extensionDir = path.join(base, ".axm", "extensions", owner, "commands", name);
    const registryRoot = path.join(tmpDir, "registry");

    const srcDir = path.join(extensionDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    const defaultManifest = {
      owner,
      type: "command",
      name,
      version: "0.1.0",
      ...manifest,
    };
    fs.writeFileSync(
      path.join(extensionDir, "command.json"),
      JSON.stringify(defaultManifest, null, 2),
    );

    fs.writeFileSync(path.join(srcDir, "content.md"), `# ${name}`);

    return { base, axmDir, extensionDir, registryRoot };
  };

  it.effect("publishes a command extension to the registry", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup();

      const result = yield* publishCommand(
        makeOp({ name: "@community/commands/my-cmd", registryName: "local" }),
      ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

      expect(result.result).toBe("success");
      expect(result.message).toContain("@community/commands/my-cmd@0.1.0");

      const indexPath = path.join(
        registryRoot,
        "extensions",
        "@community",
        "commands",
        "my-cmd",
        "index.json",
      );
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      expect(index.name).toBe("my-cmd");
      expect(index.owner).toBe("@community");
      expect(index.type).toBe("command");
      expect(index.versions).toHaveLength(1);
    }),
  );

  it.effect("rejects unrecognized manifest keys before publishing", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "bad-keys", {
        companionPackages: [{ purl: "pkg:npm/example" }],
      });

      const result = yield* publishCommand(
        makeOp({ name: "@community/commands/bad-keys", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("command/manifest-keys-recognized");
      expect(result.message).toContain("companionPackages");
    }),
  );

  describe("packages propagation", () => {
    it.effect("propagates packages from manifest to VersionEntry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup("@community", "compat-cmd", {
          packages: [{ purl: "pkg:npm/claude-code" }, { purl: "pkg:npm/%40openai/codex" }],
        });

        yield* publishCommand(
          makeOp({ name: "@community/commands/compat-cmd", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "commands",
          "compat-cmd",
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

        yield* publishCommand(
          makeOp({ name: "@community/commands/my-cmd", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "commands",
          "my-cmd",
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

      const result = yield* publishCommand(
        makeOp({ name: "@community/commands/nonexistent", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("Managed extension not found");
    }),
  );

  it.effect("rejects command manifests that still contain agentOverrides", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "old-overrides", {
        agentOverrides: {
          codex: { model: "o3" },
        },
      });

      const result = yield* publishCommand(
        makeOp({ name: "@community/commands/old-overrides", registryName: "local" }),
      ).pipe(
        Effect.provide(withServices(axmDir, registryRoot)),
        Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("command content file frontmatter");
    }),
  );

  it.effect("is idempotent when same version + same integrity published twice", () =>
    Effect.gen(function* () {
      const { axmDir, registryRoot } = setup("@community", "idem-cmd");

      const layer = withServices(axmDir, registryRoot);

      yield* publishCommand(
        makeOp({ name: "@community/commands/idem-cmd", registryName: "local" }),
      ).pipe(Effect.provide(layer));

      const result = yield* publishCommand(
        makeOp({ name: "@community/commands/idem-cmd", registryName: "local" }),
      ).pipe(Effect.provide(layer));

      expect(result.result).toBe("success");

      const indexPath = path.join(
        registryRoot,
        "extensions",
        "@community",
        "commands",
        "idem-cmd",
        "index.json",
      );
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      expect(index.versions).toHaveLength(1);
    }),
  );
});
