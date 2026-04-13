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
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { TestMachineRenderer, TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import { CommandManagerLive } from "@axm.sh/core/unstable/commands";
import { McpServerManagerLive } from "@axm.sh/core/unstable/mcp-servers";
import { ExtensionPackManagerLive } from "@axm.sh/core/unstable/packs";
import { SkillManagerLive } from "@axm.sh/core/unstable/skills";
import { SourceHostProvidersLive } from "@axm.sh/core/unstable/source-resolution";
import { SubagentManagerLive } from "@axm.sh/core/unstable/subagents";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
import { getAppError } from "../test-helpers.js";
import { writeWorkspaceFiles } from "../test-stubs.js";
import { InstallCommandCommandWorkflowActionsLive } from "./commands/install/command-actions.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "./mcp-servers/install/command-actions.js";
import { InstallPackCommandWorkflowActionsLive } from "./packs/install/command-actions.js";
import { InstallSkillCommandWorkflowActionsLive } from "./skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActionsLive } from "./subagents/install/command-actions.js";
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
    readonly lockfileSkills?: Record<string, unknown>;
  }) => {
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      profile: "@axm",
      skills: {
        "example-skill": opts.skillSource,
      },
      lockfileSkills: opts.lockfileSkills,
    });
  };

  const makeLayers = (opts?: { machine?: boolean; nonInteractive?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const flagConfig =
      opts?.nonInteractive === undefined ? {} : { nonInteractive: opts.nonInteractive };
    const baseLayer = Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer(flagConfig),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
    };
    const wsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      baseLayer,
    );
    const workspaceFoundation = Layer.mergeAll(baseLayer, wsLayer);
    const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, workspaceFoundation);
    const workspaceServiceLayer = Layer.mergeAll(
      workspaceFoundation,
      sourceProvidersLayer,
      CodingAgentRepositoryLive,
    );
    const commandsLayer = Layer.provideMerge(
      InstallCommandCommandWorkflowActionsLive,
      CommandManagerLive,
    );
    const mcpServersLayer = Layer.provideMerge(
      InstallMcpServerCommandWorkflowActionsLive,
      McpServerManagerLive,
    );
    const skillsLayer = Layer.provideMerge(
      InstallSkillCommandWorkflowActionsLive,
      SkillManagerLive,
    );
    const subagentsLayer = Layer.provideMerge(
      InstallSubagentCommandWorkflowActionsLive,
      SubagentManagerLive,
    );
    const packsLayer = Layer.provideMerge(
      InstallPackCommandWorkflowActionsLive,
      ExtensionPackManagerLive,
    );
    const coreExtensions = Layer.mergeAll(
      commandsLayer,
      mcpServersLayer,
      skillsLayer,
      subagentsLayer,
    );
    const extensionsLayer = Layer.provideMerge(packsLayer, coreExtensions);
    const fullLayer = Layer.provideMerge(extensionsLayer, workspaceServiceLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(fullLayer));

    return { provide, rendererState: renderer.state };
  };

  it.effect("synchronizes managed skill files and rewrites axm-lock.yaml", () => {
    const { provide } = makeLayers();
    const sourceDir = createSourceSkillDir();
    createWorkspace({
      skillSource: sourceDir,
      lockfileSkills: {
        stale: {
          type: "registry",
          owner: "@axm",
          name: "stale",
          resolvedVersion: "1.0.0",
          integrity: "sha512-stale",
          sourceName: "default",
          agents: ["claude-code"],
          installedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleSync({ yes: true, preview: false });

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
      }),
    );
  });

  it.effect("emits a preview plan without mutating the workspace", () => {
    const { provide, rendererState } = makeLayers({ machine: true, nonInteractive: true });
    const sourceDir = createSourceSkillDir();
    createWorkspace({
      skillSource: sourceDir,
    });
    const originalLockfile = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8");

    return provide(
      Effect.gen(function* () {
        yield* handleSync({ yes: false, preview: true });

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          _version: 1,
          command: "sync",
          result: {
            outcome: "previewed",
            planName: "Sync workspace",
            planDescription: "Synchronize managed workspace state from settings.json",
            totalSteps: 2,
            readyCount: 2,
            steps: expect.arrayContaining([
              {
                label: "Managed extensions and axm-lock.yaml",
                status: "ready",
              },
            ]),
          },
        });

        expect(fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8")).toBe(
          originalLockfile,
        );
        expect(
          fs.existsSync(
            path.join(tempDir, ".axm", "extensions", "external", "skills", "example-skill"),
          ),
        ).toBe(false);
      }),
    );
  });

  it.effect("reports unresolved skill declarations without suggesting --force", () => {
    const { provide } = makeLayers();
    createWorkspace({
      skillSource: path.join(tempDir, "missing-skill"),
    });

    return provide(
      Effect.gen(function* () {
        const error = yield* handleSync({ yes: true, preview: false }).pipe(Effect.flip);
        const appError = getAppError(error);

        expect(appError.code).toBe("PLAN_BLOCKED_BY_ERRORS");
        expect(appError.what).toBe("Plan has errors that prevent execution");
        expect(Option.getOrUndefined(appError.howToFix)).toBe(
          'Check the source for skill "example-skill" in settings.json.',
        );
      }),
    );
  });

  it.effect("reports invalid command entries with a targeted fix", () => {
    const { provide } = makeLayers();
    const axmDir = path.join(tempDir, ".axm");
    writeWorkspaceFiles(axmDir, {
      agents: ["claude-code"],
      commands: {
        "example-command": "^1.0.0",
      },
    });

    return provide(
      Effect.gen(function* () {
        const error = yield* handleSync({ yes: true, preview: false }).pipe(Effect.flip);
        const appError = getAppError(error);

        expect(appError.code).toBe("PLAN_BLOCKED_BY_ERRORS");
        expect(Option.getOrUndefined(appError.howToFix)).toBe(
          'Use a name like "@owner/commands/name".',
        );
      }),
    );
  });
});
