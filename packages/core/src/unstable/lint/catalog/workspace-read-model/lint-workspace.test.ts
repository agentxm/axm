import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  buildFixture,
  type FixtureSpec,
} from "../../../workspace/read-model/__fixtures__/builder.js";
import { buildPackRuleContexts } from "../pack-accessor/contexts.js";
import { buildSkillRuleContexts } from "../skill-accessor/contexts.js";
import { collectRenderedFindings, evaluateAllCatalogs } from "../../cli.js";
import { platformCanonicalLintConfig } from "../../config.js";
import { buildLintWorkspace } from "./lint-workspace.js";

const WORKSPACE_ROOT = "/workspace";
const USER_HOME = "/home/user";

const installedAt = "2026-01-01T00:00:00.000Z";

const baseManifest = {
  owner: "@acme",
  version: "not-semver",
  description: "Fixture extension",
};

const manifestFixtures = {
  skill: {
    ...baseManifest,
    type: "skill",
    name: "bad-skill",
    unexpectedSkillKey: true,
  },
  command: {
    ...baseManifest,
    type: "command",
    name: "bad-command",
    unexpectedCommandKey: true,
  },
  subagent: {
    ...baseManifest,
    type: "subagent",
    name: "bad-subagent",
    unexpectedSubagentKey: true,
  },
  mcpServer: {
    ...baseManifest,
    type: "mcp-server",
    name: "bad-mcp",
    server: {
      name: "io.github.acme/bad-mcp",
      description: "Bad MCP server",
      version: "1.0.0",
    },
    unexpectedMcpServerKey: true,
  },
  pack: {
    ...baseManifest,
    type: "pack",
    name: "bad-pack",
    dependencies: {},
    packs: {},
  },
};

const settings = {
  owner: "@acme",
  skills: { "bad-skill": "@acme/skills/bad-skill@1.0.0" },
  commands: { "bad-command": "@acme/commands/bad-command@1.0.0" },
  subagents: { "bad-subagent": "@acme/subagents/bad-subagent@1.0.0" },
  mcpServers: { "bad-mcp": "@acme/mcps/bad-mcp@1.0.0" },
  packs: { "bad-pack": "@acme/packs/bad-pack@1.0.0" },
};

const lockfile = {
  lockfileVersion: 3,
  skills: {
    "bad-skill": {
      type: "registry",
      owner: "@acme",
      name: "bad-skill",
      resolvedVersion: "1.0.0",
      integrity: "sha256-test",
      sourceName: "default",

      publisherBindingId: "hbnd_test",
      installedAt,
      updatedAt: installedAt,
      agents: [],
    },
  },
  mcpServers: {
    "bad-mcp": {
      type: "registry",
      owner: "@acme",
      name: "bad-mcp",
      resolvedVersion: "1.0.0",
      integrity: "sha256-test",
      sourceName: "default",

      publisherBindingId: "hbnd_test",
      installedAt,
      updatedAt: installedAt,
    },
  },
};

const fixture = (packJson: object | string): FixtureSpec => ({
  workspaceRoot: WORKSPACE_ROOT,
  userHome: USER_HOME,
  project: {
    settings: { _tag: "valid", contents: settings },
    lockfile: { _tag: "valid", contents: lockfile },
    axmExtensions: {
      "@acme/skills/bad-skill/src/SKILL.md": "---\ndescription: Bad skill\n---\n",
      "@acme/skills/bad-skill/skill.json": {
        _tag: "valid",
        contents: manifestFixtures.skill,
      },
      "@acme/commands/bad-command/command.json": {
        _tag: "valid",
        contents: manifestFixtures.command,
      },
      "@acme/subagents/bad-subagent/subagent.json": {
        _tag: "valid",
        contents: manifestFixtures.subagent,
      },
      "@acme/mcps/bad-mcp/mcp.json": {
        _tag: "valid",
        contents: manifestFixtures.mcpServer,
      },
      "@acme/packs/bad-pack/pack.json":
        typeof packJson === "string"
          ? { _tag: "byteCorrupt", bytes: packJson }
          : { _tag: "valid", contents: packJson },
    },
  },
  user: {
    settings: { _tag: "absent" },
  },
});

const expectRecord = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object");
  }
  return Object.fromEntries(Object.entries(value));
};

const buildAndEvaluate = (spec: FixtureSpec) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const lintWorkspace = yield* buildLintWorkspace({
      platform: { fs: deps.fs, path: deps.path },
      workspaceRoot: deps.workspaceRoot,
      userHome: deps.userHome,
      scope: "project",
    });
    const evaluations = yield* evaluateAllCatalogs({
      skillContexts: buildSkillRuleContexts(lintWorkspace.view),
      packContexts: buildPackRuleContexts(lintWorkspace.view),
      commandContexts: lintWorkspace.view.commandContexts,
      subagentContexts: lintWorkspace.view.subagentContexts,
      mcpServerContexts: lintWorkspace.view.mcpServerContexts,
      workspaceContext: lintWorkspace.rule,
      config: platformCanonicalLintConfig,
    });
    return {
      view: lintWorkspace.view,
      rendered: collectRenderedFindings(evaluations),
    };
  });

describe("buildLintWorkspace manifest JSON population", () => {
  it.effect("feeds raw installed manifest JSON into all per-extension catalogs", () =>
    Effect.gen(function* () {
      const { view, rendered } = yield* buildAndEvaluate(fixture(manifestFixtures.pack));
      const ruleIds = rendered.map((finding) => finding.finding.ruleId);

      expect(ruleIds).toContain("skill/manifest-schema-valid");
      expect(ruleIds).toContain("skill/manifest-keys-recognized");
      expect(ruleIds).toContain("command/manifest-schema-valid");
      expect(ruleIds).toContain("command/manifest-keys-recognized");
      expect(ruleIds).toContain("subagent/manifest-schema-valid");
      expect(ruleIds).toContain("subagent/manifest-keys-recognized");
      expect(ruleIds).toContain("mcp-server/manifest-schema-valid");
      expect(ruleIds).toContain("mcp-server/manifest-keys-recognized");
      expect(ruleIds).toContain("pack/manifest-schema-valid");
      expect(ruleIds).toContain("pack/manifest-keys-recognized");

      const packJson = expectRecord(view.installedPacks[0]?.packJson);
      expect(packJson["packs"]).toEqual({});
    }),
  );

  it.effect("reports malformed installed manifest JSON through schema-valid rules", () =>
    Effect.gen(function* () {
      const { rendered } = yield* buildAndEvaluate(fixture("{ nope"));
      const malformedPackFinding = rendered.find(
        (entry) => entry.finding.ruleId === "pack/manifest-schema-valid",
      );

      expect(malformedPackFinding?.finding.message).toContain("invalid JSON");
    }),
  );
});
