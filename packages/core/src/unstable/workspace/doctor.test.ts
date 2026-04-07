import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "../agents/index.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import {
  type SourceHostProvidersService,
  SourceHostProviders,
} from "../source-resolution/index.js";
import { buildRegistrySkillRef } from "../skills/index.js";
import { writeWorkspaceFiles } from "./test-stubs.js";
import { diagnoseWorkspaceDoctor } from "./doctor.js";
import { layer as workspaceLayer } from "./service.js";
import { decodeExactSemverVersionSync } from "../version-constraints/version-constraints.js";

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
              `@axm/skills/${skillName}`,
              decodeExactSemverVersionSync("0.0.1"),
              {
                type: "registry",
                location: new URL("https://registry.agentxm.ai"),
                owner: Option.none(),
              },
            ),
          ),
      ),
    fetch: () => Effect.die("unused in doctor tests"),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  });

  const makeLayers = (providers: SourceHostProvidersService) =>
    (() => {
      const baseLayer = Layer.mergeAll(NodeServices.layer, TestFlagsLayer());
      const wsLayer = Layer.provide(
        workspaceLayer({
          scope: "project",
          agents: Option.none(),
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
      return Layer.mergeAll(
        baseLayer,
        wsLayer,
        CodingAgentRepositoryLive,
        Layer.succeed(SourceHostProviders, providers),
      );
    })();

  const createSkillWorkspace = () => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      skills: {
        "manage-extensions": "@axm/skills/manage-extensions",
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
      "manage-extensions",
    );
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

  it.effect("reports install drift separately from resolution", () =>
    (() => {
      createSkillWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.checks).toMatchObject([
          {
            name: "Skills Resolvable",
            status: "pass",
          },
          {
            name: "Skills Installed",
            status: "fail",
            hint: "Run `axm sync` to install missing skills into the workspace.",
          },
          {
            name: "Skills Enabled",
            status: "skip",
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.passed).toBe(1);
        expect(diagnosis.skipped).toBe(1);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders(["manage-extensions"]))));
    })(),
  );

  it.effect("reports enablement drift separately from installation", () =>
    (() => {
      createSkillWorkspace();
      installCanonicalSkill();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.checks).toMatchObject([
          {
            name: "Skills Resolvable",
            status: "pass",
          },
          {
            name: "Skills Installed",
            status: "pass",
          },
          {
            name: "Skills Enabled",
            status: "fail",
            hint: "Run `axm sync` to reconcile enabled skill artifacts for configured agents.",
          },
        ]);
        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.passed).toBe(2);
        expect(diagnosis.canSync).toBe(true);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders(["manage-extensions"]))));
    })(),
  );

  it.effect("blocks sync when a declared skill cannot be resolved", () =>
    (() => {
      createSkillWorkspace();

      return Effect.gen(function* () {
        const diagnosis = yield* diagnoseWorkspaceDoctor();

        expect(diagnosis.failed).toBe(1);
        expect(diagnosis.skipped).toBe(2);
        expect(diagnosis.canSync).toBe(false);
        expect(diagnosis.checks).toMatchObject([
          {
            name: "Skills Resolvable",
            status: "fail",
            hint: "Fix the declared skill sources in settings.json before running `axm sync`.",
          },
          {
            name: "Skills Installed",
            status: "skip",
          },
          {
            name: "Skills Enabled",
            status: "skip",
          },
        ]);
      }).pipe(Effect.provide(makeLayers(makeSourceProviders([]))));
    })(),
  );
});
