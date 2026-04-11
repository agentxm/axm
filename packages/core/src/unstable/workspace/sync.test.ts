import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "../agents/index.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { TestRenderer } from "../cli-renderer/index.js";
import { SourceHostProvidersLive } from "../source-resolution/index.js";
import { writeWorkspaceFiles } from "./test-stubs.js";
import { getWorkspaceSyncReadiness, syncWorkspace } from "./sync.js";
import { layer as workspaceLayer } from "./service.js";

describe("workspace sync", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-sync-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = () =>
    (() => {
      const { layer: rendererLayer } = TestRenderer.make();
      const baseLayer = Layer.mergeAll(NodeServices.layer, TestFlagsLayer(), rendererLayer);
      const wsLayer = Layer.provide(
        workspaceLayer({
          scope: "project",
        }),
        baseLayer,
      );
      const workspaceFoundation = Layer.mergeAll(baseLayer, wsLayer);
      const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, workspaceFoundation);
      return Layer.mergeAll(workspaceFoundation, sourceProvidersLayer, CodingAgentRepositoryLive);
    })();

  const createSourceSkillDir = (name = "example-skill") => {
    const sourceRoot = path.join(tempDir, "source-skills");
    const sourceDir = path.join(sourceRoot, name);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      `---\nname: "${name}"\ndescription: "Test skill"\n---\n\n# ${name}\n`,
    );
    return sourceRoot;
  };

  const createWorkspace = (opts: {
    readonly skillSource: string;
    readonly enabled?: boolean;
    readonly lockfileSkills?: Record<string, unknown>;
  }) => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      profile: "@axm",
      skills: {
        "example-skill":
          opts.enabled === false ? { source: opts.skillSource, enabled: false } : opts.skillSource,
      },
      lockfileSkills: opts.lockfileSkills,
    });
  };

  it.effect("installs declared skills, enables agent artifacts, and rewrites the lockfile", () =>
    (() => {
      const sourceDir = createSourceSkillDir();
      createWorkspace({
        skillSource: sourceDir,
        lockfileSkills: {
          stale: {
            type: "local",
            path: "/tmp/stale",
            agents: ["claude-code"],
            installedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
            updatedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
          },
        },
      });

      return Effect.gen(function* () {
        const entryCount = yield* syncWorkspace();

        expect(entryCount).toBe(1);
        expect(
          fs.existsSync(
            path.join(
              tempDir,
              ".axm",
              "extensions",
              "external",
              "skills",
              "example-skill",
              "SKILL.md",
            ),
          ),
        ).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "example-skill"))).toBe(true);

        const lockfile = YAML.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8"),
        );

        expect(lockfile.skills).toEqual({
          "example-skill": expect.objectContaining({
            type: "local",
            path: sourceDir,
            agents: ["claude-code"],
          }),
        });
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("keeps disabled skills installed but removes their agent artifacts", () =>
    (() => {
      const sourceDir = createSourceSkillDir();
      createWorkspace({
        skillSource: sourceDir,
        enabled: false,
      });

      const staleArtifact = path.join(tempDir, ".claude", "skills", "example-skill");
      fs.mkdirSync(staleArtifact, { recursive: true });
      fs.writeFileSync(path.join(staleArtifact, "SKILL.md"), "stale\n");

      return Effect.gen(function* () {
        const entryCount = yield* syncWorkspace();

        expect(entryCount).toBe(1);
        expect(
          fs.existsSync(
            path.join(
              tempDir,
              ".axm",
              "extensions",
              "external",
              "skills",
              "example-skill",
              "SKILL.md",
            ),
          ),
        ).toBe(true);
        expect(fs.existsSync(staleArtifact)).toBe(false);

        const lockfile = YAML.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8"),
        );

        expect(lockfile.skills["example-skill"]).toMatchObject({
          type: "local",
          path: sourceDir,
          agents: [],
        });
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("reports unresolved skills without consulting the current lockfile", () =>
    (() => {
      createWorkspace({
        skillSource: path.join(tempDir, "missing-skill"),
      });

      return Effect.gen(function* () {
        const readiness = yield* getWorkspaceSyncReadiness();

        expect(readiness.canSync).toBe(false);
        expect(readiness.blockers).toHaveLength(1);
        expect(readiness.blockers[0]?.subject).toBe("skill:example-skill");
        expect(readiness.blockers[0]?.message).toContain(
          "Could not determine an installable skill",
        );
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );
});
