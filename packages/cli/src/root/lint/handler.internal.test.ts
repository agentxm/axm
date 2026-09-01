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
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { afterEach, beforeEach } from "vitest";

import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "@agentxm/extension-management/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import { HookManagerLive } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/extension-management/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/extension-management/unstable/mcps";
import { PackManagerLive } from "@agentxm/extension-management/unstable/packs";
import { RuleManagerLive } from "@agentxm/extension-management/unstable/rules";
import { WorkspaceInvariantFactsLive } from "@agentxm/extension-management/unstable/projection";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { AxmSkillCompatibilityPolicy } from "@agentxm/extension-workspace";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";
import { WorkspaceCatalogLive } from "@agentxm/extension-management/unstable/cli-runtime";
import { SubagentManagerLive } from "@agentxm/extension-management/unstable/subagents";
import type { WorkspaceMutationsOptions } from "@agentxm/workspace-state";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-operations/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";

import { ExecutionDirectory } from "../../execution-directory.js";
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
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ owner: "@acme", ...contents }, null, 2),
    );
  };

  const writeEmptyLockfile = () => {
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "axm-lock.yaml"),
      "lockfileVersion: 6\nskills: {}\nmcpServers: {}\n",
    );
  };

  const writeSubagentExtension = (name: string) => {
    const root = path.join(tempDir, "subagents", name);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "subagent.json"),
      JSON.stringify({ owner: "@acme", type: "subagent", name, version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(root, "src", `${name}.md`),
      `---\nname: ${name}\ndescription: Test subagent\n---\n\n# Expected body\n`,
    );
  };

  const makeLayers = (opts?: { machine?: boolean; quiet?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const baseLayer = Layer.mergeAll(
      NodeServices.layer,
      FetchHttpClient.layer,
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
          recovery: {
            action: "none",
            targetCliVersion: "0.0.0-test",
            targetSkillVersion: null,
            nextAction: null,
            steps: [],
          },
        }),
      }),
      Layer.succeed(ExecutionDirectory, { path: decodeAbsolutePathSync(tempDir) }),
    );
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      projectRoot: decodeAbsolutePathSync(tempDir),
    };
    const wsLayer = Layer.provide(coreWorkspaceLayer({ ...wsOptions }), baseLayer);
    const workspaceFoundation = Layer.mergeAll(baseLayer, wsLayer);
    const workspaceCatalogLayer = Layer.provide(
      WorkspaceCatalogLive,
      Layer.merge(workspaceFoundation, CodingAgentRepositoryLive),
    );
    const sourceProvidersLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(workspaceFoundation, workspaceCatalogLayer),
    );
    const workspaceServiceLayer = Layer.mergeAll(
      workspaceFoundation,
      workspaceCatalogLayer,
      sourceProvidersLayer,
      CodingAgentRepositoryLive,
    );
    const mcpServersLayer = McpServerManagerLive;
    const hooksLayer = HookManagerLive;
    const rulesLayer = RuleManagerLive;
    const skillsLayer = SkillManagerLive;
    const subagentsLayer = SubagentManagerLive;
    const packsLayer = PackManagerLive;
    const coreExtensions = Layer.mergeAll(
      hooksLayer,
      KnowledgeManagerLive,
      mcpServersLayer,
      rulesLayer,
      skillsLayer,
      subagentsLayer,
    );
    const extensionsLayer = Layer.provideMerge(packsLayer, coreExtensions);
    const extensionWorkspaceLayer = Layer.provideMerge(extensionsLayer, workspaceServiceLayer);
    const invariantFactsLayer = Layer.provide(WorkspaceInvariantFactsLive, extensionWorkspaceLayer);
    const fullLayer = Layer.merge(extensionWorkspaceLayer, invariantFactsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(fullLayer));

    return { provide, rendererState: renderer.state };
  };

  const lint = (args: {
    readonly scope?: "project" | "user";
    readonly strict?: boolean;
    readonly details?: boolean;
    readonly fix?: boolean;
  }) =>
    handleLint({
      pathArg: Option.none(),
      scope: args.scope ?? "project",
      strict: args.strict ?? false,
      details: args.details ?? false,
      fix: args.fix ?? false,
      input: { view: "workspace" },
    });

  it.effect("resolveLintRoot returns cwd by default", () => {
    return Effect.sync(() => {
      const root = resolveLintRoot({
        pathArg: Option.none(),
        scope: "project",
        cwd: "/tmp/cwd-fixture",
        userHome: "/home/fixture",
      });
      expect(root).toBe("/tmp/cwd-fixture");
    });
  });

  it.effect("resolveLintRoot returns the resolved user home", () => {
    return Effect.sync(() => {
      const root = resolveLintRoot({
        pathArg: Option.none(),
        scope: "user",
        cwd: "/tmp/cwd-fixture",
        userHome: "/tmp/axm-user-home-test",
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
            path: `${sourceRoot}/axm.json:4:2`,
            ruleDescription: "Settings must satisfy the workspace schema.",
            finding: {
              kind: "advisory",
              ruleId: "workspace/settings-schema-valid",
              severity: "error",
              message: "Invalid settings",
              location: { file: `${sourceRoot}/axm.json`, line: 4, column: 2 },
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
    expect(summary.findings[0]?.path).toBe(`${displayRoot}/axm.json:4:2`);
    expect(summary.findings[0]?.finding.location?.file).toBe(`${displayRoot}/axm.json`);
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
    // WorkspaceMutations fixture: `axm.json` exists with unrecognized
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
    const settingsPath = path.join(tempDir, "axm.json");
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
        expect(logs.error.some((message) => message.includes("./axm-lock.yaml"))).toBe(true);
        expect(logs.error.some((message) => message.includes("./axm.json"))).toBe(true);
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
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: [broken\n");
    const installedDir = path.join(
      tempDir,
      "agent_extensions",
      "agentxm",
      "@acme",
      "skills",
      "demo",
    );
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
              "x-axm": {
                v: 1,
                managed: true,
                ext: "@workspace/mcps/demo",
                source: "inline",
              },
              type: "stdio",
              command: "python",
            },
            stale: {
              "x-axm": {
                v: 1,
                managed: true,
                ext: "@workspace/mcps/stale",
                source: "inline",
              },
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

  it.effect("reports managed subagent body drift without reconciling it", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      subagents: { researcher: "workspace" },
    });
    writeEmptyLockfile();
    writeSubagentExtension("researcher");
    const projectionPath = path.join(tempDir, ".claude", "agents", "researcher.md");
    fs.mkdirSync(path.dirname(projectionPath), { recursive: true });
    const drifted =
      "<!-- axm:file v=1 ext=@agentxm/subagents/managed-file src=subagents/researcher/src/researcher.md -->\n# Drifted body\n";
    fs.writeFileSync(projectionPath, drifted);

    return provide(
      Effect.gen(function* () {
        yield* lint({ details: true }).pipe(Effect.exit);
        const report = rendererState.logs.map(({ message }) => message).join("\n");
        expect(report).toContain("workspace/projections-current");
        expect(report).toContain("subagent:researcher");
        expect(fs.readFileSync(projectionPath, "utf8")).toBe(drifted);
      }),
    );
  });

  it.effect("refuses to replace an unowned instruction target on --fix", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    });
    writeEmptyLockfile();
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
    const privateNotes = "# Private Claude notes\n\nNOT IN GIT. Irreplaceable.\n";
    fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), privateNotes);

    return provide(
      Effect.gen(function* () {
        yield* lint({ details: true }).pipe(Effect.exit);
        const report = rendererState.logs.map(({ message }) => message).join("\n");
        expect(report).toContain("workspace/instructions-target-unowned");
        expect(report).not.toContain("workspace/instructions-target-current");
        expect(report).not.toContain("axm lint --fix");

        const exit = yield* lint({ fix: true }).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        expect(fs.lstatSync(path.join(tempDir, "CLAUDE.md")).isSymbolicLink()).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf8")).toBe(privateNotes);
      }),
    );
  });

  it.effect("removes stale AXM-owned instruction aliases on --fix", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    });
    writeEmptyLockfile();
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");
    fs.symlinkSync("AGENTS.md", path.join(tempDir, "CLAUDE.md"));
    // Left behind by an agent that is no longer configured.
    fs.symlinkSync("AGENTS.md", path.join(tempDir, "GEMINI.md"));

    return provide(
      Effect.gen(function* () {
        yield* lint({ details: true }).pipe(Effect.exit);
        const before = rendererState.logs.map(({ message }) => message).join("\n");
        expect(before).toContain("workspace/instructions-target-stale");
        expect(before).toContain("axm lint --fix");

        const exit = yield* lint({ fix: true }).pipe(Effect.exit);

        expect(Exit.isSuccess(exit)).toBe(true);
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);
        expect(fs.readlinkSync(path.join(tempDir, "CLAUDE.md"))).toBe("AGENTS.md");
        const after = rendererState.logs
          .slice(before.split("\n").length)
          .map(({ message }) => message)
          .join("\n");
        expect(after).not.toContain("workspace/instructions-target-stale");
      }),
    );
  });

  it.effect("reports an unsupported managed-region version without writing", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: [],
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    });
    writeEmptyLockfile();
    const instructionsPath = path.join(tempDir, "AGENTS.md");
    const before =
      "<!-- axm:start v=2 region=rules -->\ngenerated\n<!-- axm:end v=2 region=rules -->\n";
    fs.writeFileSync(instructionsPath, before);

    return provide(
      Effect.gen(function* () {
        yield* lint({ details: true }).pipe(Effect.exit);
        const report = rendererState.logs.map(({ message }) => message).join("\n");
        expect(report).toContain("workspace/projections-current");
        expect(report).toContain("upgrade AXM");
        expect(fs.readFileSync(instructionsPath, "utf8")).toBe(before);
      }),
    );
  });
});
