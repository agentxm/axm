import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { writeWorkspaceFiles } from "./test-stubs.js";
import { layer as workspaceLayer } from "./service.js";
import { getWorkspaceLockfileSyncReadiness, syncWorkspaceLockfile } from "./sync.js";

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
      const baseLayer = Layer.mergeAll(NodeServices.layer, TestFlagsLayer());
      const wsLayer = Layer.provide(
        workspaceLayer({
          scope: "project",
          agents: Option.none(),
          resolveBuiltinPack: Effect.die("unused in sync tests"),
        }),
        baseLayer,
      );
      return Layer.mergeAll(baseLayer, wsLayer);
    })();

  const createManagedSkillWorkspace = (opts?: {
    readonly lockfileSkills?: Record<string, unknown>;
  }) => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      profile: "@axm",
      skills: {
        "manage-extensions": "@axm/skills/manage-extensions",
      },
      lockfileSkills: opts?.lockfileSkills,
    });

    const canonicalDir = path.join(axmDir, "extensions", "@axm", "skills", "manage-extensions");
    fs.mkdirSync(path.join(canonicalDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, "axm-skill.json"),
      JSON.stringify(
        {
          profile: "@axm",
          type: "skill",
          name: "manage-extensions",
          version: "0.0.1",
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(path.join(canonicalDir, "src", "SKILL.md"), "name: manage-extensions\n");
  };

  const createManagedPackWorkspace = () => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      profile: "@acme",
      skills: {
        "code-review": {
          source: "@acme/skills/code-review",
          enabled: false,
        },
      },
      packs: {
        starter: "@acme/packs/starter",
      },
    });

    const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "code-review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "axm-skill.json"),
      JSON.stringify(
        {
          profile: "@acme",
          type: "skill",
          name: "code-review",
          version: "1.2.0",
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(path.join(skillDir, "src", "SKILL.md"), "name: code-review\n");

    const packDir = path.join(axmDir, "extensions", "@acme", "packs", "starter");
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(
      path.join(packDir, "axm-pack.json"),
      JSON.stringify(
        {
          profile: "@acme",
          type: "pack",
          name: "starter",
          version: "1.0.0",
          skills: {
            "@acme/skills/code-review": "^1.2.0",
          },
        },
        null,
        2,
      ) + "\n",
    );
  };

  it.effect("replaces lockfile contents from settings-backed desired state", () =>
    (() => {
      createManagedSkillWorkspace({
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
        const entryCount = yield* syncWorkspaceLockfile();

        expect(entryCount).toBe(1);

        const lockfile = YAML.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8"),
        );

        expect(lockfile.skills).toEqual({
          "manage-extensions": expect.objectContaining({
            type: "registry",
            profile: "@axm",
            name: "manage-extensions",
            resolvedVersion: "0.0.1",
            sourceName: "default",
            agents: ["claude-code"],
          }),
        });
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("keeps pack-owned dependencies nested under the synchronized pack entry", () =>
    (() => {
      createManagedPackWorkspace();

      return Effect.gen(function* () {
        const entryCount = yield* syncWorkspaceLockfile();

        expect(entryCount).toBe(2);

        const lockfile = YAML.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8"),
        );

        expect(Object.keys(lockfile.skills)).toEqual(["code-review"]);
        expect(lockfile.skills["code-review"]).toMatchObject({
          type: "registry",
          profile: "@acme",
          name: "code-review",
          resolvedVersion: "1.2.0",
          sourceName: "default",
          agents: ["claude-code"],
        });
        expect(lockfile.packs.starter).toMatchObject({
          type: "registry",
          profile: "@acme",
          name: "starter",
          resolvedVersion: "1.0.0",
          sourceName: "default",
          resolvedSkills: {
            "@acme/skills/code-review": "1.2.0",
          },
        });
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );

  it.effect("reports unresolved declarations without consulting the existing lockfile", () =>
    (() => {
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        profile: "@axm",
        skills: {
          "manage-extensions": "@axm/skills/manage-extensions",
        },
      });

      return Effect.gen(function* () {
        const readiness = yield* getWorkspaceLockfileSyncReadiness();

        expect(readiness.canSync).toBe(false);
        expect(readiness.unresolvedCount).toBe(1);
        expect(readiness.unresolved[0]).toContain("skills:@axm/manage-extensions");
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );
});
