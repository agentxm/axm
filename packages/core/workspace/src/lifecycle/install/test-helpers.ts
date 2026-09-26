/** Install conformance rows and settings reads for this feature's own tests and specifications. */

import { expect } from "@effect/vitest";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import type { LifecycleFixture } from "../testing.js";
import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
} from "../../testing/local-packages.js";

/** The workspace settings document, as the product wrote it. */
export const readSettings = (workspace: LifecycleFixture): Readonly<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(workspace.readFile("axm.json"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Expected the workspace settings document to be an object");
  }
  return { ...parsed };
};

/**
 * One conformance row per extension type an install can acquire from a local
 * directory. MCP servers and packs are Registry-only, so their evidence is
 * written with a published Registry rather than a row here.
 */
export interface LocalLifecycleRow {
  readonly label: string;
  readonly type: InstallableExtensionType;
  /** The lockfile and settings collection this type's entries live under. */
  readonly settingsKey: "skills" | "subagents" | "rules" | "hooks" | "knowledge";
  /** The type segment a fully qualified name spells for this type. */
  readonly plural: string;
  readonly writePackage: (root: string, fixture: { readonly name: string }) => string;
  /** Canonical content file inside the acquired package, relative to its root. */
  readonly canonicalFile: (name: string) => string;
  /** Product-observable realized surfaces while the extension is active. */
  readonly expectRealized: (workspace: LifecycleFixture, name: string) => void;
  /** The same surfaces after removal: no trace of the extension remains. */
  readonly expectUnrealized: (workspace: LifecycleFixture, name: string) => void;
}

const expectFileLacksMarker = (
  workspace: LifecycleFixture,
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
    settingsKey: "skills",
    plural: "skills",
    writePackage: writeLocalSkillPackage,
    canonicalFile: () => "src/SKILL.md",
    expectRealized: (workspace, name) => {
      expect(workspace.readFile(`.claude/skills/${name}/SKILL.md`)).toBe(
        workspace.readFile(`agent_extensions/path/@acme/skills/${name}/src/SKILL.md`),
      );
      expect(workspace.readFile(`.agents/skills/${name}/SKILL.md`)).toBe(
        workspace.readFile(`agent_extensions/path/@acme/skills/${name}/src/SKILL.md`),
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
    settingsKey: "rules",
    plural: "rules",
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
    settingsKey: "hooks",
    plural: "hooks",
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
    settingsKey: "knowledge",
    plural: "knowledge",
    writePackage: writeLocalKnowledgePackage,
    canonicalFile: () => "src/index.md",
    // Knowledge bundles are read from canonical content, without bundle copies
    // under these agent directories.
    expectRealized: (workspace, name) => {
      expect(entriesUnder(workspace, ".claude").filter((entry) => entry.includes(name))).toEqual(
        [],
      );
      expect(entriesUnder(workspace, ".agents").filter((entry) => entry.includes(name))).toEqual(
        [],
      );
    },
    expectUnrealized: (workspace, name) => {
      expect(entriesUnder(workspace, ".claude").filter((entry) => entry.includes(name))).toEqual(
        [],
      );
      expect(entriesUnder(workspace, ".agents").filter((entry) => entry.includes(name))).toEqual(
        [],
      );
    },
  },
  {
    label: "subagent",
    type: "subagent",
    settingsKey: "subagents",
    plural: "subagents",
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

/** Workspace-relative paths under one directory, from the fixture's snapshot. */
export const entriesUnder = (
  workspace: LifecycleFixture,
  directory: string,
): ReadonlyArray<string> =>
  Object.keys(workspace.snapshot()).filter(
    (relative) => relative === directory || relative.startsWith(`${directory}/`),
  );

/** Workspace-relative path and content of everything under one directory. */
export const contentUnder = (
  workspace: LifecycleFixture,
  directory: string,
): ReadonlyArray<readonly [string, string]> =>
  Object.entries(workspace.snapshot()).filter(
    ([relative]) => relative === directory || relative.startsWith(`${directory}/`),
  );
