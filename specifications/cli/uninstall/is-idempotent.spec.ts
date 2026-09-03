import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleUninstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/is-idempotent",
  title: "Uninstalling an extension the workspace does not desire is a safe no-op",
  statement:
    "When uninstall targets an extension the workspace does not desire, whether never installed or already uninstalled, it shall report a no-op and shall change no configuration, resolution, canonical content, or agent projection.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  status: "accepted",
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface AbsentCase {
  readonly label: string;
  readonly prepare: "nothing" | "install-then-uninstall";
}

const absentCases: readonly AbsentCase[] = [
  {
    label: "uninstalling an extension that was never desired reports a no-op",
    prepare: "nothing",
  },
  {
    label: "repeating a completed uninstall reports a no-op",
    prepare: "install-then-uninstall",
  },
];

describe("Uninstall of an absent extension is safe to repeat", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(absentCases)("$label", (testCase) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const uninstall = handleUninstall({
        source: "@acme/skills/code-review",
        yes: true,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      if (testCase.prepare === "install-then-uninstall") {
        const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
        yield* handleInstall({
          source: Option.some(skillPackage),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
        yield* uninstall;
      }
      const before = {
        settings: JSON.stringify(workspace.readSettings()),
        lockfile: workspace.readLockfileText(),
        extensions: workspace.snapshotTree("agent_extensions"),
        claude: workspace.snapshotTree(".claude"),
        agents: workspace.snapshotTree(".agents"),
      };

      yield* uninstall;

      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({
        result: { outcome: "no-op", counts: { total: 0, committed: 0 } },
      });
      expect(JSON.stringify(workspace.readSettings())).toBe(before.settings);
      expect(workspace.readLockfileText()).toBe(before.lockfile);
      expect(workspace.snapshotTree("agent_extensions")).toEqual(before.extensions);
      expect(workspace.snapshotTree(".claude")).toEqual(before.claude);
      expect(workspace.snapshotTree(".agents")).toEqual(before.agents);
    }),
  );
});
