import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { TestMachineRenderer, TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
import { resolveBuiltinPack } from "../builtin-pack/index.js";
import { writeWorkspaceFiles } from "../test-stubs.js";
import { handleDoctor } from "./doctor.js";

describe("doctor handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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

  const makeLayers = (opts?: { machine?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const rendererLayer = renderer.layer;
    const rendererState = renderer.state;
    const baseLayer = Layer.mergeAll(NodeServices.layer, rendererLayer, TestFlagsLayer());
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
    };
    const wsLayer = Layer.provide(
      coreWorkspaceLayer({ ...wsOptions, resolveBuiltinPack: resolveBuiltinPack() }),
      baseLayer,
    );
    const fullLayer = Layer.mergeAll(baseLayer, wsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(fullLayer));

    return { provide, rendererState };
  };

  it.effect("emits machine-readable checklist diagnostics", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    createManagedSkillWorkspace();

    return provide(
      Effect.gen(function* () {
        yield* handleDoctor();

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          schemaVersion: 1,
          command: "doctor",
          result: {
            healthy: false,
            canSync: true,
            failed: 1,
            passed: 2,
            checks: [
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
              },
            ],
          },
        });
      }),
    );
  });
});
