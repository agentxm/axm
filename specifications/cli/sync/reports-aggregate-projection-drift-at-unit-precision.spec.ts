import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleSync, PlanResolutionDocumentSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/sync/reports-aggregate-projection-drift-at-unit-precision",
  title: "Sync identifies the shared output that needs updating",
  statement:
    "When an aggregate projection like an instruction file's rules or knowledge region drifts, a sync preview shall report it as stale or missing at the owning managed unit and region, and shall not attribute the cause to any individual contributing extension.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "machine-automation", "workspace-intent-fidelity"],
  methods: ["decision-table", "contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeDocument = Schema.decodeUnknownEffect(PlanResolutionDocumentSchema);
type PlanDocument = typeof PlanResolutionDocumentSchema.Type;
type PlanUnit = PlanDocument["result"]["units"][number];

const writeAuthoredRule = (workspaceRoot: string, name: string, body: string): void => {
  const packageRoot = path.join(workspaceRoot, "rules", name);
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "rule.json"),
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/rule.schema.json",
      owner: "@acme",
      type: "rule",
      name,
      version: "1.0.0",
      description: `Guidance for ${name}.`,
    })}\n`,
  );
  fs.writeFileSync(path.join(packageRoot, "src", "RULE.md"), `${body}\n`);
};

const writeAuthoredKnowledge = (workspaceRoot: string, name: string, description: string): void => {
  const packageRoot = path.join(workspaceRoot, "knowledge", name);
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "knowledge.json"),
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/knowledge.schema.json",
      owner: "@acme",
      type: "knowledge",
      name,
      version: "1.0.0",
      description,
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    })}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "index.md"),
    `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${name}\n`,
  );
};

const preview = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
  Effect.gen(function* () {
    yield* handleSync({ preview: true, failOnChange: true }).pipe(Effect.provide(workspace.layer));
    return yield* decodeDocument(workspace.rendererState.results.at(-1)?.data);
  });

const requireUnit = (document: PlanDocument, unitId: string): PlanUnit => {
  const unit = document.result.units.find(({ id }) => id === unitId);
  if (unit === undefined) throw new Error(`Expected sync unit ${unitId}`);
  return unit;
};

const expectNoContributorAttribution = (
  unit: PlanUnit,
  contributors: ReadonlyArray<string>,
): void => {
  const diagnostic = `${unit.label}\n${unit.message ?? ""}`;
  for (const contributor of contributors) expect(diagnostic).not.toContain(contributor);
};

describe("Aggregate projection drift diagnostics", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports stale and missing Rules regions without inferring a contributor cause", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: [],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          rules: { alpha: "workspace", beta: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "alpha", "First alpha guidance.");
      writeAuthoredRule(workspace.root, "beta", "Stable beta guidance.");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      writeAuthoredRule(workspace.root, "alpha", "Changed alpha guidance.");
      const staleDocument = yield* preview(workspace);
      const staleUnit = requireUnit(staleDocument, "instruction:reconcile");
      expect(staleUnit).toMatchObject({
        label: "instruction files (stale)",
        state: "ready",
        artifact: {
          path: "AGENTS.md",
          change: "updated",
          managedRegions: [
            {
              unitId: "rule:instructions-region",
              path: "AGENTS.md#rules",
              owner: "@agentxm/rules/instructions",
            },
          ],
        },
      });
      expectNoContributorAttribution(staleUnit, ["@acme/rules/alpha", "@acme/rules/beta"]);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      fs.rmSync(path.join(workspace.root, "AGENTS.md"));
      const missingDocument = yield* preview(workspace);
      const missingUnit = requireUnit(missingDocument, "instruction:reconcile");
      expect(missingUnit.label).toBe("instruction files (missing)");
      expect(missingUnit.artifact).toMatchObject({ path: "AGENTS.md", change: "updated" });
      expectNoContributorAttribution(missingUnit, ["@acme/rules/alpha", "@acme/rules/beta"]);
    }),
  );

  it.effect("reports stale Knowledge discovery at its managed-unit boundary", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          owner: "@acme",
          agents: [],
          instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
          knowledge: { alpha: "workspace", beta: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredKnowledge(workspace.root, "alpha", "Initial alpha knowledge.");
      writeAuthoredKnowledge(workspace.root, "beta", "Stable beta knowledge.");
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      writeAuthoredKnowledge(workspace.root, "alpha", "Changed alpha knowledge.");
      const document = yield* preview(workspace);
      const unit = requireUnit(document, "knowledge:discovery");
      expect(unit).toMatchObject({
        label: "Knowledge discovery (stale)",
        state: "ready",
        artifact: {
          path: "AGENTS.md",
          change: "updated",
        },
      });
      expect(unit.artifact?.managedRegions).toHaveLength(1);
      expect(unit.artifact?.managedRegions?.[0]).toMatchObject({
        unitId: "knowledge:discovery-region",
        owner: "@agentxm/knowledge/discovery",
      });
      expect(unit.artifact?.managedRegions?.[0]?.path.endsWith("/AGENTS.md#knowledge")).toBe(true);
      expectNoContributorAttribution(unit, ["@acme/knowledge/alpha", "@acme/knowledge/beta"]);
    }),
  );
});
