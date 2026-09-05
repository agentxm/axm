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
  methods: ["example"],
  derivedFrom: ["cli/install/direct-intent-recorded-and-realized"],
  supersedes: ["cli/install/direct-intent-recorded-and-realized"],
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
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readSettings()).toMatchObject({
        skills: { "code-review": expect.anything() },
      });
    }),
  );
});
