import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
} from "../../../lifecycle/install/test-helpers.js";
import { queryLintWorkspace } from "../../run/lint-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-deprecated-installed",
  title: "Lint reports deprecated installed extensions",
  statement:
    "When current Registry assessment marks installed extensions deprecated, lint shall report one warning per extension with its reason, replacement and the applicable command, and strict mode shall fail without changing workspace state.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Deprecated installed workspace findings", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "reports each current deprecation and fails strict lint without changing workspace state",
    () => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      for (const name of ["old", "other"]) {
        world.registry.writeSkill(name, [{ version: "1.0.0", body: `Guidance for ${name}` }]);
        const index = path.join(
          world.registry.root,
          "extensions",
          "@acme",
          "skills",
          name,
          "index.json",
        );
        fs.writeFileSync(
          index,
          fs.readFileSync(index, "utf8").replace(
            '"deprecation": null',
            `"deprecation": ${JSON.stringify({
              deprecatedAt: "2026-03-01T00:00:00.000Z",
              reason: name === "old" ? "obsolete" : "other",
              message: name === "old" ? "No longer needed." : "Choose manually.",
            })}`,
          ),
        );
      }
      return world.workspace
        .provide(
          Effect.gen(function* () {
            for (const name of ["old", "other"]) {
              yield* applyInstall(
                installRequest({
                  type: "skill",
                  subject: { kind: "source", source: `@acme/skills/${name}` },
                }),
              );
            }
            const before = world.workspace.snapshot();
            const result = yield* queryLintWorkspace(
              {
                workspaceRoot: world.workspace.root,
                userHome: world.workspace.root,
                scope: "project",
                input: { view: "workspace" },
                fix: false,
              },
              { strict: true },
            );
            const findings = result.document.findings.filter(
              (finding) => finding.ruleId === "workspace/deprecated-installed",
            );
            expect(findings).toHaveLength(2);
            expect(findings.map((finding) => finding.message)).toContainEqual(
              expect.stringContaining("axm migrate @acme/skills/old --dry-run"),
            );
            expect(findings.map((finding) => finding.message)).toContainEqual(
              expect.stringContaining("axm view @acme/skills/other"),
            );
            expect(result.outcome).toBe("fail");
            expect(world.workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(
          Effect.provide(
            Layer.mergeAll(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer(null)),
          ),
        );
    },
  );
});
