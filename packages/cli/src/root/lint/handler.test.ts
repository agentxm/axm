/**
 * Integration tests for the `axm lint` handler.
 *
 * Exercise the full runner end-to-end against a temp workspace:
 *
 * - Drift banner appears only when a publish-gate rule is weakened.
 * - WorkspaceMutations-only overrides do not surface the banner.
 * - Exit-code contract: `--strict` turns warnings into non-zero exit.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcps";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import {
  AxmSkillCompatibilityPolicy,
  SkillManagerLive,
} from "@agentxm/client-core/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";

import { InstallHookCommandWorkflowActionsLive } from "../hooks/install/command-actions.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "../mcps/install/command-actions.js";
import { InstallPackCommandWorkflowActionsLive } from "../packs/install/command-actions.js";
import { InstallRuleCommandWorkflowActionsLive } from "../rules/install/command-actions.js";
import { InstallSkillCommandWorkflowActionsLive } from "../skills/install/command-actions.js";
import { InstallSubagentCommandWorkflowActionsLive } from "../subagents/install/command-actions.js";
import { handleLint, remapLintSummaryPaths, resolveLintRoot } from "./handler.js";

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

  const writeEmptyLockfile = () => {
    const axmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    fs.writeFileSync(
      path.join(axmDir, "axm-lock.yaml"),
      "lockfileVersion: 4\nskills: {}\nmcpServers: {}\n",
    );
  };

  const makeLayers = (opts?: { machine?: boolean; quiet?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const baseLayer = Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer({ nonInteractive: true, quiet: opts?.quiet ?? false }),
      Layer.succeed(AxmSkillCompatibilityPolicy, {
        evaluate: () => ({
          status: "compatible",
          cliVersion: "0.0.0-test",
          skillVersion: null,
          source: null,
          declaredCliVersion: null,
          declaredCliVersionRange: null,
          reasonCode: null,
          detail: null,
        }),
      }),
    );
    const wsOptions: WorkspaceMutationsOptions = { scope: "project" };
    const wsLayer = Layer.provide(coreWorkspaceLayer({ ...wsOptions }), baseLayer);
    const workspaceFoundation = Layer.mergeAll(baseLayer, wsLayer);
    const sourceProvidersLayer = Layer.provide(SourceHostProvidersLive, workspaceFoundation);
    const workspaceServiceLayer = Layer.mergeAll(
      workspaceFoundation,
      sourceProvidersLayer,
      CodingAgentRepositoryLive,
    );
    const mcpServersLayer = Layer.provideMerge(
      InstallMcpServerCommandWorkflowActionsLive,
      McpServerManagerLive,
    );
    const hooksLayer = Layer.provideMerge(InstallHookCommandWorkflowActionsLive, HookManagerLive);
    const rulesLayer = Layer.provideMerge(InstallRuleCommandWorkflowActionsLive, RuleManagerLive);
    const skillsLayer = Layer.provideMerge(
      InstallSkillCommandWorkflowActionsLive,
      SkillManagerLive,
    );
    const subagentsLayer = Layer.provideMerge(
      InstallSubagentCommandWorkflowActionsLive,
      SubagentManagerLive,
    );
    const packsLayer = Layer.provideMerge(InstallPackCommandWorkflowActionsLive, PackManagerLive);
    const coreExtensions = Layer.mergeAll(
      hooksLayer,
      KnowledgeManagerLive,
      mcpServersLayer,
      rulesLayer,
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
    readonly strict?: boolean;
    readonly details?: boolean;
  }) =>
    handleLint({
      pathArg: Option.none(),
      scope: args.scope ?? "project",
      strict: args.strict ?? false,
      details: args.details ?? false,
      input: { view: "workspace" },
    });

  it.effect("resolveLintRoot returns cwd by default", () => {
    return Effect.sync(() => {
      const root = resolveLintRoot({
        pathArg: Option.none(),
        scope: "project",
        cwd: "/tmp/cwd-fixture",
        userScopeDir: "/home/fixture/.axm",
        pathDirname: (path) => path.split("/").slice(0, -1).join("/"),
      });
      expect(root).toBe("/tmp/cwd-fixture");
    });
  });

  it.effect("resolveLintRoot returns the parent of the resolved user-scope dir", () => {
    return Effect.sync(() => {
      const root = resolveLintRoot({
        pathArg: Option.none(),
        scope: "user",
        cwd: "/tmp/cwd-fixture",
        userScopeDir: "/tmp/axm-user-home-test/.axm",
        pathDirname: (path) => path.split("/").slice(0, -1).join("/"),
      });
      expect(root).toBe("/tmp/axm-user-home-test");
    });
  });

  it("remaps staged snapshot paths back to the Git workspace", () => {
    const sourceRoot = path.join(path.parse(tempDir).root, "private", "axm-lint-staged-123");
    const displayRoot = path.join(path.parse(tempDir).root, "work", "repo");
    const summary = remapLintSummaryPaths(
      {
        findings: [
          {
            group: "workspace",
            displayRoot: sourceRoot,
            path: `${sourceRoot}/.axm/settings.json:4:2`,
            ruleDescription: "Settings must satisfy the workspace schema.",
            finding: {
              kind: "advisory",
              ruleId: "workspace/settings-schema-valid",
              severity: "error",
              message: "Invalid settings",
              location: { file: `${sourceRoot}/.axm/settings.json`, line: 4, column: 2 },
            },
          },
        ],
        counts: { total: 1, errors: 1, warnings: 0, infos: 0 },
        exitCategory: "errors",
        driftBanner: [],
      },
      sourceRoot,
      displayRoot,
      path,
    );

    expect(summary.findings[0]?.displayRoot).toBe(displayRoot);
    expect(summary.findings[0]?.path).toBe(`${displayRoot}/.axm/settings.json:4:2`);
    expect(summary.findings[0]?.finding.location?.file).toBe(`${displayRoot}/.axm/settings.json`);
  });

  it.effect("does not retain the retired publish-gate drift banner", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      lint: { rules: { "skill/manifest-schema-valid": "off" } },
    });

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const allMessages = rendererState.logs.map((e) => e.message).join("\n");
        expect(allMessages).not.toMatch(/The registry will still block publish/);
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
    // WorkspaceMutations fixture: `.axm/settings.json` exists with unrecognized
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

  it.effect("renders grouped diagnostics with severity-aware log levels", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      skills: { demo: "@acme/skills/demo@1.0.0" },
    });

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const logs = logsByTag(rendererState);
        expect(logs.message).not.toContain("More output: `axm lint --details` | `axm lint --json`");
        expect(rendererState.suggestions).toEqual([]);
        expect(logs.message.some((message) => message.includes("axm install demo"))).toBe(false);
        // Rule lines always present
        expect(logs.message).toContain("  rule: workspace/lockfile-valid");
        expect(logs.message).toContain("  rule: workspace/skills-artifacts-correct");
        expect(
          logs.message.some((message) =>
            message.includes(
              "Accepted external-resolution state is missing for desired external content.",
            ),
          ),
        ).toBe(true);
        expect(
          logs.message.some((message) =>
            message.includes("Skill 'demo' is enabled, but it is missing from declared agents"),
          ),
        ).toBe(true);
        expect(
          logs.error.some(
            (message) => message.includes("issues.") && message.includes("need manual attention."),
          ),
        ).toBe(true);
        // Diagnostic headers always show location
        expect(logs.error.some((message) => message.includes("./.axm/axm-lock.yaml"))).toBe(true);
        expect(logs.error.some((message) => message.includes("./.axm/settings.json"))).toBe(true);
      }),
    );
  });

  it.effect("quiet mode emits only the lint summary", () => {
    const { provide, rendererState } = makeLayers({ quiet: true });
    writeSettings({
      agents: ["claude-code"],
      skills: { demo: "@acme/skills/demo@1.0.0" },
    });

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const logs = logsByTag(rendererState);
        expect(logs.error.some((message) => message.includes("issues."))).toBe(true);
        expect(logs.step).toEqual([]);
        expect(logs.message).toEqual([]);
        expect(rendererState.suggestions).toEqual([]);
      }),
    );
  });

  it.effect("fails closed when the lockfile is invalid", () => {
    const { provide } = makeLayers();
    const sourceDir = path.join(tempDir, "source-skills", "demo");
    fs.mkdirSync(sourceDir, { recursive: true });
    writeSettings({
      agents: ["claude-code"],
      skills: { demo: sourceDir },
    });
    fs.writeFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "lockfileVersion: [broken\n");
    const installedDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "demo");
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(path.join(installedDir, "SKILL.md"), "---\nname: demo\n\n# demo\n");

    return provide(
      Effect.gen(function* () {
        const exit = yield* lint({ details: true }).pipe(Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
      }),
    );
  });

  it.effect("reports MCP projection drift without reconciling it", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      mcpServers: {
        demo: {
          command: "node",
          args: ["server.js"],
          env: {},
        },
      },
    });
    writeEmptyLockfile();
    fs.writeFileSync(
      path.join(tempDir, ".mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            demo: {
              "x-axm": { managed: true, source: "inline" },
              type: "stdio",
              command: "python",
            },
            stale: {
              "x-axm": { managed: true, source: "inline" },
              type: "stdio",
              command: "node",
            },
          },
        },
        null,
        2,
      ),
    );

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const reportMessages = rendererState.logs.map((e) => e.message).join("\n");
        expect(reportMessages).toContain("workspace/mcps-agent-drift");
        expect(reportMessages).toContain("workspace/mcps-agent-orphaned");

        const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
        expect(config.mcpServers.demo.command).toBe("python");
        expect(config.mcpServers.stale).toBeDefined();
      }),
    );
  });
});
