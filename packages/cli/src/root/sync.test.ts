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
import { TestMachineRenderer, TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
import { resolveBuiltinPack } from "../builtin-pack/index.js";
import { writeWorkspaceFiles } from "../test-stubs.js";
import { handleSync } from "./sync.js";

describe("sync handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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
          owner: "@axm",
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

  const makeLayers = (opts?: { machine?: boolean; nonInteractive?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const [promptLayer] = makeTestPrompt({ confirmResponses: [true] });
    const flagConfig =
      opts?.nonInteractive === undefined ? {} : { nonInteractive: opts.nonInteractive };
    const baseLayer = Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      promptLayer,
      TestFlagsLayer(flagConfig),
    );
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

    return { provide, rendererState: renderer.state };
  };

  it.effect("rewrites axm-lock.yaml from desired settings state", () => {
    const { provide } = makeLayers();
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

    return provide(
      Effect.gen(function* () {
        yield* handleSync({ yes: true, preview: false });

        const lockfile = YAML.parse(
          fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8"),
        );

        expect(lockfile.skills).toEqual({
          "manage-extensions": expect.objectContaining({
            type: "registry",
            owner: "@axm",
            name: "manage-extensions",
            resolvedVersion: "0.0.1",
            sourceName: "default",
            agents: ["claude-code"],
          }),
        });
      }),
    );
  });

  it.effect("emits a preview plan without mutating the workspace", () => {
    const { provide, rendererState } = makeLayers({ machine: true, nonInteractive: true });
    createManagedSkillWorkspace();
    const originalLockfile = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8");

    return provide(
      Effect.gen(function* () {
        yield* handleSync({ yes: false, preview: true });

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          schemaVersion: 1,
          command: "sync",
          result: {
            outcome: "previewed",
            planName: "Sync workspace",
            planDescription: "Synchronize managed workspace state from settings.json",
            totalSteps: 1,
            readyCount: 1,
            steps: [
              {
                label: "axm-lock.yaml",
                status: "ready",
              },
            ],
          },
        });

        expect(fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8")).toBe(
          originalLockfile,
        );
      }),
    );
  });
});
