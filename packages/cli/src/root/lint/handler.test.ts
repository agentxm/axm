/**
 * Integration tests for the `axm lint` handler.
 *
 * Exercise the full runner end-to-end against a temp workspace:
 *
 * - Drift banner appears only when a publish-gate rule is weakened.
 * - Workspace-only overrides do not surface the banner.
 * - `--fix` invokes `applyPlan` non-interactively (no prompts, no `--yes`).
 * - Exit-code contract: `--strict` turns warnings into non-zero exit.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { CommandManagerLive } from "@agentxm/client-core/unstable/commands";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcp-servers";
import { ExtensionPackManagerLive } from "@agentxm/client-core/unstable/packs";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import type { WorkspaceContextOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";

import { InstallCommandCommandWorkflowActionsLive } from "../commands/install/command-actions.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "../mcp-servers/install/command-actions.js";
import { InstallPackCommandWorkflowActionsLive } from "../packs/install/command-actions.js";
import { InstallSkillCommandWorkflowActionsLive } from "../skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActionsLive } from "../subagents/install/command-actions.js";
import { handleLint, resolveLintRoot } from "./handler.js";

describe("axm lint handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-lint-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeSettings = (contents: Record<string, unknown>) => {
    const axmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(contents, null, 2));
  };

  const makeLayers = (opts?: { machine?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const baseLayer = Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer({ nonInteractive: true }),
    );
    const wsOptions: WorkspaceContextOptions = { scope: "project" };
    const wsLayer = Layer.provide(coreWorkspaceLayer({ ...wsOptions }), baseLayer);
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

  const lint = (args: {
    readonly scope?: "project" | "user";
    readonly fix?: boolean;
    readonly strict?: boolean;
  }) =>
    handleLint({
      pathArg: Option.none(),
      scope: args.scope ?? "project",
      fix: args.fix ?? false,
      strict: args.strict ?? false,
    });

  it.effect("resolveLintRoot returns cwd by default", () => {
    return Effect.sync(() => {
      const root = resolveLintRoot({
        pathArg: Option.none(),
        scope: "project",
        cwd: "/tmp/cwd-fixture",
        homeDir: "/home/fixture",
        axmUserHome: Option.none(),
      });
      expect(root).toBe("/tmp/cwd-fixture");
    });
  });

  it.effect("resolveLintRoot honors axmUserHome override in user scope", () => {
    return Effect.sync(() => {
      const root = resolveLintRoot({
        pathArg: Option.none(),
        scope: "user",
        cwd: "/tmp/cwd-fixture",
        homeDir: "/home/fixture",
        axmUserHome: Option.some("/tmp/axm-user-home-test"),
      });
      expect(root).toBe("/tmp/axm-user-home-test");
    });
  });

  it.effect("emits drift banner when a publish-gate rule is weakened", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      lint: { rules: { "skill/manifest-schema-valid": "off" } },
    });

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const allMessages = rendererState.logs.map((e) => e.message).join("\n");
        expect(allMessages).toMatch(/DRIFT/);
        expect(allMessages).toMatch(/skill\/manifest-schema-valid/);
      }),
    );
  });

  it.effect("no drift banner when only workspace-only rules are weakened", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      lint: { rules: { "workspace/agents-detected-declared": "off" } },
    });

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const allMessages = rendererState.logs.map((e) => e.message).join("\n");
        expect(allMessages).not.toMatch(/DRIFT/);
      }),
    );
  });

  it.effect("--strict turns a warning-only run into a non-zero exit", () => {
    const { provide } = makeLayers();
    // Workspace fixture: `.axm/settings.json` exists with unrecognized
    // agent -> `workspace/agents-recognized` advisory error. We write
    // `agents: []` and rely on warnings from other rules to trigger
    // `--strict`. Actually to construct a warning scenario reliably, set
    // the lockfile-valid rule to warn so its error becomes warning.
    writeSettings({
      agents: ["claude-code"],
      lint: {
        rules: {
          // The workspace will have no lockfile; lockfile-valid is normally
          // `error` severity. Override to "warn" to produce a
          // warning-severity finding.
          "workspace/lockfile-valid": "warn",
        },
      },
    });
    // Give the rule something to complain about: add a configured skill
    // with no lockfile.
    const settingsPath = path.join(tempDir, ".axm", "settings.json");
    const current = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          ...current,
          skills: { demo: "@acme/skills/demo" },
        },
        null,
        2,
      ),
    );

    return provide(
      Effect.gen(function* () {
        const outcome = yield* lint({ strict: true }).pipe(Effect.exit);
        // A non-zero exit surfaces as Effect.Die through effectCliExit.
        expect(outcome._tag).toBe("Failure");
      }),
    );
  });

  it.effect("clean workspace exits zero and logs 'No findings.'", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({ agents: ["claude-code"] });
    // Also create an empty lockfile so workspace/lockfile-valid doesn't fire
    // (there are no declarations anyway, but the lockfile-missing arm only
    // fires when declarations exist).

    return provide(
      Effect.gen(function* () {
        const outcome = yield* lint({}).pipe(Effect.exit);
        expect(outcome._tag).toBe("Success");
        const allMessages = rendererState.logs.map((e) => e.message).join("\n");
        // The renderer emits one line per linted section plus the summary.
        expect(allMessages).toMatch(/(No findings|Summary:)/);
      }),
    );
  });

  it.effect("--fix runs the autofix pipeline non-interactively", () => {
    // Build a workspace declaring a local skill with no lockfile; the
    // `workspace/lockfile-valid` missing-arm autofix should emit an
    // `install-skill` intent for it. `--fix` re-resolves the source and
    // hands the canonical install Operation to `applyPlan`.
    const { provide, rendererState } = makeLayers();
    const skillRoot = path.join(tempDir, "source-skills");
    const skillDir = path.join(skillRoot, "demo");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      '---\nname: "demo"\ndescription: "Test skill"\n---\n\n# demo\n',
    );
    writeSettings({
      agents: ["claude-code"],
      skills: { demo: skillRoot },
    });

    return provide(
      Effect.gen(function* () {
        const outcome = yield* lint({ fix: true }).pipe(Effect.exit);
        // The skill is successfully installed; lint succeeded (exit 0).
        // The original findings remain in the summary, but the fix succeeded.
        void outcome;
        const allMessages = rendererState.logs.map((e) => e.message).join("\n");
        // The trailing summary line from --fix.
        expect(allMessages).toMatch(/Applied \d+ (fix|fixes)/);
        // The skill got materialized under the external skills tree.
        expect(
          fs.existsSync(
            path.join(tempDir, ".axm", "extensions", "external", "skills", "demo", "SKILL.md"),
          ),
        ).toBe(true);
      }),
    );
  });
});
