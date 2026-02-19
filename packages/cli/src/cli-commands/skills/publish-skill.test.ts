import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { Workspace, type WorkspaceContextService } from "../../workspace/service.js";
import type { PublishSkillOperation } from "./operations.js";
import { publishSkill } from "./publish-skill.js";

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
    getConfiguredScope: () => Effect.succeed("@community"),
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

/** Creates a minimal PublishSkillOperation for testing. */
const makeOp = (overrides: Partial<PublishSkillOperation["args"]> = {}): PublishSkillOperation => ({
  name: "publish-skill",
  args: {
    name: overrides.name ?? "@community/skills/my-skill",
    registryName: overrides.registryName ?? "local",
  },
});

describe("publishSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "publish-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a workspace with a managed extension and registry. */
  const setup = (
    scope = "@community",
    name = "my-skill",
    manifest: Record<string, unknown> = {},
  ) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const extensionDir = path.join(base, ".axm", "extensions", scope, "skills", name);
    const registryRoot = path.join(tmpDir, "registry");

    const srcDir = path.join(extensionDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    // Write manifest at extension root (not inside src/)
    const defaultManifest = {
      name: `${scope}/skills/${name}`,
      version: "0.1.0",
      agents: ["claude-code"],
      dependencies: {},
      ...manifest,
    };
    fs.writeFileSync(
      path.join(extensionDir, "axm-skill.json"),
      JSON.stringify(defaultManifest, null, 2),
    );

    // Write skill files in src/ subdirectory
    fs.writeFileSync(path.join(srcDir, "SKILL.md"), `# ${name}`);
    fs.writeFileSync(path.join(srcDir, "prompt.md"), "prompt content");

    return { base, axmDir, extensionDir, registryRoot };
  };

  describe("archive creation", () => {
    it.effect("creates a zip archive and publishes to the registry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup();

        const result = yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
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
        expect(index.scope).toBe("@community");
        expect(index.type).toBe("skill");
        expect(index.versions).toHaveLength(1);
        expect(index.versions[0].version).toBe("0.1.0");
      }),
    );
  });

  describe("integrity computation", () => {
    it.effect("writes integrity in sha512-<base64> SRI format to index", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup();

        yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions[0].integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
      }),
    );
  });

  describe("index creation and update", () => {
    it.effect("creates a new index.json when publishing first version", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup();

        yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions).toHaveLength(1);
        expect(index.versions[0].version).toBe("0.1.0");
      }),
    );

    it.effect("prepends to existing index when publishing a new version", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot, extensionDir } = setup();

        // Publish v0.1.0 first
        yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        // Update manifest to v0.2.0
        const manifestPath = path.join(extensionDir, "axm-skill.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        manifest.version = "0.2.0";
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // Publish v0.2.0
        yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions).toHaveLength(2);
        // Newest first
        expect(index.versions[0].version).toBe("0.2.0");
        expect(index.versions[1].version).toBe("0.1.0");
      }),
    );
  });

  describe("idempotency", () => {
    it.effect("is a no-op when same version + same integrity published twice", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup();

        // Publish once
        yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        // Publish again — same content, same version
        const result = yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        expect(result.result).toBe("success");

        // Still only one version in the index
        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions).toHaveLength(1);
      }),
    );

    it.effect("fails when same version has a different integrity", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot, extensionDir } = setup();

        // Publish v0.1.0
        yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        // Change content (different integrity) but keep same version
        fs.writeFileSync(path.join(extensionDir, "src", "prompt.md"), "changed content");

        // Publish again — same version, different content → should fail
        const error = yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)), Effect.flip);

        expect(error.what).toBe("Failed to publish to registry");
        expect(error.details).toEqual(
          expect.arrayContaining([
            expect.stringContaining("already exists with different integrity"),
          ]),
        );
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when managed extension does not exist", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        const registryRoot = path.join(tmpDir, "registry");
        fs.mkdirSync(axmDir, { recursive: true });
        fs.mkdirSync(registryRoot, { recursive: true });

        const result = yield* publishSkill(
          makeOp({ name: "@community/skills/nonexistent", registryName: "local" }),
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
        const { axmDir, registryRoot } = setup();

        const result = yield* publishSkill(
          makeOp({ name: "@community/skills/my-skill", registryName: "nonexistent" }),
        ).pipe(
          Effect.provide(withServices(axmDir, registryRoot)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
      }),
    );
  });
});
