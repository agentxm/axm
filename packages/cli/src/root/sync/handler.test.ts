import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { CommandManagerLive } from "@agentxm/client-core/unstable/commands";
import { FilesManagerLive } from "@agentxm/client-core/unstable/files";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcps";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import {
  AXM_MANAGED_MARKER,
  withDegradedLockfileReads,
} from "@agentxm/client-core/unstable/workspace";
import YAML from "yaml";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
  property,
} from "../../test-helpers.js";
import { writeKnowledgeExtension, writeWorkspaceFiles } from "../../test-stubs.js";
import { handleSync } from "./handler.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const writeSettings = (baseDir: string, value: unknown) => {
  writeJson(path.join(baseDir, ".axm", "settings.json"), value);
};

const writeSubagentExtension = (baseDir: string, name: string) => {
  const subagentDir = path.join(baseDir, ".axm", "extensions", "@acme", "subagents", name);
  writeJson(path.join(subagentDir, "subagent.json"), {
    owner: "@acme",
    type: "subagent",
    name,
    version: "1.0.0",
  });
  fs.mkdirSync(path.join(subagentDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(subagentDir, "src", `${name}.md`),
    `---\nname: ${name}\ndescription: Test subagent\n---\n\n# ${name}\n`,
  );
};

const writeCommandExtension = (baseDir: string, name: string) => {
  const commandDir = path.join(baseDir, ".axm", "extensions", "@acme", "commands", name);
  writeJson(path.join(commandDir, "command.json"), {
    owner: "@acme",
    type: "command",
    name,
    version: "1.0.0",
  });
  fs.mkdirSync(path.join(commandDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(commandDir, "src", `${name}.md`),
    `---\nname: ${name}\ndescription: Test command\n---\n\n# ${name}\n`,
  );
};

const writeMcpServerExtension = (baseDir: string, name: string) => {
  const mcpServerDir = path.join(baseDir, ".axm", "extensions", "@acme", "mcps", name);
  writeJson(path.join(mcpServerDir, "mcp.json"), {
    owner: "@acme",
    type: "mcp-server",
    name,
    version: "1.0.0",
    server: {
      name: `io.github.acme/${name}`,
      description: "Test MCP server",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: `@acme/${name}-mcp`,
          version: "1.0.0",
          transport: { type: "stdio" },
        },
      ],
    },
  });
};

const writeRenderedSubagent = (
  baseDir: string,
  agentDir: string,
  name: string,
  managed: boolean,
) => {
  const filePath = path.join(baseDir, agentDir, "agents", `${name}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    managed ? `<!-- ${AXM_MANAGED_MARKER} -->\n# ${name}\n` : `# ${name}\n`,
  );
};

describe("root sync handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-sync-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    const sourceProvidersLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.merge(ctx.baseLayer, ctx.wsLayer),
    );
    const managerDependencies = Layer.mergeAll(
      ctx.baseLayer,
      ctx.wsLayer,
      sourceProvidersLayer,
      CodingAgentRepositoryLive,
    );
    const managersLayer = Layer.provide(
      Layer.mergeAll(
        CommandManagerLive,
        FilesManagerLive,
        HookManagerLive,
        KnowledgeManagerLive,
        McpServerManagerLive,
        RuleManagerLive,
        SkillManagerLive,
        SubagentManagerLive,
      ),
      managerDependencies,
    );
    const packManagerLayer = Layer.provide(
      PackManagerLive,
      Layer.mergeAll(managerDependencies, managersLayer),
    );
    return {
      provide: makeEffectProvide(
        Layer.mergeAll(
          ctx.baseLayer,
          ctx.wsLayer,
          sourceProvidersLayer,
          CodingAgentRepositoryLive,
          managersLayer,
          packManagerLayer,
        ),
      ),
      logs: ctx.logs,
      rendererState: ctx.rendererState,
    };
  };

  it.effect("reports no-op when workspace materialization is already up to date", () =>
    Effect.gen(function* () {
      const { provide, logs } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(logs.success).toEqual(["Workspace materialization is up to date"]);
    }),
  );

  it.effect("emits JSON no-op when workspace materialization is already up to date", () =>
    Effect.gen(function* () {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(logs.success).toEqual([]);
      expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });
    }),
  );

  it.effect("migrates a valid legacy receipt into the dedicated trust baseline", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@acme",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      yield* provide(handleSync({ dryRun: false, force: false }));

      const trust = JSON.parse(fs.readFileSync(path.join(axmDir, "trust.json"), "utf8"));
      expect(trust.records["skill:review"]).toMatchObject({
        extensionType: "skill",
        authority: "registry",
        sourceIdentity: "@acme/skills/review",
        publisherBindingId: "hbnd_test",
      });
    }),
  );

  it.effect("keeps legacy trust migration preview read-only", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@acme",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });

      yield* provide(handleSync({ dryRun: true, force: false }));

      expect(fs.existsSync(path.join(axmDir, "trust.json"))).toBe(false);
    }),
  );

  it.effect("writes a missing lockfile even when there is nothing to materialize", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, { agents: [] });
      fs.rmSync(path.join(axmDir, "axm-lock.yaml"), { force: true });

      yield* provide(handleSync({ dryRun: false, force: false }));

      const written = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
      expect(written.lockfileVersion).toBe(3);
    }),
  );

  it.effect("backs up and regenerates an unreadable lockfile", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, { agents: [] });
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 3\nskills: []\n");

      // Mirrors the CLI's `withWorkspace` boundary.
      yield* provide(withDegradedLockfileReads(handleSync({ dryRun: false, force: false })));

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 2,
        warningCount: 2,
      });
      expect(result).toMatchObject({
        steps: [
          { label: "Recover lockfile (invalid)", status: "applied" },
          { label: "Reconcile lockfile (invalid)", status: "applied" },
        ],
      });

      const written = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"));
      expect(written.lockfileVersion).toBe(3);
    }),
  );

  it.effect("does not fail a dry run against an unreadable lockfile", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, { agents: [] });
      const corrupt = "lockfileVersion: 3\nskills: []\n";
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), corrupt);

      yield* provide(withDegradedLockfileReads(handleSync({ dryRun: true, force: false })));

      // A dry run reports the recovery it would perform without performing it.
      expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(corrupt);
    }),
  );

  it.effect("prunes stale managed MCP entries when no servers remain declared", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
      });
      writeJson(path.join(tempDir, ".mcp.json"), {
        mcpServers: {
          demo: {
            "x-axm": { managed: true, source: "inline" },
            command: "node",
            args: ["server.js"],
          },
        },
      });

      yield* provide(handleSync({ dryRun: false, force: false }));

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
      });
      const steps = planResultSteps(result);
      expect(steps).toMatchObject([
        {
          label: "mcp-server stale managed entries",
          status: "applied",
          message: "Pruned stale managed MCP server entries",
        },
      ]);
      const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
      expect(config.mcpServers).toEqual({});
    }),
  );

  it.effect("does not prune managed artifacts when configured pack state is incomplete", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        packs: {
          missing: "@acme/packs/missing",
        },
      });
      const configPath = path.join(tempDir, ".mcp.json");
      writeJson(configPath, {
        mcpServers: {
          retained: {
            "x-axm": { managed: true, source: "@acme/mcps/retained" },
            type: "stdio",
            command: "node",
          },
        },
      });

      const error = yield* provide(handleSync({ dryRun: false, force: false })).pipe(Effect.flip);

      expect(error.detail).toContain("incomplete desired extension graph");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(config.mcpServers.retained.command).toBe("node");
    }),
  );

  it.effect("prunes disabled managed MCP server configs without re-materializing them", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code", "cursor", "codex"],
        mcps: {
          browser: "workspace:@acme/mcps/browser",
        },
      });
      writeMcpServerExtension(tempDir, "browser");

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toContain('"browser"');
      expect(fs.readFileSync(path.join(tempDir, ".cursor", "mcp.json"), "utf8")).toContain(
        '"browser"',
      );
      expect(fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8")).toContain(
        "browser",
      );

      rendererState.results.length = 0;
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code", "cursor", "codex"],
        mcps: {
          browser: {
            source: "workspace:@acme/mcps/browser",
            enabled: false,
          },
        },
      });

      yield* provide(handleSync({ dryRun: true, force: false }));

      const preview = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
      });
      const previewSteps = planResultSteps(preview);
      expect(previewSteps).toMatchObject([
        {
          label: "mcp-server stale managed entries",
          status: "ready",
        },
      ]);
      expect(JSON.stringify(previewSteps)).not.toContain("browser");

      rendererState.results.length = 0;
      yield* provide(handleSync({ dryRun: false, force: false }));

      const applied = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
      });
      expect(planResultSteps(applied)).toMatchObject([
        {
          label: "mcp-server stale managed entries",
          status: "applied",
        },
      ]);

      const claudeConfig = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
      const cursorConfig = JSON.parse(
        fs.readFileSync(path.join(tempDir, ".cursor", "mcp.json"), "utf8"),
      );
      const codexConfig = fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8");
      expect(claudeConfig.mcpServers).toEqual({});
      expect(cursorConfig.mcpServers).toEqual({});
      expect(codexConfig).not.toContain("browser");
    }),
  );

  it.effect("refuses to overwrite drifted inline MCP agent configs without force", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"));
      writeSettings(tempDir, {
        agents: ["claude-code"],
        mcpServers: {
          demo: {
            enabled: true,
            command: "node",
            args: ["server.js"],
            env: {},
          },
        },
      });
      writeJson(path.join(tempDir, ".mcp.json"), {
        mcpServers: {
          demo: {
            "x-axm": { managed: true, source: "inline" },
            type: "stdio",
            command: "python",
          },
        },
      });

      yield* provide(handleSync({ dryRun: false, force: false }));

      const payload = expectRecord(rendererState.results[0]?.data);
      const result = expectRecord(property(payload, "result"));
      expect(property(result, "failedCount")).toBe(1);
      expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toContain('"python"');
    }),
  );

  it.effect("overwrites drifted inline MCP agent configs with force", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"));
      writeSettings(tempDir, {
        agents: ["claude-code"],
        mcpServers: {
          demo: {
            enabled: true,
            command: "node",
            args: ["server.js"],
            env: {},
          },
        },
      });
      writeJson(path.join(tempDir, ".mcp.json"), {
        mcpServers: {
          demo: {
            "x-axm": { managed: true, source: "inline" },
            type: "stdio",
            command: "python",
          },
        },
      });

      yield* provide(handleSync({ dryRun: false, force: true }));

      const payload = expectRecord(rendererState.results[0]?.data);
      const result = expectRecord(property(payload, "result"));
      expect(property(result, "failedCount")).toBe(0);
      const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
      expect(config.mcpServers.demo.command).toBe("node");
    }),
  );

  it.effect("renders settings-owned on-disk extensions while ignoring stale lockfile sources", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "review");

      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: {
          review: "workspace:@acme/skills/review",
        },
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@legacy",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "local",
            publisherBindingId: "hbnd_test",
            installedAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        },
      });
      writeJson(path.join(skillDir, "skill.json"), {
        owner: "@acme",
        type: "skill",
        name: "review",
        version: "1.0.0",
      });
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );

      yield* provide(handleSync({ dryRun: false, force: false }));

      const renderedSkill = path.join(tempDir, ".claude", "skills", "review", "SKILL.md");
      const universalSkill = path.join(tempDir, ".agents", "skills", "review", "SKILL.md");
      expect(fs.existsSync(renderedSkill)).toBe(true);
      expect(fs.readFileSync(renderedSkill, "utf-8")).toContain("# Review");
      expect(fs.existsSync(universalSkill)).toBe(true);
      expect(fs.readFileSync(universalSkill, "utf-8")).toContain("# Review");

      rendererState.results.length = 0;
      yield* provide(handleSync({ dryRun: false, force: false }));
      expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });
    }),
  );

  it.effect("renders skills to the universal target with no configured agents", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "solo");

      writeWorkspaceFiles(axmDir, {
        agents: [],
        skills: {
          solo: "workspace:@acme/skills/solo",
        },
      });
      writeJson(path.join(skillDir, "skill.json"), {
        owner: "@acme",
        type: "skill",
        name: "solo",
        version: "1.0.0",
      });
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(skillDir, "src", "SKILL.md"), "# Solo\n");

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "solo", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "solo"))).toBe(false);
    }),
  );

  it.effect("renders settings-owned command extensions", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        commands: {
          review: "workspace:@acme/commands/review",
        },
      });
      writeCommandExtension(tempDir, "review");

      yield* provide(handleSync({ dryRun: false, force: false }));

      const renderedCommand = path.join(tempDir, ".claude", "commands", "review.md");
      expect(fs.existsSync(renderedCommand)).toBe(true);
      expect(fs.readFileSync(renderedCommand, "utf-8")).toContain("# review");
    }),
  );

  it.effect("materializes settings-owned knowledge bundles", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        knowledge: {
          handbook: "workspace:@acme/knowledge/handbook",
        },
      });
      writeKnowledgeExtension(axmDir, "handbook");

      yield* provide(handleSync({ dryRun: false, force: false }));

      const index = path.join(axmDir, "knowledge", "index.md");
      expect(fs.existsSync(index)).toBe(true);
      expect(fs.readFileSync(index, "utf-8")).toContain("[handbook]");
    }),
  );

  it.effect("renders settings-owned Context Files packages", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
        files: {
          "context-kit": "./extensions/context-kit",
        },
      });
      const fileDir = path.join(tempDir, "extensions", "context-kit");
      writeJson(path.join(fileDir, "files.json"), {
        owner: "@acme",
        type: "files",
        name: "context-kit",
        version: "1.0.0",
        contents: [
          {
            source: { kind: "static", path: "context.md" },
            target: "files/context.md",
            mode: "sync-always",
          },
        ],
      });
      fs.mkdirSync(path.join(fileDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(fileDir, "src", "context.md"), "# Context\n");

      yield* provide(handleSync({ dryRun: false, force: false }));

      const renderedFile = path.join(tempDir, "files", "context.md");
      expect(fs.existsSync(renderedFile)).toBe(true);
      expect(fs.readFileSync(renderedFile, "utf-8")).toContain("# Context");
    }),
  );

  it.effect(
    "renders workspace-owned generator regions when no extensions need materialization",
    () =>
      Effect.gen(function* () {
        const { provide } = makeLayers();
        writeWorkspaceFiles(path.join(tempDir, ".axm"), {
          agents: [],
        });
        fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "");
        const readmePath = path.join(tempDir, "README.md");
        fs.writeFileSync(
          readmePath,
          [
            "# Project",
            "<!-- axm:start region=files generator=file-index -->",
            "old",
            "<!-- axm:end region=files generator=file-index -->",
            "",
          ].join("\n"),
        );

        yield* provide(handleSync({ dryRun: false, force: false }));

        const readme = fs.readFileSync(readmePath, "utf-8");
        expect(readme).toContain("- README.md");
        expect(readme).toContain("- src/index.ts");
      }),
  );

  it.effect("emits JSON plan output for workspace-owned generator regions", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "");
      fs.writeFileSync(
        path.join(tempDir, "README.md"),
        [
          "# Project",
          "<!-- axm:start region=files generator=file-index -->",
          "old",
          "<!-- axm:end region=files generator=file-index -->",
          "",
        ].join("\n"),
      );

      yield* provide(handleSync({ dryRun: false, force: false }));

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
      });
      expect(result).toMatchObject({
        steps: [
          {
            label: "workspace generator regions",
            status: "applied",
            artifact: {
              scope: "project",
              change: "updated",
              fileCount: 1,
            },
          },
        ],
      });
    }),
  );

  it.effect("reports workspace generator dry-runs without writing files", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });
      const readmePath = path.join(tempDir, "README.md");
      const original = [
        "# Project",
        "<!-- axm:start region=files generator=file-index -->",
        "old",
        "<!-- axm:end region=files generator=file-index -->",
        "",
      ].join("\n");
      fs.writeFileSync(readmePath, original);

      yield* provide(handleSync({ dryRun: true, force: false }));

      expect(fs.readFileSync(readmePath, "utf-8")).toBe(original);
    }),
  );

  it.effect("emits JSON preview for workspace generator dry-runs", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });
      const readmePath = path.join(tempDir, "README.md");
      const original = [
        "# Project",
        "<!-- axm:start region=files generator=file-index -->",
        "old",
        "<!-- axm:end region=files generator=file-index -->",
        "",
      ].join("\n");
      fs.writeFileSync(readmePath, original);

      yield* provide(handleSync({ dryRun: true, force: false }));

      expect(fs.readFileSync(readmePath, "utf-8")).toBe(original);
      const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
      });
      expect(planResultSteps(result)).toEqual([
        expect.objectContaining({ label: "workspace generator regions", status: "ready" }),
      ]);
    }),
  );

  it.effect("omits instruction gitignore work from non-git dry-runs", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeSettings(tempDir, {
        agents: ["claude-code"],
        rulesConfig: {
          instructions: {
            fileName: "AGENTS.md",
            gitignoreAliases: true,
          },
        },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Workspace\n");

      yield* provide(handleSync({ dryRun: true, force: false }));

      expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });
      const rendered = rendererState.logs.map((entry) => entry.message).join("\n");
      expect(rendered).not.toContain("instruction gitignore entries");
      expect(fs.existsSync(path.join(tempDir, ".gitignore"))).toBe(false);
    }),
  );

  it.effect("removes managed subagent files for agents removed from settings", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        subagents: {
          review: "workspace:@acme/subagents/review",
        },
      });
      writeSubagentExtension(tempDir, "review");
      writeRenderedSubagent(tempDir, ".cursor", "review", true);

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(fs.existsSync(path.join(tempDir, ".cursor", "agents", "review.md"))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "review.md"))).toBe(true);
    }),
  );

  it.effect("removes managed subagent files when the settings entry is disabled", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        subagents: {
          review: {
            source: "workspace:@acme/subagents/review",
            enabled: false,
          },
        },
      });
      writeSubagentExtension(tempDir, "review");
      writeRenderedSubagent(tempDir, ".claude", "review", true);

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "review.md"))).toBe(false);
    }),
  );

  it.effect("removes managed subagent files for on-disk extensions absent from settings", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
      });
      writeSubagentExtension(tempDir, "orphan");
      writeRenderedSubagent(tempDir, ".claude", "orphan", true);

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "orphan.md"))).toBe(false);
    }),
  );

  it.effect("leaves unmanaged subagent files untouched during cleanup", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
      });
      writeRenderedSubagent(tempDir, ".claude", "manual", false);

      yield* provide(handleSync({ dryRun: false, force: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "manual.md"))).toBe(true);
    }),
  );
});
