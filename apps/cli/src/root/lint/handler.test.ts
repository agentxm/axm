import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace/transitions/settlement/live";
/**
 * Integration tests for the `axm lint` handler.
 *
 * Exercises handler composition, human rendering, fail-closed boundaries,
 * and rule interactions that do not belong to accepted capability specs.
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

import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace/projection/live";
import {
  TestMachineRenderer,
  TestRenderer,
  type TestRendererState,
} from "../../test-support/presenter-test.js";
import { asciiGlyphs, paintText } from "../../screen/index.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { HookManagerLive } from "@agentxm/workspace/materialization/live";
import { ProjectionParticipantsLive } from "@agentxm/workspace/materialization/live";
import { KnowledgeManagerLive } from "@agentxm/workspace/materialization/live";
import { McpServerManagerLive } from "@agentxm/workspace/materialization/live";
import { PackManagerLive } from "@agentxm/workspace/materialization/live";
import { RuleManagerLive } from "@agentxm/workspace/materialization/live";
import { WorkspaceInvariantFactsLive } from "@agentxm/workspace/projection/live";
import { SkillManagerLive } from "@agentxm/workspace/materialization/live";

import { SourceHostProvidersLive } from "@agentxm/workspace/resolution/sources/live";
import {
  AxmSkillCandidateGateLive,
  RegistryResolutionPolicyLive,
} from "@agentxm/workspace/resolution/live";
import { WorkspaceCatalogLive } from "@agentxm/workspace/projection/live";
import { SubagentManagerLive } from "@agentxm/workspace/materialization/live";
import type { WorkspaceStateOptions } from "@agentxm/workspace/desired-state";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace/desired-state/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";

import { ExecutionDirectory } from "../../execution-directory.js";
import { handleLint } from "./handler.js";
import { remapLintSummaryPaths, resolveLintRoot } from "@agentxm/workspace/linting";
import { LifecycleFailureConversionLive } from "@agentxm/workspace/lifecycle";
import { AxmSkillCompatibilityPolicy } from "@agentxm/cli-maintenance/official-skill/application";

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
      "lockfileVersion: 8\nskills: {}\nmcpServers: {}\n",
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

  /** What one stream received, painted in plain ASCII at unbounded width. */
  const printed = (state: TestRendererState, channel: "stdout" | "stderr"): string =>
    state.docs
      .filter((entry) => entry.channel === channel)
      .flatMap((entry) =>
        paintText(entry.doc, { width: "unbounded", colors: false, glyphs: asciiGlyphs }),
      )
      .join("\n");

  const makeLayers = (opts?: { machine?: boolean; quiet?: boolean; verbose?: boolean }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const baseLayer = Layer.mergeAll(
      Layer.provideMerge(WorkspaceFileWriteLocksLive, NodeServices.layer),
      FetchHttpClient.layer,
      renderer.layer,
      TestFlagsLayer({
        nonInteractive: true,
        quiet: opts?.quiet ?? false,
        verbose: opts?.verbose ?? false,
      }),
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
    const wsOptions: WorkspaceStateOptions = {
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
      Layer.mergeAll(
        workspaceFoundation,
        workspaceCatalogLayer,
        AxmSkillCandidateGateLive,
        RegistryResolutionPolicyLive,
      ),
    );
    const workspaceServiceLayer = Layer.mergeAll(
      workspaceFoundation,
      workspaceCatalogLayer,
      sourceProvidersLayer,
      CodingAgentRepositoryLive,
      Layer.provide(NativeWriteAuthorityLive, baseLayer),
      LifecycleFailureConversionLive,
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
    const invariantFactsLayer = Layer.provide(
      Layer.provide(WorkspaceInvariantFactsLive, ProjectionParticipantsLive),
      extensionWorkspaceLayer,
    );
    const fullLayer = Layer.merge(extensionWorkspaceLayer, invariantFactsLayer);
    const provide = Effect.provide(fullLayer);

    return { provide, rendererState: renderer.state };
  };

  const lint = (args: {
    readonly scope?: "project" | "user";
    readonly strict?: boolean;
    readonly fix?: boolean;
  }) =>
    handleLint({
      selection: {
        workspaceRoot: tempDir,
        userHome: tempDir,
        scope: args.scope ?? "project",
        input: { view: "workspace" },
        fix: args.fix ?? false,
      },
      strict: args.strict ?? false,
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

  it.effect("informational findings preserve a clean exit without manual-attention wording", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({ agents: ["claude-code"] });
    // Also create an empty lockfile so workspace/lockfile-valid doesn't fire
    // (there are no declarations anyway, but the lockfile-missing arm only
    // fires when declarations exist).

    return provide(
      Effect.gen(function* () {
        const outcome = yield* lint({}).pipe(Effect.exit);
        expect(outcome._tag).toBe("Success");
        const stdout = printed(rendererState, "stdout");
        expect(stdout).toContain("workspace/axm-skill-declared");
        expect(stdout).toContain("1 info");
        expect(stdout).not.toContain("exit");
      }),
    );
  });

  it.effect("omits AXM skill compatibility from JSON when the skill is undeclared", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeSettings({ agents: ["claude-code"] });

    return provide(
      Effect.gen(function* () {
        const outcome = yield* lint({}).pipe(Effect.exit);
        expect(Exit.isSuccess(outcome)).toBe(true);
        const emitted = rendererState.results.at(-1);
        expect(emitted?.ok).toBe(true);
        expect(emitted?.data).toMatchObject({
          result: {
            findings: [
              expect.objectContaining({
                ruleId: "workspace/axm-skill-declared",
                severity: "info",
              }),
            ],
            summary: { exitCategory: "clean" },
          },
        });
        expect(emitted?.data).not.toHaveProperty("result.axmSkillCompatibility");
      }),
    );
  });

  it.effect("prints the findings ledger on stdout, errors first, with the exit code", () => {
    const { provide, rendererState } = makeLayers();
    writeSettings({
      agents: ["claude-code"],
      skills: { demo: "@acme/skills/demo@1.0.0" },
    });

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const stdout = printed(rendererState, "stdout");
        expect(printed(rendererState, "stderr")).toBe("");
        expect(stdout).toContain("Linting");
        expect(stdout).toMatch(/Finding\s+Location\s+Fix/);
        expect(stdout).toContain("workspace/lockfile-valid");
        // The skill's missing resolution is one fact; its absent agent
        // artifacts are not reported again.
        expect(stdout).not.toContain("workspace/skills-artifacts-correct");
        expect(stdout).toContain("./axm-lock.yaml");
        expect(stdout).toContain("./axm.json");
        expect(stdout).toContain("exit 1");
        // No finding here has a determined repair, so nothing points at --fix.
        expect(stdout).not.toContain("axm lint --fix");
        const marks = stdout
          .split("\n")
          .flatMap((line) =>
            line.startsWith(" xx ") || line.startsWith(" !! ") ? [line.slice(1, 3)] : [],
          );
        expect(marks.length).toBeGreaterThan(0);
        expect(marks.indexOf("!!") === -1 || marks.lastIndexOf("xx") < marks.indexOf("!!")).toBe(
          true,
        );
      }),
    );
  });

  it.effect("quiet mode prints only the verdict", () => {
    const { provide, rendererState } = makeLayers({ quiet: true });
    writeSettings({
      agents: ["claude-code"],
      skills: { demo: "@acme/skills/demo@1.0.0" },
    });

    return provide(
      Effect.gen(function* () {
        yield* lint({}).pipe(Effect.exit);
        const stdout = printed(rendererState, "stdout");
        expect(stdout.split("\n")).toHaveLength(1);
        expect(stdout).toContain("error");
        expect(stdout).toContain("exit 1");
        expect(printed(rendererState, "stderr")).toBe("");
      }),
    );
  });

  it.effect("names a determined repair, then reports it as fixed", () => {
    writeSettings({
      agents: ["claude-code"],
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    });
    writeEmptyLockfile();
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Instructions\n");

    return Effect.gen(function* () {
      const query = makeLayers();
      yield* query.provide(lint({})).pipe(Effect.exit);
      const before = printed(query.rendererState, "stdout");
      expect(before).toMatch(/instruction file is missing\s+\S*CLAUDE\.md\s+fixable/);
      expect(before).toContain("axm lint --fix");

      const fix = makeLayers();
      yield* fix.provide(lint({ fix: true })).pipe(Effect.exit);
      const after = printed(fix.rendererState, "stdout");
      expect(after).toContain("Fixing");
      expect(after).toMatch(
        /~ {3}The Claude Code instruction file is missing\s+\S*CLAUDE\.md\s+fixed/,
      );
      expect(after).toContain("Fixed 1 finding");
      // An informational finding is not one a person still has to act on.
      expect(after).not.toContain("still need you");
      expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(true);
    });
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

    return Effect.gen(function* () {
      const exit = yield* provide(lint({})).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    });
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
        const reportMessages = printed(rendererState, "stdout");
        expect(reportMessages).toContain("workspace/mcps-agent-drift");
        expect(reportMessages).toContain("workspace/mcps-agent-orphaned");

        const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
        expect(config.mcpServers.demo.command).toBe("python");
        expect(config.mcpServers.stale).toBeDefined();
      }),
    );
  });

  it.effect("ignores managed subagent body formatting", () => {
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
        yield* lint({}).pipe(Effect.exit);
        const report = printed(rendererState, "stdout");
        expect(report).not.toContain("workspace/projection-ownership-valid");
        expect(fs.readFileSync(projectionPath, "utf8")).toBe(drifted);
      }),
    );
  });

  it.effect("reports an unsupported managed-region version without writing", () => {
    const { provide, rendererState } = makeLayers({ verbose: true });
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
        yield* lint({}).pipe(Effect.exit);
        const report = printed(rendererState, "stdout");
        expect(report).toContain("workspace/projection-ownership-valid");
        expect(report).toContain("upgrade AXM");
        expect(fs.readFileSync(instructionsPath, "utf8")).toBe(before);
      }),
    );
  });
});
