import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { logsByTag, TestMachineRenderer, TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import { isEffectCliExit } from "@axm.sh/core/unstable/cli-runtime";
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

const expectDieExit = (exit: Exit.Exit<unknown, unknown>, exitCode: number) => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const defect = Cause.squash(exit.cause);
    expect(isEffectCliExit(defect)).toBe(true);
    if (isEffectCliExit(defect)) {
      expect(defect.exitCode).toBe(exitCode);
    }
  }
};

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
              [],
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
        "example-skill": "@axm/skills/example-skill",
      },
    });
  };

  const installCanonicalSkill = () => {
    const canonicalDir = path.join(
      tempDir,
      ".axm",
      "extensions",
      "@axm",
      "skills",
      "example-skill",
    );
    fs.mkdirSync(path.join(canonicalDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, "skill.json"),
      JSON.stringify(
        {
          owner: "@axm",
          type: "skill",
          name: "example-skill",
          version: "0.0.1",
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(path.join(canonicalDir, "src", "SKILL.md"), "name: example-skill\n");
  };

  const installAgentSkillArtifact = () => {
    fs.mkdirSync(path.join(tempDir, ".claude", "skills", "example-skill"), { recursive: true });
  };

  const makeLayers = (providers: SourceHostProvidersService, opts?: { machine?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const rendererLayer = renderer.layer;
    const rendererState = renderer.state;
    const baseLayer = Layer.mergeAll(NodeServices.layer, rendererLayer, TestFlagsLayer());
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
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

  it.effect("emits machine-readable diagnostics and exits 1 on failures", () => {
    const { provide, rendererState } = makeLayers(makeSourceProviders(["example-skill"]), {
      machine: true,
    });
    createSkillWorkspace();

    return provide(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(handleDoctor());

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          _version: 1,
          command: "doctor",
          data: {
            healthy: false,
            canSync: true,
            failed: 1,
            warned: 0,
            diagnostics: [
              {
                code: "SKILL_NOT_INSTALLED",
                severity: "fail",
                subject: "skill:example-skill",
              },
            ],
          },
        });
        expectDieExit(exit, 1);
      }),
    );
  });

  it.effect(
    "renders a diagnostics table with the code column and an error summary in human mode",
    () => {
      const { provide, rendererState } = makeLayers(makeSourceProviders(["example-skill"]));
      createSkillWorkspace();

      return provide(
        Effect.gen(function* () {
          const exit = yield* Effect.exit(handleDoctor());

          expect(rendererState.tables).toHaveLength(1);
          expect(rendererState.tables[0]?.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code: "SKILL_NOT_INSTALLED",
                subject: "skill:example-skill",
                severity: "fail",
              }),
            ]),
          );
          expect(logsByTag(rendererState).error).toContain("1 failure");
          expect(logsByTag(rendererState).warn).not.toContain("1 failure");
          expectDieExit(exit, 1);
        }),
      );
    },
  );

  it.effect("emits invalid lockfile diagnostics in machine mode and exits 1", () => {
    const { provide, rendererState } = makeLayers(makeSourceProviders([]), {
      machine: true,
    });
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
    });
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: [");

    return provide(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(handleDoctor());

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          _version: 1,
          command: "doctor",
          data: {
            healthy: false,
            canSync: true,
            failed: 1,
            warned: 0,
            diagnostics: [
              {
                code: "LOCKFILE_INVALID",
                severity: "fail",
                subject: "lockfile:axm-lock.yaml",
              },
            ],
          },
        });
        expectDieExit(exit, 1);
      }),
    );
  });

  it.effect("reports success without rendering a table when no diagnostics are found", () => {
    const { provide, rendererState } = makeLayers(makeSourceProviders(["example-skill"]));
    createSkillWorkspace();
    installCanonicalSkill();
    installAgentSkillArtifact();

    return provide(
      Effect.gen(function* () {
        yield* handleDoctor();

        expect(rendererState.tables).toHaveLength(0);
        expect(logsByTag(rendererState).success).toContain("No issues found.");
      }),
    );
  });
});
