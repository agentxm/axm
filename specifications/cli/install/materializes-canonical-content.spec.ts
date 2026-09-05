import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/materializes-canonical-content",
  title: "Install materializes the extension's canonical content inside the workspace",
  statement:
    "When a person installs an acquirable extension, the install command shall materialize the extension's canonical content inside the workspace's managed extension tree.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
  derivedFrom: ["cli/install/direct-intent-recorded-and-realized"],
  supersedes: ["cli/install/direct-intent-recorded-and-realized"],
  assumptions: [],
  openQuestions: [],
});

const CANONICAL_SKILL_DOCUMENT = "agent_extensions/local/vendor/code-review/src/SKILL.md";

describe("Install materializes canonical content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("materializes canonical extension content inside the workspace", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      expect(workspace.exists("agent_extensions")).toBe(false);

      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.snapshotTree("agent_extensions")).toContain(CANONICAL_SKILL_DOCUMENT);
      expect(workspace.readFile(CANONICAL_SKILL_DOCUMENT)).toContain("# code-review");
    }),
  );
});
