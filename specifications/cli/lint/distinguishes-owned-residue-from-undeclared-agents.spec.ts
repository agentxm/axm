import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  LintResultDocumentSchema,
  handleAgentsAdd,
  handleInstall,
  handleLint,
} from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalSkillPackage } from "../../support/install-harness.js";
import { installBundledAxmSkill, makeLintSpecWorkspace } from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/distinguishes-owned-residue-from-undeclared-agents",
  title: "Lint distinguishes AXM-owned residue from genuinely undeclared agents",
  statement:
    "When a workspace still contains AXM-owned projections for an agent that is no longer declared, lint shall report that residue as stale projections and shall not report the agent as detected but undeclared.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeDocument = Schema.decodeUnknownEffect(LintResultDocumentSchema);

describe("Lint classifies agent residue by ownership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports owned residue without also calling the agent undeclared", () =>
    Effect.gen(function* () {
      const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      yield* handleAgentsAdd({
        ids: ["opencode"],
        detected: false,
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const settings = workspace.readSettings();
      if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return;
      workspace.writeSettings({ ...settings, agents: ["claude-code"] });

      yield* handleLint({
        pathArg: Option.some(workspace.root),
        scope: "project",
        strict: false,
        details: false,
        fix: false,
        input: { view: "workspace" },
      }).pipe(Effect.provide(workspace.layer), Effect.exit);

      const document = yield* decodeDocument(workspace.rendererState.results.at(-1)?.data);
      const ruleIds = document.result.findings.map(({ ruleId }) => ruleId);
      expect(ruleIds).toContain("workspace/agents-projections-stale");
      expect(ruleIds).not.toContain("workspace/agents-detected-declared");
    }),
  );
});
