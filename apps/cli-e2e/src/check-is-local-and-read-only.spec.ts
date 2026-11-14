import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { snapshotProtectedState } from "@agentxm/test-support";
import { startHttpRegistry } from "@agentxm/client-e2e-utils/http-registry";
import { createTempDir, runCli } from "./e2e/utils.js";

export const specification = defineSpecification({
  requirement: "cli/check/is-local-and-read-only",
  title: "Local checks observe selected state without acquisition, repair or runtime execution",
  statement:
    "When a local check assesses explicit subjects or all local subjects, AXM shall preserve domain state, perform no Registry assessment or credential refresh, acquire no missing content and execute no extension runtime, while reporting unresolved or incomplete selected evidence without a passing verdict.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Separate CLI processes observe a native workspace while an independent HTTP Registry records requests, protected-state snapshots detect domain writes, and an executable MCP fixture would leave a marker if run.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/commands/overview.md"],
  supersedes: [],
  assumptions: [
    "Startup update checks and telemetry are disabled in this isolated fixture; their separately owned delivery does not assess the Registry on behalf of check.",
  ],
  openQuestions: [],
});

const CheckAnswer = Schema.Struct({
  ok: Schema.Boolean,
  mode: Schema.Literal("query"),
  outcome: Schema.Literal("completed"),
  result: Schema.Struct({
    verdict: Schema.Struct({ ok: Schema.Boolean }),
    assessments: Schema.Array(
      Schema.Struct({ kind: Schema.String, coverage: Schema.Struct({ state: Schema.String }) }),
    ),
  }),
});
const decode = (stdout: string) => Schema.decodeUnknownSync(CheckAnswer)(JSON.parse(stdout));

it("keeps root and typed checks local with credentials, missing content and executable MCP configuration", async () => {
  const workspace = createTempDir();
  const home = createTempDir();
  const registry = await startHttpRegistry();
  const marker = path.join(workspace.path, "runtime-was-executed");
  try {
    fs.mkdirSync(path.join(workspace.path, "skills", "review", "src"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace.path, "skills", "review", "skill.json"),
      JSON.stringify({
        type: "skill",
        owner: "@test",
        name: "review",
        version: "1.0.0",
        description: "Review changes",
      }),
    );
    fs.writeFileSync(
      path.join(workspace.path, "skills", "review", "src", "SKILL.md"),
      "---\nname: review\ndescription: Review changes\n---\n# Review\n",
    );
    fs.writeFileSync(
      path.join(workspace.path, "axm.json"),
      JSON.stringify({
        owner: "@test",
        agents: ["claude-code"],
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: registry.url }],
        skills: {
          review: { source: "workspace" },
          missing: { source: "@test/skills/missing@1.0.0" },
        },
        mcpServers: {
          probe: {
            connection: {
              transport: "stdio",
              command: process.execPath,
              args: [
                "-e",
                `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`,
              ],
            },
          },
        },
      }),
    );
    const env = {
      HOME: home.path,
      AXM_USER_HOME: home.path,
      AXM_TOKEN: "e2e-test-token",
      AXM_NO_UPDATE_CHECK: "1",
      AXM_TELEMETRY: "off",
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    };
    const run = (args: ReadonlyArray<string>) =>
      runCli([...args, "--non-interactive", "--json"], { cwd: workspace.path, env });
    const authoredGroups = ["subagents", "rules", "hooks", "knowledge", "packs"];
    // Use public authoring commands to prepare valid content before observing
    // the read-only boundary. Each typed check then assesses a nonempty subject.
    for (const group of authoredGroups) {
      const created = await run([
        group,
        "new",
        `fixture-${group}`,
        "--description",
        "Local check fixture",
      ]);
      expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    }
    const before = snapshotProtectedState(workspace.path);
    const homePaths = [
      ".axm/workspace",
      ".config/axm/credentials.json",
      ".cache/axm/archives",
      "Library/Caches/axm/archives",
      "AppData/Local/axm/cache/archives",
    ];
    const homeBefore = snapshotProtectedState(home.path, homePaths);
    for (const args of [
      ["check", "review", "--checks", "lint"],
      ["skills", "check", "review", "--checks", "lint"],
      ["mcps", "check", "probe", "--checks", "lint"],
      ...authoredGroups.map((group) => [group, "check", `fixture-${group}`, "--checks", "lint"]),
    ]) {
      const result = await run(args);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(decode(result.stdout).result.verdict.ok).toBe(true);
    }
    for (const args of [
      ["check", "missing"],
      ["check", "--all"],
      ["skills", "check", "unknown"],
    ]) {
      const result = await run(args);
      expect(result.exitCode, result.stdout + result.stderr).toBe(1);
      expect(decode(result.stdout)).toMatchObject({
        ok: false,
        result: { verdict: { ok: false } },
      });
    }
    expect(registry.requests).toEqual([]);
    expect(snapshotProtectedState(workspace.path)).toEqual(before);
    expect(snapshotProtectedState(home.path, homePaths)).toEqual(homeBefore);
    expect(fs.existsSync(marker)).toBe(false);
  } finally {
    await registry.close();
    workspace.cleanup();
    home.cleanup();
  }
}, 90_000);
