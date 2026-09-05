import { expect } from "@effect/vitest";
import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSubagentPackage,
  type LocalExtensionFixture,
} from "./extension-fixtures.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "./install-harness.js";

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

/**
 * One conformance row per extension type the root locator install can acquire
 * from a local directory. MCP servers (Registry package or inline settings
 * authority) and packs (Registry or workspace authorship, no local package
 * source) cannot be driven through this route; their shared-lifecycle evidence
 * is bound at the process boundary by the `executionBinding` exports on
 * `packages/cli-e2e/src/root-install.e2e.test.ts` (registry install, pack graph
 * lifecycle) and `packages/cli-e2e/src/activation-lifecycle.e2e.test.ts`
 * (authored lifecycle for every catalog type). That the locator route and the
 * registry-only types together account for every catalog type is an
 * implementation inventory, checked by the root install handler's internal
 * tests rather than here.
 */
export interface LocalLifecycleRow {
  readonly label: string;
  readonly type: "skill" | "rule" | "hook" | "knowledge" | "subagent";
  readonly plural: "skills" | "rules" | "hooks" | "knowledge" | "subagents";
  readonly settingsKey: "skills" | "rules" | "hooks" | "knowledge" | "subagents";
  readonly writePackage: (workspaceRoot: string, fixture: LocalExtensionFixture) => string;
  /** Canonical content file inside the acquired package, relative to its root. */
  readonly canonicalFile: (name: string) => string;
  /** Product-observable realized surfaces while the extension is active. */
  readonly expectRealized: (workspace: SpecWorkspace, name: string) => void;
  /** The same surfaces after removal: no trace of the extension remains. */
  readonly expectUnrealized: (workspace: SpecWorkspace, name: string) => void;
}

const expectFileLacksMarker = (
  workspace: SpecWorkspace,
  relativePath: string,
  marker: string,
): void => {
  if (workspace.exists(relativePath)) {
    expect(workspace.readFile(relativePath)).not.toContain(marker);
  }
};

export const localLifecycleRows: ReadonlyArray<LocalLifecycleRow> = [
  {
    label: "skill",
    type: "skill",
    plural: "skills",
    settingsKey: "skills",
    writePackage: writeLocalSkillPackage,
    canonicalFile: () => "src/SKILL.md",
    expectRealized: (workspace, name) => {
      expect(workspace.readFile(`.claude/skills/${name}/SKILL.md`)).toBe(
        workspace.readFile(`agent_extensions/local/vendor/${name}/src/SKILL.md`),
      );
      expect(workspace.readFile(`.agents/skills/${name}/SKILL.md`)).toBe(
        workspace.readFile(`agent_extensions/local/vendor/${name}/src/SKILL.md`),
      );
    },
    expectUnrealized: (workspace, name) => {
      expect(workspace.exists(`.claude/skills/${name}`)).toBe(false);
      expect(workspace.exists(`.agents/skills/${name}`)).toBe(false);
    },
  },
  {
    label: "rule",
    type: "rule",
    plural: "rules",
    settingsKey: "rules",
    writePackage: writeLocalRulePackage,
    canonicalFile: () => "src/RULE.md",
    expectRealized: (workspace, name) => {
      const instructions = workspace.readFile("AGENTS.md");
      expect(instructions).toContain("region=rules");
      expect(instructions).toContain(`@acme/rules/${name}`);
      expect(instructions).toContain(`Guidance for ${name}`);
    },
    expectUnrealized: (workspace, name) => {
      expectFileLacksMarker(workspace, "AGENTS.md", `@acme/rules/${name}`);
    },
  },
  {
    label: "hook",
    type: "hook",
    plural: "hooks",
    settingsKey: "hooks",
    writePackage: writeLocalHookPackage,
    canonicalFile: () => "src/hook.sh",
    expectRealized: (workspace, name) => {
      expect(workspace.readFile(".claude/settings.json")).toContain(`hook:${name}`);
    },
    expectUnrealized: (workspace, name) => {
      expectFileLacksMarker(workspace, ".claude/settings.json", `hook:${name}`);
    },
  },
  {
    label: "knowledge",
    type: "knowledge",
    plural: "knowledge",
    settingsKey: "knowledge",
    writePackage: writeLocalKnowledgePackage,
    canonicalFile: () => "src/index.md",
    // Knowledge bundles are read from canonical content, without bundle copies
    // under these agent directories. This does not assess the optional compact
    // discovery entry contributed to shared instruction files.
    expectRealized: (workspace, name) => {
      const agentEntries = [
        ...workspace.snapshotTree(".claude"),
        ...workspace.snapshotTree(".agents"),
      ];
      expect(agentEntries.filter((entry) => entry.includes(name))).toEqual([]);
    },
    expectUnrealized: (workspace, name) => {
      const agentEntries = [
        ...workspace.snapshotTree(".claude"),
        ...workspace.snapshotTree(".agents"),
      ];
      expect(agentEntries.filter((entry) => entry.includes(name))).toEqual([]);
    },
  },
  {
    label: "subagent",
    type: "subagent",
    plural: "subagents",
    settingsKey: "subagents",
    writePackage: writeLocalSubagentPackage,
    canonicalFile: (name) => `src/${name}.md`,
    expectRealized: (workspace, name) => {
      expect(workspace.readFile(`.claude/agents/${name}.md`)).toContain(`# ${name}`);
    },
    expectUnrealized: (workspace, name) => {
      expect(workspace.exists(`.claude/agents/${name}.md`)).toBe(false);
    },
  },
];
