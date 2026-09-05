import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleUninstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSubagentPackage,
  type LocalExtensionFixture,
} from "../support/extension-fixtures.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/every-type-completes-the-shared-lifecycle",
  title: "Every extension type completes the shared install and removal lifecycle",
  statement:
    "Every extension type shall complete the shared lifecycle: installing shall record intent, an accepted resolution, canonical content, and realized agent surfaces, and uninstalling shall remove that whole footprint while preserving unrelated workspace files.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Process-boundary end-to-end executions supply the shared-lifecycle evidence for the MCP server and pack extension types.",
  ],
  openQuestions: [],
});

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
interface ConformanceRow {
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

const conformanceRows: ReadonlyArray<ConformanceRow> = [
  {
    label: "skill",
    type: "skill",
    plural: "skills",
    settingsKey: "skills",
    writePackage: writeLocalSkillPackage,
    canonicalFile: () => "src/SKILL.md",
    expectRealized: (workspace, name) => {
      expect(workspace.exists(`.claude/skills/${name}`)).toBe(true);
      expect(workspace.exists(`.agents/skills/${name}`)).toBe(true);
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
    // Knowledge realizes no per-agent surface: canonical bundle content is the
    // discoverable product state, and agent directories stay untouched.
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
      expect(workspace.exists(`.claude/agents/${name}.md`)).toBe(true);
    },
    expectUnrealized: (workspace, name) => {
      expect(workspace.exists(`.claude/agents/${name}.md`)).toBe(false);
    },
  },
];

describe("Every extension type completes the shared lifecycle", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const installedWorkspace = (row: ConformanceRow, name: string) => {
    const workspace = makeSpecWorkspace();
    cleanups.push(workspace.cleanup);
    const packageRoot = row.writePackage(workspace.root, { name });
    const install = handleInstall({
      source: Option.some(packageRoot),
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    return { workspace, install };
  };

  it.effect.each(conformanceRows)(
    "installing a local $label records intent, resolution, canonical content, and realized surfaces",
    (row) =>
      Effect.gen(function* () {
        const name = `conformance-${row.label}`;
        const { workspace, install } = installedWorkspace(row, name);
        yield* install;

        expect(workspace.readSettings()).toMatchObject({
          [row.settingsKey]: { [name]: expect.anything() },
        });

        const lockfile = workspace.readLockfileText();
        expect(lockfile).toContain(name);
        expect(lockfile).toContain(`extensionType: ${row.type}`);

        const canonicalPath = `agent_extensions/local/vendor/${name}/${row.canonicalFile(name)}`;
        expect(workspace.exists(canonicalPath)).toBe(true);
        expect(workspace.readFile(canonicalPath)).toContain(name);

        row.expectRealized(workspace, name);
      }),
  );

  it.effect.each(conformanceRows)(
    "uninstalling the $label removes its whole footprint and preserves surrounding state",
    (row) =>
      Effect.gen(function* () {
        const name = `conformance-${row.label}`;
        const { workspace, install } = installedWorkspace(row, name);
        yield* install;

        const unrelatedFile = "NOTES.md";
        const unownedSkill = ".claude/skills/hand-written/SKILL.md";
        fs.mkdirSync(path.dirname(path.join(workspace.root, unownedSkill)), { recursive: true });
        fs.writeFileSync(path.join(workspace.root, unownedSkill), "# Hand written\n");
        fs.writeFileSync(path.join(workspace.root, unrelatedFile), "unrelated project file\n");

        yield* handleUninstall({
          source: `@acme/${row.plural}/${name}`,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expect(workspace.readSettings()).not.toMatchObject({
          [row.settingsKey]: { [name]: expect.anything() },
        });
        expect(workspace.readLockfileText()).not.toContain(name);
        expect(workspace.exists(`agent_extensions/local/vendor/${name}`)).toBe(false);
        row.expectUnrealized(workspace, name);

        expect(workspace.readFile(unownedSkill)).toBe("# Hand written\n");
        expect(workspace.readFile(unrelatedFile)).toBe("unrelated project file\n");
        expect(workspace.exists(`vendor/${name}`)).toBe(true);
      }),
  );
});
