import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { TestMachineRenderer, TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "@axm.sh/core/unstable/source-resolution";
import { buildRegistrySkillRef } from "@axm.sh/core/unstable/skills";
import { decodeExactSemverVersionSync } from "@axm.sh/core/unstable/version-constraints";
import { decodeHandleSync, decodeExtensionNameSync } from "@axm.sh/core/unstable/extensions";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
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

  const makeSourceProviders = (skillNames: ReadonlyArray<string>): SourceHostProvidersService => ({
    find: (_source, options) =>
      Effect.succeed(
        skillNames
          .filter(
            (skillName) =>
              options.skillNames.length === 0 || options.skillNames.includes(skillName),
          )
          .map((skillName) =>
            buildRegistrySkillRef(
              decodeHandleSync("@axm"),
              decodeExtensionNameSync(skillName),
              decodeExactSemverVersionSync("0.0.1"),
              {
                type: "registry",
                location: new URL("https://registry.agentxm.ai"),
                owner: Option.none(),
              },
            ),
          ),
      ),
    fetch: () => Effect.die("unused in doctor handler tests"),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  });

  const createSkillWorkspace = () => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      profile: "@axm",
      skills: {
        "manage-extensions": "@axm/skills/manage-extensions",
      },
    });
  };

  const makeLayers = (providers: SourceHostProvidersService, opts?: { machine?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const rendererLayer = renderer.layer;
    const rendererState = renderer.state;
    const baseLayer = Layer.mergeAll(NodeServices.layer, rendererLayer, TestFlagsLayer());
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
    };
    const wsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
        builtInSources: [
          {
            name: "default",
            type: "registry",
            location: new URL("https://registry.agentxm.ai"),
          },
        ],
      }),
      baseLayer,
    );
    const fullLayer = Layer.mergeAll(
      baseLayer,
      wsLayer,
      CodingAgentRepositoryLive,
      Layer.succeed(SourceHostProviders, providers),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(fullLayer));

    return { provide, rendererState };
  };

  it.effect("emits machine-readable checklist diagnostics", () => {
    const { provide, rendererState } = makeLayers(makeSourceProviders(["manage-extensions"]), {
      machine: true,
    });
    createSkillWorkspace();

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
            passed: 1,
            skipped: 1,
            checks: [
              {
                name: "Skills Resolvable",
                status: "pass",
              },
              {
                name: "Skills Installed",
                status: "fail",
              },
              {
                name: "Skills Enabled",
                status: "skip",
              },
            ],
          },
        });
      }),
    );
  });
});
