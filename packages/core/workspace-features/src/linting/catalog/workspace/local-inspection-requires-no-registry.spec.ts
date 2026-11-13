import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { RegistryClientFactory } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { applyInstall, installRequest, makeInstallWorld } from "../../../testing/install-world.js";
import { queryLintWorkspace } from "../../run/lint-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/lint/local-inspection-requires-no-registry",
  title: "Local lint does not consult the Registry",
  statement:
    "Lint shall inspect local workspace facts without consulting the Registry, including when installed extensions have changed lifecycle metadata.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundaryRationale:
    "Production acquisition, state capture and settlement share a native temporary workspace and file Registry; accepted resolutions and realized output bytes are observed on disk.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [],
  supersedes: ["cli/lint/reports-deprecated-installed"],
  assumptions: [],
  openQuestions: [],
});

describe("Local lint with Registry-installed extensions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "reports local facts without consulting the Registry or changing workspace state",
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
            for (const strict of [false, true]) {
              const result = yield* queryLintWorkspace(
                {
                  workspaceRoot: world.workspace.root,
                  userHome: world.workspace.root,
                  scope: "project",
                  input: { view: "filesystem" },
                  nativeView: { kind: "workspace" },
                  fix: false,
                },
                { strict },
              ).pipe(
                Effect.provideService(RegistryClientFactory, {
                  authorityContext: () => Effect.die("Unexpected Registry authority lookup"),
                  withReadPhase: (effect) => effect,
                  invalidateReadPhase: Effect.void,
                  forEndpoint: () => Effect.die("Local lint requested Registry content"),
                  lifecycle: () => Effect.die("Local lint requested Registry lifecycle"),
                  wire: () => Effect.die("Local lint requested Registry transport"),
                }),
              );
              expect(
                result.document.findings.some(
                  (finding) => finding.ruleId === "workspace/deprecated-installed",
                ),
              ).toBe(false);
              expect(result.document).toHaveProperty("findings");
            }
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
