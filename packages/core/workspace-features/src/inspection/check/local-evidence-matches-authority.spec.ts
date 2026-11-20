import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { makeInstallWorld, applyInstall, installRequest } from "../../testing/install-world.js";
import { writeAgentSkillDirectory, writeMinimalPackage } from "../../testing/local-packages.js";
import { applySync } from "../../testing/sync-fixture.js";
import { localCheckOwners as owners } from "../../testing/local-check-fixture.js";
import { checkLocal } from "./check-document.js";

export const specification = defineSpecification({
  requirement: "cli/check/local-evidence-matches-authority",
  title: "Local check evidence follows package and contributor authority",
  statement:
    "Local checks shall recognize readable portable SKILL.md content without requiring an AXM manifest, join shared-output contributors to their unambiguous desired package identities across workspace and acquired authorities, and exclude unrelated directories that have no package manifest. A configured package whose content is missing shall remain incomplete. Catalog advisories about shared reader roots shall not reduce otherwise complete observation coverage.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Production installation, inspection and checks share native temporary workspaces and a deterministic file Registry.",
  methods: ["example"],
  derivedFrom: [
    "cli/check/includes-required-contributors",
    "cli/check/verdict-requires-complete-selected-evidence",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const checks = ["compatibility", "ownership", "lint", "convergence"] as const;

it.effect("checks an installed portable skill without an optional skill.json", () => {
  const { workspace, cleanup } = makeInstallWorld({ settings: { agents: [] } });
  const source = writeAgentSkillDirectory(workspace.root, {
    name: "portable",
    description: "Portable guidance",
  });
  return workspace
    .provide(
      Effect.gen(function* () {
        const installed = yield* applyInstall(
          installRequest({ type: "skill", subject: { kind: "source", source } }),
        );
        expect(deriveOperationOutcome(installed), JSON.stringify(installed)).toBe("applied");
        const before = workspace.snapshot();
        const result = yield* checkLocal(
          {
            selection: { kind: "identities", identities: ["portable"] },
            checks,
            strict: false,
            userHome: workspace.home,
          },
          owners,
        );
        expect(result.verdict, JSON.stringify(result)).toMatchObject({ ok: true });
        expect(
          result.assessments.every((assessment) => assessment.coverage.state === "complete"),
        ).toBe(true);
        expect(workspace.snapshot()).toEqual(before);
      }),
    )
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
      Effect.ensuring(Effect.sync(cleanup)),
    );
});

it.effect("joins authored and acquired Knowledge sharing a discovery region", () => {
  const { workspace, registry, cleanup } = makeInstallWorld({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      instructionFiles: { fileName: "AGENTS.md" },
      knowledge: { authored: "workspace", acquired: "@acme/knowledge/acquired" },
    },
  });
  writeMinimalPackage(`${workspace.root}/knowledge/authored`, "knowledge", {
    owner: "@acme",
    name: "authored",
    description: "Authored knowledge",
  });
  registry.writeKnowledge("acquired", [{ version: "1.0.0", body: "Acquired guidance." }]);
  return workspace
    .provide(
      Effect.gen(function* () {
        const synced = yield* applySync();
        expect(synced._tag, JSON.stringify(synced)).toBe("Resolved");
        if (synced._tag === "Resolved")
          expect(deriveOperationOutcome(synced.resolution), JSON.stringify(synced)).toBe("applied");
        const before = workspace.snapshot();
        const result = yield* checkLocal(
          {
            selection: { kind: "identities", identities: ["@acme/knowledge/authored"] },
            checks,
            strict: false,
            userHome: workspace.home,
          },
          owners,
        );
        expect(
          result.scope.subjects.map(({ name }) => name).sort(),
          JSON.stringify(result),
        ).toEqual(["acquired", "authored"]);
        expect(result.scope.incomplete).toEqual([]);
        expect(result.verdict, JSON.stringify(result)).toMatchObject({ ok: true });
        expect(result.inspection.coverage.state).toBe("complete");
        expect(workspace.snapshot()).toEqual(before);
      }),
    )
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
      Effect.ensuring(Effect.sync(cleanup)),
    );
});

for (const declared of [false, true])
  it.effect(
    `an application directory is only selected as an MCP package when declared: ${declared}`,
    () => {
      const { workspace, cleanup } = makeInstallWorld({
        settings: {
          owner: "@acme",
          agents: [],
          ...(declared ? { mcpServers: { app: { source: "workspace" } } } : {}),
        },
      });
      workspace.writeFile("mcps/app/package.json", "{}");
      workspace.writeFile("mcps/app/wrangler.toml", 'name = "app"\n');
      return workspace
        .provide(
          Effect.gen(function* () {
            const result = yield* checkLocal(
              { selection: { kind: "all" }, checks, strict: false, userHome: workspace.home },
              owners,
            );
            expect(result.scope.subjects.some(({ name }) => name === "app")).toBe(declared);
            expect(result.verdict.ok).toBe(!declared);
          }),
        )
        .pipe(
          Effect.provide(
            Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
          ),
          Effect.ensuring(Effect.sync(cleanup)),
        );
    },
  );
