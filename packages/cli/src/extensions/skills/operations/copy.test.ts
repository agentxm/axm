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
import { copySkill } from "./copy.js";
import type { CopySkillOperation } from "./copy.js";

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string) => {
  const mockWs: WorkspaceContextService = {
    global: false,
    path: axmDir,
    baseDir: path.dirname(axmDir),
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getConfiguredRegistrySources: () => Effect.succeed([]),
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

/** Creates a minimal CopySkillOperation for testing. */
const makeOp = (
  overrides: { targetName?: string; location?: string } = {},
): CopySkillOperation => ({
  name: "copy-skill",
  args: {
    ref: {
      type: "skill",
      refType: "local",
      skill: { name: "my-skill", description: Option.some("test skill"), metadata: Option.none() },
      source: { type: "local", path: "/tmp/source" },
      location: overrides.location ?? "file:///tmp/source",
    },
    targetName: overrides.targetName ?? "@community/skills/my-skill",
  },
});

describe("copySkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "copy-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a source skill directory with files. */
  const setupSource = (name = "my-skill") => {
    const src = path.join(tmpDir, "source", name);
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "SKILL.md"), `# ${name}`);
    fs.writeFileSync(path.join(src, "prompt.md"), "prompt content");
    return src;
  };

  /** Sets up a workspace base directory with .axm dir. */
  const setupBase = () => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    return { base, axmDir };
  };

  describe("file copy", () => {
    it.effect("copies source files to .axm/extensions/@namespace/skills/<name>/src/", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* copySkill(
          makeOp({ targetName: "@community/skills/my-skill", location: `file://${src}` }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-skill");

        // Content should be in src/ subdirectory
        const targetDir = path.join(base, ".axm", "extensions", "@community", "skills", "my-skill");
        expect(fs.existsSync(path.join(targetDir, "src", "SKILL.md"))).toBe(true);
        expect(fs.readFileSync(path.join(targetDir, "src", "prompt.md"), "utf-8")).toBe(
          "prompt content",
        );
        // Manifest should NOT be inside src/
        expect(fs.existsSync(path.join(targetDir, "src", "axm-skill.json"))).toBe(false);
      }),
    );

    it.effect("uses the namespace from targetName", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* copySkill(
          makeOp({ targetName: "@myorg/skills/cool-skill", location: `file://${src}` }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const targetDir = path.join(base, ".axm", "extensions", "@myorg", "skills", "cool-skill");
        expect(fs.existsSync(targetDir)).toBe(true);
        expect(fs.existsSync(path.join(targetDir, "src", "SKILL.md"))).toBe(true);
      }),
    );

    it.effect("fails with CliError when source does not exist", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* copySkill(makeOp({ location: "file:///nonexistent/path" })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to copy");
      }),
    );
  });

  describe("manifest generation", () => {
    it.effect("generates axm-skill.json with defaults", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        yield* copySkill(
          makeOp({
            targetName: "@community/skills/my-skill",
            location: `file://${src}`,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        const targetDir = path.join(base, ".axm", "extensions", "@community", "skills", "my-skill");
        const manifestPath = path.join(targetDir, "axm-skill.json");
        expect(fs.existsSync(manifestPath)).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.name).toBe("@community/skills/my-skill");
        expect(manifest.version).toBe("0.1.0");
        expect(manifest).not.toHaveProperty("agents");
        expect(manifest.dependencies).toEqual({});
      }),
    );

    it.effect("uses version 0.1.0 as default", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        yield* copySkill(
          makeOp({ targetName: "@community/skills/my-skill", location: `file://${src}` }),
        ).pipe(Effect.provide(withServices(axmDir)));

        const manifestPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "axm-skill.json",
        );
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.version).toBe("0.1.0");
      }),
    );
  });
});
