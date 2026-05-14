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
import type { PublishSkillOperation } from "./publish.js";
import { publishSkill } from "./publish.js";
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

  /** Sets up a workspace with an installed extension and registry. */
  const setup = (
    owner = "@community",
    name = "my-skill",
    manifest: Record<string, unknown> = {},
  ) => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    const extensionDir = path.join(base, ".axm", "extensions", owner, "skills", name);
    const registryRoot = path.join(tmpDir, "registry");

    const srcDir = path.join(extensionDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(registryRoot, { recursive: true });

    // Write manifest at extension root (not inside src/)
    const defaultManifest = {
      owner,
      type: "skill",
      name,
      version: "0.1.0",
      ...manifest,
    };
    fs.writeFileSync(
      path.join(extensionDir, "skill.json"),
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
        expect(index.owner).toBe("@community");
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
        const manifestPath = path.join(extensionDir, "skill.json");
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

        expect(error.code).toBe("conflict");
        expect(error.detail).toBe("Version 0.1.0 already exists with different content.");
      }),
    );
  });

  describe("companionPackages propagation", () => {
    it.effect("propagates companionPackages from manifest to VersionEntry", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup("@community", "compat-skill", {
          companionPackages: ["pkg:npm/claude-code", "pkg:npm/%40openai/codex"],
        });

        yield* publishSkill(
          makeOp({ name: "@community/skills/compat-skill", registryName: "local" }),
        ).pipe(Effect.provide(withServices(axmDir, registryRoot)));

        const indexPath = path.join(
          registryRoot,
          "extensions",
          "@community",
          "skills",
          "compat-skill",
          "index.json",
        );
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.versions[0].companionPackages).toEqual([
          { type: "npm", name: "claude-code" },
          { type: "npm", namespace: "@openai", name: "codex" },
        ]);
      }),
    );

    it.effect("omits companionPackages when manifest does not include it", () =>
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
        expect(index.versions[0]).not.toHaveProperty("companionPackages");
      }),
    );
  });

  describe("invalid companionPackages", () => {
    it.effect("fails at schema decode when companionPackages contains invalid purls", () =>
      Effect.gen(function* () {
        const { axmDir, registryRoot } = setup("@community", "bad-purl-skill", {
          companionPackages: ["not-a-valid-purl"],
        });

        const result = yield* publishSkill(
          makeOp({ name: "@community/skills/bad-purl-skill", registryName: "local" }),
        ).pipe(
          Effect.provide(withServices(axmDir, registryRoot)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, code: e.code })),
        );

        expect(result.result).toBe("error");
        if (!("code" in result)) {
          throw new Error("Expected error result with code");
        }
        expect(result.code).toBe("validation");
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails when extension directory does not exist", () =>
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
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
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
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("not found");
      }),
    );
  });
});
