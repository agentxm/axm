/**
 * Unit tests for the generic publishExtension operation handler.
 *
 * Tests manifest reading, archive building, integrity computation, and
 * registry publish for all non-pack extension types (skill, command, mcp-server).
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
import { publishExtension, type PublishExtensionOperation } from "./publish-extension.js";

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string, registryRoot: string) => {
  const registrySource = {
    name: "local",
    type: "registry" as const,
    location: new URL(`file://${registryRoot}`),
  };

  const mockWs: WorkspaceContextService = {
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
  };
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs));
};

/** Creates a minimal PublishExtensionOperation for testing. */
const makeOp = (
  overrides: Partial<PublishExtensionOperation["args"]> & {
    type: "skill" | "command" | "mcp-server";
  },
): PublishExtensionOperation => ({
  name: "publish-extension",
  args: {
    name: overrides.name ?? "@community/skills/my-skill",
    type: overrides.type,
    registryName: overrides.registryName ?? "local",
  },
});

describe("publishExtension", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publish-extension-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with a managed extension and registry. */
  const setup = (
    typePlural: "skills" | "commands" | "mcp-servers",
    manifestFilename: string,
    namespace = "@community",
    name = "my-ext",
    manifest: Record<string, unknown> = {},
  ) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const extensionDir = path.join(base, ".axm", "extensions", namespace, typePlural, name);
    const registryRoot = path.join(tmpDir, "registry");

    const srcDir = path.join(extensionDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    // Write manifest at extension root
    const defaultManifest = {
      name: `${namespace}/${typePlural}/${name}`,
      version: "0.1.0",
      ...manifest,
    };
    fs.writeFileSync(
      path.join(extensionDir, manifestFilename),
      JSON.stringify(defaultManifest, null, 2),
    );

    // Write content file in src/
    fs.writeFileSync(path.join(srcDir, "content.md"), `# ${name}`);

    return { base, axmDir, extensionDir, registryRoot };
  };

  // ---------------------------------------------------------------------------
  // Skill type
  // ---------------------------------------------------------------------------

  describe("skill extension", () => {
    it.effect("publishes a skill extension to the registry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup(
          "skills",
          "axm-skill.json",
          "@community",
          "my-skill",
          {
            agents: ["claude-code"],
            dependencies: {},
          },
        );

        const result = yield* publishExtension(
          makeOp({ name: "@community/skills/my-skill", type: "skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("@community/skills/my-skill@0.1.0");

        // Registry should have the archive
        const archivePath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "0.1.0.zip",
        );
        expect(fs.existsSync(archivePath)).toBe(true);

        // Registry should have index.json
        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "index.json",
        );
        expect(fs.existsSync(indexPath)).toBe(true);

        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.name).toBe("my-skill");
        expect(index.namespace).toBe("@community");
        expect(index.type).toBe("skill");
        expect(index.versions).toHaveLength(1);
        expect(index.versions[0].version).toBe("0.1.0");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Command type
  // ---------------------------------------------------------------------------

  describe("command extension", () => {
    it.effect("publishes a command extension to the registry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup(
          "commands",
          "axm-command.json",
          "@community",
          "my-cmd",
        );

        const result = yield* publishExtension(
          makeOp({ name: "@community/commands/my-cmd", type: "command", registryName: "local" }),
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
  });

  // ---------------------------------------------------------------------------
  // MCP server type
  // ---------------------------------------------------------------------------

  describe("mcp-server extension", () => {
    it.effect("publishes an mcp-server extension to the registry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup(
          "mcp-servers",
          "axm-mcp-server.json",
          "@community",
          "my-mcp",
        );

        const result = yield* publishExtension(
          makeOp({
            name: "@community/mcp-servers/my-mcp",
            type: "mcp-server",
            registryName: "local",
          }),
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
        expect(index.namespace).toBe("@community");
        expect(index.type).toBe("mcp-server");
        expect(index.versions).toHaveLength(1);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Integrity
  // ---------------------------------------------------------------------------

  describe("integrity computation", () => {
    it.effect("writes integrity in sha512 SRI format to index", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup(
          "skills",
          "axm-skill.json",
          "@community",
          "int-skill",
          {
            agents: ["claude-code"],
            dependencies: {},
          },
        );

        yield* publishExtension(
          makeOp({ name: "@community/skills/int-skill", type: "skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "int-skill",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions[0].integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  describe("idempotency", () => {
    it.effect("is a no-op when same version + same integrity published twice", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup(
          "commands",
          "axm-command.json",
          "@community",
          "idem-cmd",
        );

        const layer = withServices(axmDir, registryRoot);

        // First publish
        yield* publishExtension(
          makeOp({ name: "@community/commands/idem-cmd", type: "command", registryName: "local" }),
        ).pipe(Effect.provide(layer));

        // Second publish — same content, same version
        const result = yield* publishExtension(
          makeOp({ name: "@community/commands/idem-cmd", type: "command", registryName: "local" }),
        ).pipe(Effect.provide(layer));

        expect(result.result).toBe("success");

        // Still only one version in the index
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

    it.effect("fails when same version has a different integrity", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot, extensionDir } = setup(
          "skills",
          "axm-skill.json",
          "@community",
          "conflict-skill",
          { agents: ["claude-code"], dependencies: {} },
        );

        const layer = withServices(axmDir, registryRoot);

        // First publish
        yield* publishExtension(
          makeOp({
            name: "@community/skills/conflict-skill",
            type: "skill",
            registryName: "local",
          }),
        ).pipe(Effect.provide(layer));

        // Change content but keep same version
        fs.writeFileSync(path.join(extensionDir, "src", "content.md"), "changed content");

        // Second publish — same version, different content → should fail
        const error = yield* publishExtension(
          makeOp({
            name: "@community/skills/conflict-skill",
            type: "skill",
            registryName: "local",
          }),
        ).pipe(Effect.provide(layer), Effect.flip);

        expect(error.what).toBe("Failed to publish to registry");
        expect(error.details).toEqual(
          expect.arrayContaining([
            expect.stringContaining("already exists with different integrity"),
          ]),
        );
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  describe("error cases", () => {
    it.effect("fails when managed extension does not exist", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        const registryRoot = path.join(tmpDir, "registry");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.mkdirSync(registryRoot, { recursive: true });

        const result = yield* publishExtension(
          makeOp({ name: "@community/skills/nonexistent", type: "skill", registryName: "local" }),
        ).pipe(
          Effect.provide(withServices(axmDir, registryRoot)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Managed extension not found");
      }),
    );

    it.effect("fails when registry source is not found", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup(
          "skills",
          "axm-skill.json",
          "@community",
          "reg-skill",
          {
            agents: ["claude-code"],
            dependencies: {},
          },
        );

        const result = yield* publishExtension(
          makeOp({
            name: "@community/skills/reg-skill",
            type: "skill",
            registryName: "nonexistent",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir, registryRoot)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
      }),
    );

    it.effect("fails when manifest is missing", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        const registryRoot = path.join(tmpDir, "registry");
        // Create extension dir without manifest
        const extensionDir = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "commands",
          "no-manifest",
        );
        fs.mkdirSync(extensionDir, { recursive: true });
        fs.mkdirSync(registryRoot, { recursive: true });

        const result = yield* publishExtension(
          makeOp({
            name: "@community/commands/no-manifest",
            type: "command",
            registryName: "local",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir, registryRoot)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to read manifest");
      }),
    );

    it.effect("fails when manifest has invalid JSON", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        const registryRoot = path.join(tmpDir, "registry");
        const extensionDir = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "mcp-servers",
          "bad-json",
        );
        fs.mkdirSync(extensionDir, { recursive: true });
        fs.mkdirSync(registryRoot, { recursive: true });
        fs.writeFileSync(path.join(extensionDir, "axm-mcp-server.json"), "not json{{{");

        const result = yield* publishExtension(
          makeOp({
            name: "@community/mcp-servers/bad-json",
            type: "mcp-server",
            registryName: "local",
          }),
        ).pipe(
          Effect.provide(withServices(axmDir, registryRoot)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Invalid JSON");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Dependencies preserved in version entry
  // ---------------------------------------------------------------------------

  describe("skill dependencies in version entry", () => {
    it.effect("includes dependencies from skill manifest in the published version entry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup(
          "skills",
          "axm-skill.json",
          "@community",
          "deps-skill",
          {
            agents: ["claude-code"],
            dependencies: {
              "@acme/skills/helper": "^1.0.0",
            },
          },
        );

        yield* publishExtension(
          makeOp({ name: "@community/skills/deps-skill", type: "skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "deps-skill",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions[0].dependencies).toEqual({
          "@acme/skills/helper": "^1.0.0",
        });
      }),
    );
  });
});
