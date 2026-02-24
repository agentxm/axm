/**
 * Unit tests for the publishCommand operation handler.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import { publishCommand, type PublishCommandOperation } from "./publish.js";

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string, registryRoot: string) => {
  const registrySource = {
    name: "local",
    type: "registry" as const,
    location: new URL(`file://${registryRoot}`),
  };

  const mockWs: WorkspaceContextService = {
    ...taxonomyStubs,
    global: false,
    path: axmDir,
    baseDir: path.dirname(axmDir),
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([registrySource]),
    getConfiguredSourceByName: (name: string) =>
      Effect.succeed(name === "local" ? Option.some(registrySource) : Option.none()),
    getConfiguredRegistrySources: () => Effect.succeed([registrySource]),
    getConfiguredNamespace: () => Effect.succeed("@community"),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedSkills: () => Effect.succeed({}),
    getLockedSkill: () => Effect.succeed(Option.none()),
    getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: () => Effect.void,
    renameSkill: () => Effect.void,
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: "" }),
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
  };
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs));
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
  const setup = (
    namespace = "@community",
    name = "my-cmd",
    manifest: Record<string, unknown> = {},
  ) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const extensionDir = path.join(base, ".axm", "extensions", namespace, "commands", name);
    const registryRoot = path.join(tmpDir, "registry");

    const srcDir = path.join(extensionDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    const defaultManifest = {
      name: `${namespace}/commands/${name}`,
      version: "0.1.0",
      ...manifest,
    };
    fs.writeFileSync(
      path.join(extensionDir, "axm-command.json"),
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
      expect(index.namespace).toBe("@community");
      expect(index.type).toBe("command");
      expect(index.versions).toHaveLength(1);
    }),
  );

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
        Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
      );

      expect(result.result).toBe("error");
      expect(result.message).toContain("Managed extension not found");
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
