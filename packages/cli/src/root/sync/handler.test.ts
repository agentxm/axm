import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { CommandManagerLive } from "@agentxm/client-core/unstable/commands";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcp-servers";
import { ExtensionPackManagerLive } from "@agentxm/client-core/unstable/packs";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { AXM_MANAGED_MARKER } from "@agentxm/client-core/unstable/workspace";
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleSync } from "./handler.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
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

  const makeLayers = () => {
    const ctx = makeWorkspaceHandlerTestContext();
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
        McpServerManagerLive,
        SkillManagerLive,
        SubagentManagerLive,
      ),
      managerDependencies,
    );
    const packManagerLayer = Layer.provide(
      ExtensionPackManagerLive,
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
    };
  };

  it.effect("renders settings-owned on-disk extensions while ignoring stale lockfile sources", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "review");

      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        skills: {
          review: "@acme/skills/review",
        },
        lockfileSkills: {
          review: {
            type: "registry",
            owner: "@legacy",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "local",
            agents: ["claude-code"],
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

      yield* provide(handleSync({ dryRun: false }));

      const renderedSkill = path.join(tempDir, ".claude", "skills", "review", "SKILL.md");
      expect(fs.existsSync(renderedSkill)).toBe(true);
      expect(fs.readFileSync(renderedSkill, "utf-8")).toContain("# Review");
    }),
  );

  it.effect("removes managed subagent files for agents removed from settings", () =>
    Effect.gen(function* () {
      const { provide } = makeLayers();
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        subagents: {
          review: "@acme/subagents/review",
        },
      });
      writeSubagentExtension(tempDir, "review");
      writeRenderedSubagent(tempDir, ".cursor", "review", true);

      yield* provide(handleSync({ dryRun: false }));

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
            source: "@acme/subagents/review",
            enabled: false,
          },
        },
      });
      writeSubagentExtension(tempDir, "review");
      writeRenderedSubagent(tempDir, ".claude", "review", true);

      yield* provide(handleSync({ dryRun: false }));

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

      yield* provide(handleSync({ dryRun: false }));

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

      yield* provide(handleSync({ dryRun: false }));

      expect(fs.existsSync(path.join(tempDir, ".claude", "agents", "manual.md"))).toBe(true);
    }),
  );
});
