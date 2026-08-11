import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
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
import {
  computePackageContentHashSync,
  writeKnowledgeExtension,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
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

const writeSkillExtension = (baseDir: string, name: string) => {
  const skillDir = path.join(baseDir, ".axm", "extensions", "@acme", "skills", name);
  writeJson(path.join(skillDir, "skill.json"), {
    owner: "@acme",
    type: "skill",
    name,
    version: "1.0.0",
  });
  fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n# ${name}\n`,
  );
};

const writeLocalKnowledgePackage = (root: string, name: string, marker: string) => {
  writeJson(path.join(root, "knowledge.json"), {
    owner: "@acme",
    type: "knowledge",
    name,
    version: "1.0.0",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "index.md"),
    `---\nokf_version: "0.2"\n---\n# ${marker}\n`,
  );
  fs.writeFileSync(path.join(root, "src", "concept.md"), `---\ntype: concept\n---\n# ${marker}\n`);
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
      const { provide, logs, rendererState } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });

      yield* provide(handleSync({ preview: false }));

      expect(logs.success).toEqual(["Workspace materialization is up to date"]);
      expect(rendererState.spinnerMessages).toEqual([
        "Resolving workspace sync",
        "Resolved workspace sync",
      ]);
    }),
  );

  it.effect("emits JSON no-op when workspace materialization is already up to date", () =>
    Effect.gen(function* () {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
      });

      yield* provide(handleSync({ preview: false }));

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

      yield* provide(handleSync({ preview: false }));

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

      yield* provide(handleSync({ preview: true }));

      expect(fs.existsSync(path.join(axmDir, "trust.json"))).toBe(false);
    }),
  );

  it.effect("writes a missing lockfile even when there is nothing to materialize", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, { agents: [] });
      fs.rmSync(path.join(axmDir, "axm-lock.yaml"), { force: true });

      yield* provide(handleSync({ preview: false }));

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
      yield* provide(withDegradedLockfileReads(handleSync({ preview: false })));

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

      yield* provide(withDegradedLockfileReads(handleSync({ preview: true })));

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

      yield* provide(handleSync({ preview: false }));

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

      const error = yield* provide(handleSync({ preview: false })).pipe(Effect.flip);

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

      yield* provide(handleSync({ preview: false }));

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

      yield* provide(handleSync({ preview: true }));

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
      yield* provide(handleSync({ preview: false }));

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

  it.effect("refuses to overwrite drifted inline MCP agent configs", () =>
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

      yield* provide(handleSync({ preview: false }));

      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          outcome: "failed",
          reason: "hard-blocked",
          steps: [
            expect.objectContaining({
              message: expect.stringContaining("axm mcps repair demo --preview"),
            }),
          ],
        },
      });
      expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toContain('"python"');
    }),
  );

  it.effect("blocks every phase when instruction preflight finds an unowned target", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
      });
      writeSkillExtension(tempDir, "release");
      writeSettings(tempDir, {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
        rulesConfig: {
          instructions: { fileName: "AGENTS.md", gitignoreAliases: true },
        },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Desired\n");
      fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Human-owned\n");

      yield* provide(handleSync({ preview: false }));

      const payload = expectRecord(rendererState.results[0]?.data);
      const result = expectRecord(property(payload, "result"));
      expect(result).toMatchObject({ outcome: "failed", reason: "hard-blocked" });
      expect(planResultSteps(result)).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("Instruction reconciliation would overwrite"),
        }),
      );
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "release"))).toBe(false);
      expect(fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf8")).toBe("# Human-owned\n");
    }),
  );

  it.effect("blocks cleanup and instructions after an earlier runtime failure", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
      });
      writeSkillExtension(tempDir, "release");
      writeSettings(tempDir, {
        agents: ["claude-code"],
        skills: { release: "workspace:@acme/skills/release" },
        rulesConfig: {
          instructions: { fileName: "AGENTS.md", gitignoreAliases: true },
        },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Desired\n");
      writeRenderedSubagent(tempDir, ".claude", "stale", true);

      yield* provide(
        handleSync(
          { preview: false },
          {
            beforeMaterialization: () =>
              Effect.fail(
                makeAppError({ code: "internal", detail: "Injected materialization failure" }),
              ),
          },
        ),
      );

      const payload = expectRecord(rendererState.results[0]?.data);
      const result = expectRecord(property(payload, "result"));
      expect(property(result, "outcome")).toBe("failed");
      expect(property(result, "failedCount")).toBe(1);
      expect(property(result, "blockedCount")).toBe(0);
      expect(property(result, "unappliedCount")).toBe(2);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "release"))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "stale.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(false);
    }),
  );

  it.effect("resolves the same cleanup and instruction targets for preview and apply", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"] });
      writeSettings(tempDir, {
        agents: ["claude-code"],
        rulesConfig: {
          instructions: { fileName: "AGENTS.md", gitignoreAliases: true },
        },
      });
      fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Desired\n");
      writeRenderedSubagent(tempDir, ".claude", "stale", true);

      yield* provide(handleSync({ preview: true }));
      yield* provide(handleSync({ preview: false }));

      const preview = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 2,
      });
      const applied = expectAppliedPlanResult(rendererState.results[1]?.data, {
        planName: "Sync workspace",
        totalSteps: 2,
      });
      const projection = (step: unknown) => {
        const record = expectRecord(step);
        return {
          label: property(record, "label"),
          artifact: property(record, "artifact"),
        };
      };
      expect(planResultSteps(preview).map(projection)).toEqual(
        planResultSteps(applied).map(projection),
      );

      yield* provide(handleSync({ preview: false }));
      expectNoOpPlanResult(rendererState.results[2]?.data, {
        planName: "Sync workspace",
        message: "Workspace materialization is up to date",
      });
    }),
  );

  it.effect("refuses an unattended source-authority change from stale lock state", () =>
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

      const error = yield* provide(handleSync({ preview: false })).pipe(Effect.flip);

      expect(error.detail).toContain("Source authority would change");
      expect(rendererState.results).toEqual([]);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review", "SKILL.md"))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "review", "SKILL.md"))).toBe(
        false,
      );
    }),
  );

  it.effect("reuses a trusted registry canonical when only agent projections are stale", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "review");
      writeSkillExtension(tempDir, "review");
      const sourceHash = computePackageContentHashSync(skillDir);
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: {
          review: "@acme/skills/review@1.0.0",
        },
        sources: [
          {
            name: "default",
            type: "registry",
            location: "file:///tmp/registry-version-does-not-exist",
          },
        ],
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@acme",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            sourceHash,
          },
        },
        writeTrustFromLockfile: true,
      });

      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review"))).toBe(false);

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "review"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review"))).toBe(true);
      expect(fs.existsSync(path.join(skillDir, "src", "SKILL.md"))).toBe(true);
    }),
  );

  it.effect("names the extension when materialization preflight cannot resolve its source", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: {
          review: "./missing-review-skill",
        },
      });

      const error = yield* provide(handleSync({ preview: false })).pipe(Effect.flip);

      expect(error.detail).toContain("skill review");
      expect(error.detail).toContain("canonical status");
      expect(rendererState.results).toEqual([]);
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

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "solo", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "solo"))).toBe(false);
    }),
  );

  it.effect("syncs only the requested extension FQN", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: {
          review: "workspace:@acme/skills/review",
          release: "workspace:@acme/skills/release",
        },
      });
      writeSkillExtension(tempDir, "review");
      writeSkillExtension(tempDir, "release");

      yield* provide(
        handleSync({
          target: Option.some("@acme/skills/release"),
          preview: false,
        }),
      );

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync @acme/skills/release",
        totalSteps: 1,
      });
      const steps = planResultSteps(result);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        status: "applied",
      });
      expect(property(expectRecord(steps[0]), "label")).toContain(
        "previous source=none; proposed source=workspace:@acme/skills/release",
      );
      expect(property(expectRecord(steps[0]), "label")).toContain(
        "previous version=none; proposed version=1.0.0",
      );
      expect(property(expectRecord(steps[0]), "label")).toContain("downgrade=no");
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "release", "SKILL.md"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review"))).toBe(false);
    }),
  );

  it.effect("syncs only extensions of the requested type", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        skills: {
          review: "workspace:@acme/skills/review",
        },
        subagents: {
          release: "workspace:@acme/subagents/release",
        },
      });
      writeSkillExtension(tempDir, "review");
      writeSubagentExtension(tempDir, "release");

      yield* provide(
        handleSync({
          type: Option.some("skill"),
          preview: false,
        }),
      );

      expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "review", "SKILL.md"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "release.md"))).toBe(false);
    }),
  );

  it.effect("materializes settings-owned knowledge bundles", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeKnowledgeExtension(axmDir, "handbook");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        knowledge: {
          handbook: "workspace:@acme/knowledge/handbook",
        },
        lockfileKnowledge: {
          handbook: {
            type: "workspace",
            owner: "@acme",
            extensionType: "knowledge",
            name: "handbook",
            version: "1.0.0",
            sourceHash: computePackageContentHashSync(
              path.join(axmDir, "extensions", "@acme", "knowledge", "handbook"),
            ),
            installedAt: "2026-08-04T00:00:00.000Z",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
        },
      });
      writeSettings(tempDir, {
        agents: [],
        knowledge: {
          handbook: "workspace:@acme/knowledge/handbook",
        },
        rulesConfig: {
          instructions: { fileName: "AGENTS.md", gitignoreAliases: true },
        },
      });

      yield* provide(handleSync({ preview: false }));

      const index = path.join(tempDir, "AGENTS.md");
      expect(fs.existsSync(index)).toBe(true);
      const instructions = fs.readFileSync(index, "utf-8");
      expect(instructions).toContain("### @acme");
      expect(instructions).toContain(
        "[handbook](.axm/extensions/@acme/knowledge/handbook/src/index.md)",
      );
      expect(
        fs.existsSync(
          path.join(axmDir, "extensions", "@acme", "knowledge", "handbook", "src", "index.md"),
        ),
      ).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".agents", "knowledge"))).toBe(false);
    }),
  );

  it.effect("restores Knowledge from locked state without resolving the configured source", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      writeLocalKnowledgePackage(path.join(tempDir, "locked-source"), "handbook", "Locked");
      writeLocalKnowledgePackage(path.join(tempDir, "newer-source"), "handbook", "Newer");
      writeWorkspaceFiles(axmDir, {
        agents: [],
        knowledge: {
          handbook: { source: "./newer-source", enabled: true },
        },
        lockfileKnowledge: {
          handbook: {
            type: "local",
            path: "locked-source",
            installedAt: "2026-08-04T00:00:00.000Z",
            updatedAt: "2026-08-04T00:00:00.000Z",
          },
        },
        writeTrustFromLockfile: true,
      });
      const settingsBefore = fs.readFileSync(path.join(axmDir, "settings.json"), "utf8");
      const lockfileBefore = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8");

      yield* provide(handleSync({ preview: false }));

      expect(
        fs.readFileSync(
          path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "knowledge",
            "handbook",
            "src",
            "concept.md",
          ),
          "utf8",
        ),
      ).toContain("# Locked");
      expect(
        fs.readFileSync(
          path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "knowledge",
            "handbook",
            "src",
            "concept.md",
          ),
          "utf8",
        ),
      ).not.toContain("# Newer");
      expect(fs.readFileSync(path.join(axmDir, "settings.json"), "utf8")).toBe(settingsBefore);
      expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(lockfileBefore);
    }),
  );

  it.effect("includes instruction reconciliation in non-git previews without gitignore work", () =>
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

      yield* provide(handleSync({ preview: true }));

      const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Sync workspace",
        totalSteps: 1,
      });
      expect(planResultSteps(result)).toMatchObject([
        { label: "instruction files", status: "ready" },
      ]);
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

      yield* provide(handleSync({ preview: false }));

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

      yield* provide(handleSync({ preview: false }));

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

      yield* provide(handleSync({ preview: false }));

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

      yield* provide(handleSync({ preview: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "manual.md"))).toBe(true);
    }),
  );
});
