import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSyncFixture } from "../../../reconciliation/sync/test-helpers.js";
import { makeRegistrySkillLockEntry } from "../../testing.js";
import { WorkspaceLocation } from "../location.js";
import { DesiredStateReader } from "../desired-state-reader.js";
import { LockfileReader } from "../lockfile-reader.js";
import { WorkspaceRecords } from "../workspace-records.js";
import { observeInstallRoot } from "../install-root.js";

export const specification = defineSpecification({
  requirement: "workspace-inventory/leftover-follows-desired-state-reachability",
  title:
    "Inventory reports as leftover exactly the installed packages desired state no longer reaches",
  statement:
    "When an installed package in the install root is reached by no desired route, the workspace inventory shall classify it as leftover; it shall classify as leftover no package a desired route reaches and none while desired state is incomplete; and the packages it names as leftover shall be the packages the install-root observation names, so list, lint and sync agree.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/sync/removes-leftover-installed-packages",
    "cli/lint/reports-installed-but-not-configured",
    "cli/lock-state-never-creates-reachability",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const installedSkill = (name: string) => ({
  [`agent_extensions/registry/@acme/skills/${name}/skill.json`]: JSON.stringify({
    owner: "@acme",
    type: "skill",
    name,
    version: "1.0.0",
    description: "Fixture",
  }),
  [`agent_extensions/registry/@acme/skills/${name}/src/SKILL.md`]: `---\nname: ${name}\ndescription: Fixture\n---\n# ${name}\n`,
});

const acceptedSkill = (name: string) =>
  makeRegistrySkillLockEntry({ owner: decodeHandleSync("@acme"), name, sourceName: "agentxm" });

const cases = [
  {
    case: "lockless package",
    settings: { owner: "@acme", skills: { review: "agentxm:@acme/skills/review" } },
    files: installedSkill("stale"),
    expected: ["stale"],
    incomplete: false,
  },
  {
    case: "desired accepted package",
    settings: { owner: "@acme", skills: { stale: "agentxm:@acme/skills/stale" } },
    lockfile: { skills: { stale: acceptedSkill("stale") } },
    files: installedSkill("stale"),
    expected: [],
    incomplete: false,
  },
  {
    case: "lock row without a declaration",
    settings: { owner: "@acme" },
    lockfile: { skills: { stale: acceptedSkill("stale") } },
    files: installedSkill("stale"),
    expected: ["stale"],
    incomplete: false,
  },
  {
    case: "incomplete desired Pack",
    settings: { owner: "@acme", packs: { missing: "agentxm:@acme/packs/missing" } },
    files: installedSkill("stale"),
    expected: [],
    incomplete: true,
  },
  {
    case: "legacy external content",
    settings: { owner: "@acme" },
    files: { "agent_extensions/external/portable/SKILL.md": "# Portable\n" },
    expected: [],
    incomplete: false,
  },
];

describe("Workspace inventory leftover reachability", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)("agrees with the install root for $case", (row) => {
    const workspace = makeSyncFixture({
      settings: row.settings,
      files: row.files,
      ...("lockfile" in row ? { lockfile: row.lockfile } : {}),
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          const location = yield* WorkspaceLocation;
          const desiredState = yield* DesiredStateReader;
          const locks = yield* LockfileReader;
          const records = yield* WorkspaceRecords;
          const graph = yield* desiredState.graph();
          expect(graph.complete).toBe(!row.incomplete);
          const installRoot = yield* observeInstallRoot({
            layout: yield* Ref.get(location.layout),
            graph,
            locks,
          });
          const inventory = yield* records.getExtensionInventory("skill", {});
          const listed = inventory.items
            .filter((item) => item.classification.lifecycle === "leftover")
            .map((item) => item.name)
            .sort();
          const observed = installRoot.leftovers
            .filter((item) => item.type === "skill")
            .map((item) => item.name)
            .sort();
          expect(listed).toEqual(observed);
          expect(listed).toEqual(row.expected);
          expect(inventory.leftoverCount).toBe(installRoot.leftovers.length);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
