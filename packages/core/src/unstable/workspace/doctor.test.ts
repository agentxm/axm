import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { writeWorkspaceFiles } from "./test-stubs.js";
import { diagnoseWorkspaceDoctor } from "./doctor.js";
import { layer as workspaceLayer } from "./service.js";

describe("workspace doctor", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-doctor-test-"));
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
          resolveBuiltinPack: Effect.die("unused in doctor tests"),
        }),
        baseLayer,
      );
      return Layer.mergeAll(baseLayer, wsLayer);
    })();

  const createManagedSkillWorkspace = () => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      profile: "@axm",
      skills: {
        "manage-extensions": "@axm/skills/manage-extensions",
      },
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

  it.effect("reports lockfile drift when settings declarations are missing from the lockfile", () =>
    (() => {
      createManagedSkillWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.canSync).toBe(true);
        expect(diagnosis.checks).toMatchObject([
          {
            name: "Lockfile",
            status: "pass",
          },
          {
            name: "Declared Extensions on Disk",
            status: "pass",
          },
          {
            name: "Settings/Lockfile Sync",
            status: "fail",
            hint: "Run `axm sync` to reconcile workspace state from settings.json.",
          },
        ]);
      }).pipe(Effect.provide(makeLayers()));
    })(),
  );
});
