import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { deriveOperationOutcome, type OperationResolution } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionLifecycleFailed } from "../errors.js";
import { applyInstall, installRequest, makeInstallWorld } from "../install/test-helpers.js";
import { writeLocalSkillPackage } from "../testing.js";
import { applyUninstall, previewUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/refuses-undesired-target",
  title: "Uninstall refuses an installed package the workspace does not configure",
  statement:
    "When a root or type uninstall names an identity that no desired route reaches while an installed package for it exists in the install root, it shall refuse as an unmet precondition before any change and tell the user that axm sync reconciles installed packages that are not configured; and every uninstall preview and result shall list as removed only paths that exist and are removed, and as updated only files whose content changes.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["decision-table"],
  derivedFrom: ["cli/uninstall/is-idempotent", "cli/uninstall/reports-removed-and-retained-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

type Workspace = ReturnType<typeof makeInstallWorld>["workspace"];

interface Row {
  readonly label: string;
  /** What exists before the removal. */
  readonly given: "leftover" | "never-installed" | "desired";
  readonly type: InstallableExtensionType;
  readonly name: string;
  /** The removal as a route supplies it. */
  readonly target: { readonly type?: InstallableExtensionType; readonly selector: string };
  readonly expect: "refused" | "no-op" | "applied";
}

const rows: ReadonlyArray<Row> = [
  {
    label: "a leftover skill named by root FQN is refused",
    given: "leftover",
    type: "skill",
    name: "leftover",
    target: { selector: "@acme/skills/leftover" },
    expect: "refused",
  },
  {
    label: "a leftover skill named by the skills route is refused",
    given: "leftover",
    type: "skill",
    name: "leftover",
    target: { type: "skill", selector: "leftover" },
    expect: "refused",
  },
  {
    label: "a leftover skill named by FQN on the skills route is refused",
    given: "leftover",
    type: "skill",
    name: "leftover",
    target: { type: "skill", selector: "@acme/skills/leftover" },
    expect: "refused",
  },
  {
    label: "a leftover subagent named by root FQN is refused",
    given: "leftover",
    type: "subagent",
    name: "leftover",
    target: { selector: "@acme/subagents/leftover" },
    expect: "refused",
  },
  {
    label: "a never-installed skill named by root FQN is a no-op that lists no paths",
    given: "never-installed",
    type: "skill",
    name: "never",
    target: { selector: "@acme/skills/never" },
    expect: "no-op",
  },
  {
    label:
      "a never-installed skill named by FQN on the skills route is a no-op that lists no paths",
    given: "never-installed",
    type: "skill",
    name: "never",
    target: { type: "skill", selector: "@acme/skills/never" },
    expect: "no-op",
  },
  {
    label: "a desired skill still uninstalls",
    given: "desired",
    type: "skill",
    name: "wanted",
    target: { type: "skill", selector: "wanted" },
    expect: "applied",
  },
];

const PLURAL: Partial<Record<InstallableExtensionType, string>> = {
  skill: "skills",
  subagent: "subagents",
};

const writeLeftover = (workspace: Workspace, row: Row) =>
  workspace.writeFile(
    `agent_extensions/agentxm/@acme/${PLURAL[row.type] ?? row.type}/${row.name}/README.md`,
    "Installed earlier, no longer configured.\n",
  );

const listedPaths = (resolution: OperationResolution) =>
  resolution.units.flatMap((unit) =>
    (unit.artifact?.targets ?? []).filter(
      (target) => target.change === "removed" || target.change === "updated",
    ),
  );

describe("Uninstall of a target the workspace does not configure", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(rows)("$label", (row) => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const { workspace } = world;
    return workspace
      .provide(
        Effect.gen(function* () {
          if (row.given === "leftover") writeLeftover(workspace, row);
          if (row.given === "desired") {
            const source = writeLocalSkillPackage(workspace.root, { name: row.name });
            yield* applyInstall(installRequest({ subject: { kind: "source", source } }));
          }
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();
          const request = uninstallRequest(row.target);

          if (row.expect === "refused") {
            for (const attempt of [previewUninstall(request), applyUninstall(request)]) {
              const failure = yield* attempt.pipe(Effect.flip);
              expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
              if (failure instanceof ExtensionLifecycleFailed) {
                expect(failure.category).toBe("conflict");
                expect(failure.detail).toContain("axm sync");
                expect(failure.detail).toContain(row.name);
              }
              expect(workspace.snapshot()).toEqual(before);
              expect(workspace.homeSnapshot()).toEqual(homeBefore);
            }
            return;
          }

          const preview = yield* previewUninstall(request);
          expect(workspace.snapshot()).toEqual(before);

          if (row.expect === "no-op") {
            expect(listedPaths(preview)).toEqual([]);
            const applied = yield* applyUninstall(request);
            expect(deriveOperationOutcome(applied)).toBe("no-op");
            expect(listedPaths(applied)).toEqual([]);
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.homeSnapshot()).toEqual(homeBefore);
            return;
          }

          expect(deriveOperationOutcome(preview)).toBe("previewed");
          const applied = yield* applyUninstall(request);
          expect(deriveOperationOutcome(applied)).toBe("applied");
          for (const target of listedPaths(applied).filter((entry) => entry.change === "removed"))
            expect(workspace.exists(target.path)).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
