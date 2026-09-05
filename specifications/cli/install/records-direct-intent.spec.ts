import { localLifecycleRows } from "../../support/local-lifecycle-fixtures.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/records-direct-intent",
  title: "Install records the extension as directly desired workspace configuration",
  statement:
    "When a person installs an acquirable extension, the install command shall record it in workspace settings as directly desired configuration.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  supersedes: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  assumptions: [],
  openQuestions: [],
});

describe("Install records direct workspace intent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("records the extension as directly desired workspace configuration", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      expect(JSON.stringify(workspace.readSettings())).not.toContain("code-review");

      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readSettings()).toMatchObject({
        skills: { "code-review": expect.anything() },
      });
    }),
  );
  it.effect.each(localLifecycleRows)("records direct intent for a local $label", (row) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const name = `conformance-${row.label}`;
      const source = row.writePackage(workspace.root, { name });
      yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readSettings()).toMatchObject({
        [row.settingsKey]: { [name]: expect.anything() },
      });
    }),
  );
});
