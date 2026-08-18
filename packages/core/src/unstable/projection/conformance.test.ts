/**
 * Completeness gate for aggregate ownership units.
 *
 * Every unit declared with many contributors in the ownership-unit registry
 * must register multi-route contributor coverage: behavior tests that render
 * the unit from contributors reached through more than one route (members of
 * two different Packs at minimum) and prove one contributor's lifecycle leaves
 * the others rendered exactly once. Declaring a new aggregate unit without
 * registering that coverage fails this gate.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aggregateOwnershipUnits } from "./units.js";

const packageSrc = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "..");

const productionTypeScriptFiles = (root: string): ReadonlyArray<string> =>
  nodeFs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = nodePath.join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")
      ? [absolute]
      : [];
  });

/**
 * Registered multi-route coverage per aggregate unit, as paths relative to
 * `src/unstable`. Each referenced suite must exercise contributors from two
 * different Packs (the `pack-a`/`pack-b` fixtures).
 */
const registeredCoverage: Readonly<Record<string, ReadonlyArray<string> | undefined>> = {
  "rule:instructions-region": ["rules/manager.graph-projection.test.ts"],
  "hook:agent-hook-entries": ["hooks/manager.graph-projection.test.ts"],
  "hook:fallback-region": ["hooks/manager.graph-projection.test.ts"],
  "knowledge:discovery-region": ["knowledge/manager.graph-projection.test.ts"],
};

describe("aggregate ownership unit conformance", () => {
  it("registers multi-route contributor coverage for every aggregate unit", () => {
    for (const unit of aggregateOwnershipUnits) {
      const coverage = registeredCoverage[unit.unitId];
      expect(
        coverage,
        `Aggregate unit "${unit.unitId}" has no registered multi-route contributor coverage`,
      ).toBeDefined();
      for (const relativePath of coverage ?? []) {
        const absolute = nodePath.join(packageSrc, relativePath);
        expect(
          nodeFs.existsSync(absolute),
          `Registered coverage for "${unit.unitId}" does not exist: ${relativePath}`,
        ).toBe(true);
        const content = nodeFs.readFileSync(absolute, "utf8");
        expect(
          content.includes("pack-a") && content.includes("pack-b"),
          `Registered coverage for "${unit.unitId}" must span members of two different Packs: ${relativePath}`,
        ).toBe(true);
      }
    }
  });

  it("rejects coverage registrations for unknown units", () => {
    const declared = new Set(aggregateOwnershipUnits.map((unit) => unit.unitId));
    for (const unitId of Object.keys(registeredCoverage)) {
      expect(declared.has(unitId), `Unknown aggregate unit in coverage registry: ${unitId}`).toBe(
        true,
      );
    }
  });

  it("keeps marker primitives and render-input construction inside projection planning", () => {
    const offenders = productionTypeScriptFiles(packageSrc)
      .filter((file) => !file.includes(`${nodePath.sep}projection${nodePath.sep}`))
      .filter((file) => {
        const source = nodeFs.readFileSync(file, "utf8");
        return source.includes("projection/markers") || source.includes("managed-files");
      })
      .map((file) => nodePath.relative(packageSrc, file));
    expect(offenders).toEqual([]);

    const planningSource = nodeFs.readFileSync(
      nodePath.join(packageSrc, "projection", "planning.ts"),
      "utf8",
    );
    expect(planningSource).toContain("ProjectionRenderInputTypeId");
    expect(planningSource).toContain("planAggregateProjection");
    expect(planningSource).toContain("planSingletonProjection");
  });

  it("routes every ownership-unit cardinality through shared plans", () => {
    const aggregateParticipants = ["rules/manager.ts", "hooks/manager.ts", "knowledge/manager.ts"];
    for (const relativePath of aggregateParticipants) {
      expect(nodeFs.readFileSync(nodePath.join(packageSrc, relativePath), "utf8")).toContain(
        "planAggregateProjection",
      );
    }

    const singletonParticipants = [
      "skills/manager.ts",
      "subagents/manager.ts",
      "mcps/manager.ts",
      "mcps/operations/install.ts",
      "mcps/operations/enable.ts",
    ];
    for (const relativePath of singletonParticipants) {
      expect(nodeFs.readFileSync(nodePath.join(packageSrc, relativePath), "utf8")).toContain(
        "planSingletonProjection",
      );
    }

    const serviceContract = nodeFs.readFileSync(
      nodePath.join(packageSrc, "workspace", "service-interface.ts"),
      "utf8",
    );
    expect(serviceContract).not.toContain("reconcileProjections");
  });
});
